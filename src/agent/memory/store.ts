/**
 * 记忆分类存储
 * 支持按类型分类存储记忆（JSON + JSONL 格式）
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { MemoryItem, MemoryType, MemoryStats, MemoryStoreInterface } from "./types.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MemoryStore" });

// 存储文件名映射
const MEMORY_FILES: Record<MemoryType, string> = {
  identity: "identity.json",
  preference: "preferences.json",
  habit: "habits.json",
  event: "events.jsonl",
};

/**
 * 分类记忆存储
 * 支持按类型分别存储
 */
export class MemoryStore implements MemoryStoreInterface {
  private memoryDir: string;
  private items: Map<string, MemoryItem> = new Map();

  constructor(workspace: string) {
    this.memoryDir = join(workspace, "memory", "structured");
    this.ensureDir();
    this.loadAll();
  }

  /**
   * 确保目录存在
   */
  private ensureDir(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  /**
   * 获取指定类型的文件路径
   */
  private getTypePath(type: MemoryType): string {
    return join(this.memoryDir, MEMORY_FILES[type]);
  }

  /**
   * 加载所有分类的记忆
   */
  private loadAll(): void {
    for (const type of Object.keys(MEMORY_FILES) as MemoryType[]) {
      this.loadByType(type);
    }
    logger.debug("Loaded %d memory items", this.items.size);
  }

  /**
   * 加载指定类型的记忆
   */
  private loadByType(type: MemoryType): void {
    const path = this.getTypePath(type);
    if (!existsSync(path)) return;

    try {
      const content = readFileSync(path, "utf-8");

      if (type === "event") {
        // JSONL 格式 - 每行一个 JSON 对象
        const lines = content.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          const item = JSON.parse(line) as MemoryItem;
          // 转换日期字符串为 Date 对象
          item.created_at = new Date(item.created_at);
          item.last_accessed = new Date(item.last_accessed);
          this.items.set(item.id, item);
        }
      } else {
        // JSON 格式 - 数组
        const items = JSON.parse(content) as MemoryItem[];
        for (const item of items) {
          item.created_at = new Date(item.created_at);
          item.last_accessed = new Date(item.last_accessed);
          this.items.set(item.id, item);
        }
      }
    } catch (error) {
      logger.error("Failed to load %s memories: %s", type, String(error));
    }
  }

  /**
   * 保存指定类型的记忆
   */
  private saveByType(type: MemoryType): void {
    const items = Array.from(this.items.values()).filter((item) => item.type === type);
    const path = this.getTypePath(type);

    try {
      if (type === "event") {
        // JSONL 格式
        const lines = items.map((item) => JSON.stringify(item));
        writeFileSync(path, lines.join("\n"), "utf-8");
      } else {
        // JSON 格式
        writeFileSync(path, JSON.stringify(items, null, 2), "utf-8");
      }
    } catch (error) {
      logger.error("Failed to save %s memories: %s", type, String(error));
    }
  }

  /**
   * 添加记忆
   */
  async add(item: MemoryItem): Promise<void> {
    this.items.set(item.id, item);
    this.saveByType(item.type);
    logger.debug("Added memory: %s (%s)", item.id, item.type);
  }

  /**
   * 根据 ID 获取记忆
   */
  async getById(id: string): Promise<MemoryItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    // 更新访问信息
    item.last_accessed = new Date();
    item.access_count++;
    this.saveByType(item.type);

    return item;
  }

  /**
   * 获取指定类型的记忆
   */
  async getByType(type: string): Promise<MemoryItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.type === type)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    return Array.from(this.items.values())
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * 更新记忆
   */
  async update(item: MemoryItem): Promise<void> {
    if (!this.items.has(item.id)) {
      throw new Error(`Memory item not found: ${item.id}`);
    }
    this.items.set(item.id, item);
    this.saveByType(item.type);
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;

    this.items.delete(id);
    this.saveByType(item.type);
    logger.debug("Deleted memory: %s", id);
  }

  /**
   * 搜索记忆（简单文本匹配）
   */
  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    const lowerQuery = query.toLowerCase();
    const results = Array.from(this.items.values())
      .filter((item) => item.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        // 按访问次数和创建时间排序
        const scoreA = a.access_count * 10 + (Date.now() - a.created_at.getTime());
        const scoreB = b.access_count * 10 + (Date.now() - b.created_at.getTime());
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return results;
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<MemoryStats> {
    const items = Array.from(this.items.values());
    const byType: Record<MemoryType, number> = {
      identity: 0,
      preference: 0,
      habit: 0,
      event: 0,
    };

    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const item of items) {
      byType[item.type]++;
      if (!oldest || item.created_at < oldest) oldest = item.created_at;
      if (!newest || item.created_at > newest) newest = item.created_at;
    }

    return {
      total: items.length,
      byType,
      oldest,
      newest,
    };
  }

  /**
   * 批量删除
   */
  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) {
        this.items.delete(id);
        deleted++;
      }
    }

    // 按类型重新保存
    const types = new Set(ids.map((id) => this.items.get(id)?.type).filter(Boolean)) as Set<MemoryType>;
    for (const type of types) {
      this.saveByType(type);
    }

    return deleted;
  }

  /**
   * 获取所有 ID
   */
  async getAllIds(): Promise<string[]> {
    return Array.from(this.items.keys());
  }
}
