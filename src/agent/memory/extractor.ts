/**
 * 记忆提取器
 * 从用户消息中提取记忆，使用规则引擎
 */

import { memoryRules, type RuleMatch } from "./rules.js";
import type { MemoryItem, MemoryInput } from "./types.js";
import { createMemoryItem } from "./types.js";

// 存储接口 - 由 store.ts 实现
export interface MemoryStoreInterface {
  add(item: MemoryItem): Promise<void>;
  getById(id: string): Promise<MemoryItem | null>;
  getByType(type: string): Promise<MemoryItem[]>;
  getAll(): Promise<MemoryItem[]>;
  update(item: MemoryItem): Promise<void>;
  delete(id: string): Promise<void>;
  search(query: string, limit?: number): Promise<MemoryItem[]>;
}

/**
 * 记忆提取器配置
 */
export interface ExtractorConfig {
  // 是否启用自动提取
  enabled: boolean;
  // 是否在提取后立即写入存储
  autoStore: boolean;
  // 置信度阈值 - 只有超过此值的记忆才会被存储
  confidenceThreshold: number;
  // 是否允许重复内容（相似内容是否覆盖）
  allowDuplicates: boolean;
  // 相似度阈值 - 用于判断是否是重复内容
  similarityThreshold: number;
}

// 默认配置
export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  enabled: true,
  autoStore: true,
  confidenceThreshold: 0.7,
  allowDuplicates: false,
  similarityThreshold: 0.9,
};

/**
 * 记忆提取器类
 */
export class MemoryExtractor {
  private store: MemoryStoreInterface | null = null;
  private config: ExtractorConfig;

  constructor(config: Partial<ExtractorConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
  }

  /**
   * 设置存储后端
   * @param store 存储实例
   */
  setStore(store: MemoryStoreInterface): void {
    this.store = store;
  }

  /**
   * 从文本中提取记忆
   * @param text 用户消息
   * @returns 提取到的记忆列表
   */
  extract(text: string): MemoryInput[] {
    const matches = memoryRules.extract(text);

    // 过滤低于置信度阈值的记忆
    const validMatches = matches.filter(
      (m) => m.confidence >= this.config.confidenceThreshold
    );

    // 转换为 MemoryInput
    return validMatches.map((m) => memoryRules.toMemoryInput(m));
  }

  /**
   * 检查文本是否包含可提取的记忆
   * @param text 用户消息
   * @returns 是否包含可提取的记忆
   */
  hasMemory(text: string): boolean {
    const matches = memoryRules.extract(text);
    return matches.some((m) => m.confidence >= this.config.confidenceThreshold);
  }

  /**
   * 提取并存储记忆（如果配置了存储）
   * @param text 用户消息
   * @returns 提取到的记忆列表
   */
  async extractAndStore(text: string): Promise<MemoryItem[]> {
    const inputs = this.extract(text);

    if (inputs.length === 0) {
      return [];
    }

    // 如果没有配置存储，返回 MemoryItem 列表（不存储）
    if (!this.store || !this.config.autoStore) {
      return inputs.map((input) => createMemoryItem(input));
    }

    const stored: MemoryItem[] = [];

    for (const input of inputs) {
      // 检查是否允许重复
      if (!this.config.allowDuplicates) {
        const existing = await this.store.search(input.content, 1);
        if (existing.length > 0) {
          // 已存在相似内容，跳过
          continue;
        }
      }

      // 创建记忆项
      const item = createMemoryItem(input);

      // 存储
      await this.store.add(item);
      stored.push(item);
    }

    return stored;
  }

  /**
   * 从文本中提取第一条记忆
   * @param text 用户消息
   * @returns 第一个匹配的记忆或 null
   */
  extractFirst(text: string): MemoryInput | null {
    const match = memoryRules.extractFirst(text);
    if (!match) return null;

    if (match.confidence < this.config.confidenceThreshold) {
      return null;
    }

    return memoryRules.toMemoryInput(match);
  }

  /**
   * 批量提取记忆
   * @param texts 用户消息列表
   * @returns 所有提取到的记忆
   */
  extractBatch(texts: string[]): MemoryInput[] {
    return texts.flatMap((text) => this.extract(text));
  }

  /**
   * 获取配置
   * @returns 当前配置
   */
  getConfig(): ExtractorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<ExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// 导出单例
export const memoryExtractor = new MemoryExtractor();
