/**
 * 记忆检索接口
 * 统一入口，整合向量检索和存储
 */

import type { MemoryItem, MemorySearchResult, MemoryType } from "./types.js";
import { MemoryStore } from "./store.js";
import { VectorStore } from "./vector-store.js";
import { EmbeddingService } from "./embedding.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MemorySearch" });

/**
 * 检索选项
 */
export interface SearchOptions {
  // 限制返回数量
  limit?: number;
  // 记忆类型过滤
  types?: MemoryType[];
  // 最小置信度
  minConfidence?: number;
  // 是否使用向量检索
  useVector?: boolean;
}

/**
 * 记忆检索接口
 * 提供统一的记忆存取和检索能力
 */
export class MemorySearch {
  private store: MemoryStore;
  private vectorStore: VectorStore | null = null;
  private embeddingService: EmbeddingService;

  constructor(workspace: string, embeddingService: EmbeddingService) {
    this.store = new MemoryStore(workspace);
    this.embeddingService = embeddingService;
  }

  /**
   * 初始化向量存储
   */
  async initialize(): Promise<void> {
    if (!this.embeddingService.isConfigured()) {
      logger.warn("Embedding service not configured, vector search disabled");
      return;
    }

    this.vectorStore = new VectorStore(
      // 获取 workspace 路径
      this.store["memoryDir"].replace("/memory/structured", ""),
      this.embeddingService
    );
    await this.vectorStore.initialize();
    logger.debug("Memory search initialized with vector support");
  }

  /**
   * 添加记忆（同时写入结构化存储和向量存储）
   */
  async add(item: MemoryItem): Promise<void> {
    // 写入结构化存储
    await this.store.add(item);

    // 写入向量存储（如果可用）
    if (this.vectorStore?.isInitialized()) {
      try {
        await this.vectorStore.add(item);
      } catch (error) {
        logger.error("Failed to add to vector store: %s", String(error));
      }
    }
  }

  /**
   * 批量添加记忆
   */
  async addMany(items: MemoryItem[]): Promise<void> {
    if (items.length === 0) return;

    // 批量写入结构化存储
    for (const item of items) {
      await this.store.add(item);
    }

    // 批量写入向量存储（如果可用）
    if (this.vectorStore?.isInitialized()) {
      try {
        await this.vectorStore.addMany(items);
      } catch (error) {
        logger.error("Failed to add to vector store: %s", String(error));
      }
    }
  }

  /**
   * 检索记忆
   * @param query 查询文本
   * @param options 检索选项
   */
  async search(query: string, options: SearchOptions = {}): Promise<MemorySearchResult[]> {
    const { limit = 5, types, minConfidence, useVector = false } = options;

    let items: MemoryItem[];

    // 向量搜索（可能因 Bun + LanceDB 兼容性问题报错，自动回退到文本搜索）
    if (useVector && this.vectorStore?.isInitialized()) {
      try {
        items = await this.vectorStore.search(query, limit * 2);
      } catch (error) {
        logger.error("Vector search failed, falling back to text search: %s", String(error));
        items = await this.store.search(query, limit * 2);
      }
    } else {
      // 回退到文本搜索
      items = await this.store.search(query, limit * 2);
    }

    // 应用过滤条件
    let filtered = items;

    // 按类型过滤
    if (types && types.length > 0) {
      filtered = filtered.filter((item) => types.includes(item.type));
    }

    // 按置信度过滤
    if (minConfidence !== undefined) {
      filtered = filtered.filter((item) => item.confidence >= minConfidence);
    }

    // 限制数量并转换为结果格式
    const results: MemorySearchResult[] = filtered.slice(0, limit).map((item) => ({
      item,
      score: item.confidence * item.importance, // 简单评分
    }));

    // 更新访问信息
    for (const result of results) {
      await this.store.getById(result.item.id); // 这会更新访问次数
    }

    return results;
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    return this.store.getAll();
  }

  /**
   * 获取指定类型的记忆
   */
  async getByType(type: MemoryType): Promise<MemoryItem[]> {
    return this.store.getByType(type);
  }

  /**
   * 根据 ID 获取记忆
   */
  async getById(id: string): Promise<MemoryItem | null> {
    return this.store.getById(id);
  }

  /**
   * 更新记忆
   */
  async update(item: MemoryItem): Promise<void> {
    await this.store.update(item);

    if (this.vectorStore?.isInitialized()) {
      try {
        await this.vectorStore.update(item);
      } catch (error) {
        logger.error("Failed to update in vector store: %s", String(error));
      }
    }
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.store.delete(id);

    if (this.vectorStore?.isInitialized()) {
      try {
        await this.vectorStore.delete(id);
      } catch (error) {
        logger.error("Failed to delete from vector store: %s", String(error));
      }
    }
  }

  /**
   * 获取记忆统计
   */
  async getStats() {
    return this.store.getStats();
  }

  /**
   * 检查向量检索是否可用
   */
  isVectorSearchEnabled(): boolean {
    return this.vectorStore?.isInitialized() ?? false;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }
}
