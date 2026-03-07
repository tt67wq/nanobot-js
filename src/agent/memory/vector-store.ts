/**
 * bun:sqlite 向量存储封装
 * 用于记忆的语义检索，替代 LanceDB 避免 Bun 兼容性问题
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MemoryItem, MemoryType, MemorySource } from "./types.js";
import type { EmbeddingService } from "./embedding.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "VectorStore" });

const MAX_MEMORIES = 2000;
const CLEANUP_BATCH = 100;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  confidence: number;
  source: string;
  importance: number;
  created_at: string;
  last_accessed: string;
  access_count: number;
  vector: string;
}

function rowToMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    type: row.type as MemoryType,
    content: row.content,
    confidence: row.confidence,
    source: row.source as MemorySource,
    importance: row.importance,
    created_at: new Date(row.created_at),
    last_accessed: new Date(row.last_accessed),
    access_count: row.access_count,
  };
}

/**
 * 记忆向量存储
 * 使用 bun:sqlite 进行语义检索
 */
export class VectorStore {
  private db: Database | null = null;
  private embeddingService: EmbeddingService;
  private dbPath: string;
  private dbFilePath: string;
  private initialized = false;
  private vectorCache: Map<string, number[]> = new Map();

  constructor(workspace: string, embeddingService: EmbeddingService) {
    this.dbPath = join(workspace, "memory");
    this.dbFilePath = join(workspace, "memory", "sqlite-vectors.db");
    this.embeddingService = embeddingService;
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保目录存在
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    this.db = new Database(this.dbFilePath);

    // WAL 模式提升并发性能
    this.db.run("PRAGMA journal_mode = WAL");

    // 建表和索引
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        content       TEXT NOT NULL,
        confidence    REAL NOT NULL,
        source        TEXT NOT NULL,
        importance    REAL NOT NULL,
        created_at    TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        access_count  INTEGER NOT NULL DEFAULT 0,
        vector        TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)
    `);

    // 预热向量缓存
    const rows = this.db.query("SELECT id, vector FROM memories").all() as { id: string; vector: string }[];
    for (const row of rows) {
      this.vectorCache.set(row.id, JSON.parse(row.vector));
    }

    this.initialized = true;
    logger.debug("Vector store initialized at %s (%d cached)", this.dbFilePath, this.vectorCache.size);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 添加记忆到向量库
   */
  async add(item: MemoryItem): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // 超出上限时触发衰减清理
    if (this.vectorCache.size >= MAX_MEMORIES) {
      await this.pruneByDecay(CLEANUP_BATCH);
    }

    const embedding = await this.embeddingService.getEmbedding(item.content);

    this.db.run(
      `INSERT OR REPLACE INTO memories
        (id, type, content, confidence, source, importance, created_at, last_accessed, access_count, vector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.type,
        item.content,
        item.confidence,
        item.source,
        item.importance,
        item.created_at.toISOString(),
        item.last_accessed.toISOString(),
        item.access_count,
        JSON.stringify(embedding),
      ]
    );

    this.vectorCache.set(item.id, embedding);
    logger.debug("Added memory to vector store: %s", item.id);
  }

  /**
   * 批量添加记忆
   */
  async addMany(items: MemoryItem[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (items.length === 0) return;

    const embeddings = await this.embeddingService.getEmbeddings(items.map((item) => item.content));

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO memories
        (id, type, content, confidence, source, importance, created_at, last_accessed, access_count, vector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const rows: (string | number)[][] = items.map((item, i) => [
      item.id,
      item.type,
      item.content,
      item.confidence,
      item.source,
      item.importance,
      item.created_at.toISOString(),
      item.last_accessed.toISOString(),
      item.access_count,
      JSON.stringify(embeddings[i]),
    ]);

    const insertAll = this.db.transaction((rowList: (string | number)[][]) => {
      for (const row of rowList) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert.run(...(row as any[]));
      }
    });

    insertAll(rows);

    for (let i = 0; i < items.length; i++) {
      this.vectorCache.set(items[i].id, embeddings[i]);
    }

    logger.debug("Added %d memories to vector store", items.length);
  }

  /**
   * 语义检索记忆
   */
  async search(query: string, limit: number = 5, types?: MemoryType[]): Promise<MemoryItem[]> {
    if (!this.db) throw new Error("Database not initialized");

    const queryVec = await this.embeddingService.getEmbedding(query);

    // 按 type 过滤时，先从库中取允许的 id 集合
    let allowedIds: Set<string> | null = null;
    if (types && types.length > 0) {
      const placeholders = types.map(() => "?").join(",");
      const rows = this.db.query(
        `SELECT id FROM memories WHERE type IN (${placeholders})`
      ).all(...types) as { id: string }[];
      allowedIds = new Set(rows.map((r) => r.id));
    }

    // 遍历内存缓存计算余弦相似度
    const scored: Array<{ id: string; score: number }> = [];
    for (const [id, vec] of this.vectorCache) {
      if (allowedIds && !allowedIds.has(id)) continue;
      scored.push({ id, score: cosineSimilarity(queryVec, vec) });
    }

    scored.sort((a, b) => b.score - a.score);
    const topIds = scored.slice(0, limit).map((s) => s.id);

    // 按 id 查完整记录
    return topIds.map((id) => {
      const row = this.db!.query("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow;
      return rowToMemoryItem(row);
    });
  }

  /**
   * 更新记忆
   */
  async update(item: MemoryItem): Promise<void> {
    await this.delete(item.id);
    await this.add(item);
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.run("DELETE FROM memories WHERE id = ?", [id]);
    this.vectorCache.delete(id);
    logger.debug("Deleted memory from vector store: %s", id);
  }

  /**
   * 批量删除
   */
  async deleteMany(ids: string[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (ids.length === 0) return;

    const del = this.db.prepare("DELETE FROM memories WHERE id = ?");
    const deleteAll = this.db.transaction((idList: string[]) => {
      for (const id of idList) {
        del.run(id);
      }
    });
    deleteAll(ids);

    for (const id of ids) {
      this.vectorCache.delete(id);
    }
    logger.debug("Deleted %d memories from vector store", ids.length);
  }

  /**
   * 获取所有记忆数量
   */
  async count(): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    const row = this.db.query("SELECT COUNT(*) as count FROM memories").get() as { count: number };
    return row.count;
  }

  /**
   * 重新构建索引（空操作，接口保留）
   */
  async rebuildIndex(): Promise<void> {
    logger.debug("Index rebuild requested (bun:sqlite handles this automatically)");
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.vectorCache.clear();
    this.initialized = false;
    logger.debug("Vector store closed");
  }

  /**
   * 按衰减分删除最低价值的记忆
   */
  private async pruneByDecay(count: number): Promise<void> {
    if (!this.db) return;

    const rows = this.db.query(
      `SELECT id FROM memories
       ORDER BY (importance * confidence / (access_count + 1)) ASC
       LIMIT ?`
    ).all(count) as { id: string }[];

    await this.deleteMany(rows.map((r) => r.id));
    logger.debug("Pruned %d low-value memories", rows.length);
  }
}
