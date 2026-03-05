/**
 * LanceDB 向量存储封装
 * 用于记忆的语义检索
 */

import * as vectordb from "vectordb";
import { makeArrowTable } from "vectordb";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MemoryItem, MemoryType, MemorySource } from "./types.js";
import type { EmbeddingService } from "./embedding.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "VectorStore" });

// 表名
const MEMORY_TABLE = "memories";

// 全局初始化标志，避免重复初始化
let globalInitialized = false;

/**
 * 记忆向量存储
 * 使用 LanceDB 进行语义检索
 */
export class VectorStore {
  private db: vectordb.Connection | null = null;
  private embeddingService: EmbeddingService;
  private dbPath: string;
  private initialized = false;

  constructor(workspace: string, embeddingService: EmbeddingService) {
    this.dbPath = join(workspace, "memory", "vectors");
    this.embeddingService = embeddingService;
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    // 避免重复初始化（全局单例）
    if (globalInitialized) {
      this.initialized = true;
      return;
    }
    
    if (this.initialized) return;

    // 确保目录存在
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    try {
      this.db = await vectordb.connect(this.dbPath);
      await this.ensureTable();
      this.initialized = true;
      globalInitialized = true;
      logger.debug("Vector store initialized at %s", this.dbPath);
    } catch (error) {
      logger.error("Failed to initialize vector store: %s", String(error));
      throw error;
    }
  }

  /**
   * 确保表存在
   */
  private async ensureTable(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const tables = await this.db.tableNames();
    if (!tables.includes(MEMORY_TABLE)) {
      // 创建表时需要定义 schema
      // 使用 makeArrowTable 创建一个带 schema 的空表
      const emptyData = [{
        id: "__init__",
        type: "identity" as const,
        content: "__init__",
        confidence: 0,
        source: "explicit" as const,
        importance: 0,
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        access_count: 0,
        vector: new Array(this.embeddingService.getDimensions()).fill(0),
      }];
      
      const table = await this.db.createTable(MEMORY_TABLE, makeArrowTable(emptyData));
      
      // 删除初始化记录
      await table.delete('id = "__init__"');
      
      logger.debug("Created memory table with schema");
    }
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

    // 获取 embedding
    const embedding = await this.embeddingService.getEmbedding(item.content);

    // 准备数据
    const data = [
      {
        id: item.id,
        type: item.type,
        content: item.content,
        confidence: item.confidence,
        source: item.source,
        importance: item.importance,
        created_at: item.created_at.toISOString(),
        last_accessed: item.last_accessed.toISOString(),
        access_count: item.access_count,
        vector: embedding,
      },
    ];

    // 添加到表
    const table = await this.db.openTable(MEMORY_TABLE);
    await table.add(makeArrowTable(data));
    logger.debug("Added memory to vector store: %s", item.id);
  }

  /**
   * 批量添加记忆
   */
  async addMany(items: MemoryItem[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (items.length === 0) return;

    // 批量获取 embeddings
    const embeddings = await this.embeddingService.getEmbeddings(
      items.map((item) => item.content)
    );

    // 准备数据
    const data = items.map((item, i) => ({
      id: item.id,
      type: item.type,
      content: item.content,
      confidence: item.confidence,
      source: item.source,
      importance: item.importance,
      created_at: item.created_at.toISOString(),
      last_accessed: item.last_accessed.toISOString(),
      access_count: item.access_count,
      vector: embeddings[i],
    }));

    // 批量添加
    const table = await this.db.openTable(MEMORY_TABLE);
    await table.add(makeArrowTable(data));
    logger.debug("Added %d memories to vector store", items.length);
  }

  /**
   * 语义检索记忆
   */
  async search(query: string, limit: number = 5): Promise<MemoryItem[]> {
    if (!this.db) throw new Error("Database not initialized");

    // 获取查询的 embedding
    const embedding = await this.embeddingService.getEmbedding(query);

    // 执行向量搜索
    const table = await this.db.openTable(MEMORY_TABLE);
    const results = await table
      .search(embedding)
      .limit(limit)
      .execute();

    // 转换为 MemoryItem
    const items: MemoryItem[] = [];
    for (const row of results as Record<string, unknown>[]) {
      items.push({
        id: String(row.id),
        type: row.type as MemoryType,
        content: String(row.content),
        confidence: Number(row.confidence),
        source: row.source as MemorySource,
        importance: Number(row.importance),
        created_at: new Date(String(row.created_at)),
        last_accessed: new Date(String(row.last_accessed)),
        access_count: Number(row.access_count),
      });
    }

    return items;
  }

  /**
   * 更新记忆
   */
  async update(item: MemoryItem): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    // 先删除旧记录
    await this.delete(item.id);

    // 添加新记录
    await this.add(item);
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const table = await this.db.openTable(MEMORY_TABLE);
    await table.delete(`id = "${id}"`);
    logger.debug("Deleted memory from vector store: %s", id);
  }

  /**
   * 批量删除
   */
  async deleteMany(ids: string[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (ids.length === 0) return;

    const table = await this.db.openTable(MEMORY_TABLE);
    for (const id of ids) {
      await table.delete(`id = "${id}"`);
    }
    logger.debug("Deleted %d memories from vector store", ids.length);
  }

  /**
   * 获取所有记忆数量
   */
  async count(): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    const table = await this.db.openTable(MEMORY_TABLE);
    // 通过执行空查询获取 ArrowTable，然后获取长度
    const results = await table.search([0].fill(0)).limit(0).execute();
    return results.length;
  }

  /**
   * 重新构建索引（用于优化搜索性能）
   */
  async rebuildIndex(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const table = await this.db.openTable(MEMORY_TABLE);
    // LanceDB 自动维护索引，此处为保留接口
    logger.debug("Index rebuild requested (LanceDB handles this automatically)");
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    this.db = null;
    this.initialized = false;
    logger.debug("Vector store closed");
  }
}
