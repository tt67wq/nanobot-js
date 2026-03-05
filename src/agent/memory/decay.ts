/**
 * 记忆衰减机制
 * 自动清理过时/低价值记忆
 */

import type { MemoryItem, DecayResult, MemoryType } from "./types.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MemoryDecay" });

// 默认衰减配置
export interface DecayConfig {
  // 低重要性阈值 - 低于此值且超过最大天数会被删除
  lowImportanceThreshold: number;
  // 低重要性记忆的最大保留天数
  lowImportanceMaxDays: number;
  // 从未被访问的记忆最大保留天数
  neverAccessedMaxDays: number;
  // 每次检查的最大清理数量
  maxCleanupPerRun: number;
}

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  lowImportanceThreshold: 0.3,
  lowImportanceMaxDays: 30,
  neverAccessedMaxDays: 90,
  maxCleanupPerRun: 50,
};

/**
 * 记忆衰减器
 * 用于自动清理过时/低价值记忆
 */
export class MemoryDecay {
  private config: DecayConfig;

  constructor(config: Partial<DecayConfig> = {}) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }

  /**
   * 检查单个记忆是否应该被衰减
   * @param item 记忆项
   * @returns 是否应该衰减
   */
  shouldDecay(item: MemoryItem): boolean {
    const now = Date.now();
    const daysSinceAccess = (now - item.last_accessed.getTime()) / 86400000;
    const daysSinceCreated = (now - item.created_at.getTime()) / 86400000;

    // 规则 1: 低重要性且长时间未访问
    if (item.importance < this.config.lowImportanceThreshold && daysSinceAccess > this.config.lowImportanceMaxDays) {
      return true;
    }

    // 规则 2: 从未被访问且创建时间超过最大天数
    if (item.access_count === 0 && daysSinceCreated > this.config.neverAccessedMaxDays) {
      return true;
    }

    // 规则 3: 极低置信度的记忆（低于 0.3）且超过 7 天
    if (item.confidence < 0.3 && daysSinceCreated > 7) {
      return true;
    }

    return false;
  }

  /**
   * 计算记忆的衰减分数（用于排序）
   * @param item 记忆项
   * @returns 衰减分数，越高越应该被清理
   */
  getDecayScore(item: MemoryItem): number {
    const now = Date.now();
    const daysSinceAccess = (now - item.last_accessed.getTime()) / 86400000;
    const daysSinceCreated = (now - item.created_at.getTime()) / 86400000;

    let score = 0;

    // 重要性贡献（重要性越低，分数越高）
    if (item.importance < this.config.lowImportanceThreshold) {
      score += (this.config.lowImportanceThreshold - item.importance) * 100;
    }

    // 访问频率贡献（访问次数越少，分数越高）
    score += Math.max(0, 10 - item.access_count);

    // 时间贡献（时间越久远，分数越高）
    score += daysSinceAccess / 10;
    score += daysSinceCreated / 20;

    // 置信度贡献（置信度越低，分数越高）
    if (item.confidence < 0.5) {
      score += (0.5 - item.confidence) * 20;
    }

    return score;
  }

  /**
   * 检查一组记忆，返回应该被删除的记忆
   * @param items 记忆列表
   * @returns 衰减结果
   */
  checkDecay(items: MemoryItem[]): DecayResult {
    const toDecay: MemoryItem[] = [];

    for (const item of items) {
      if (this.shouldDecay(item)) {
        toDecay.push(item);
      }
    }

    // 按衰减分数排序，优先删除分数高的
    toDecay.sort((a, b) => this.getDecayScore(b) - this.getDecayScore(a));

    // 限制每次清理的数量
    const limited = toDecay.slice(0, this.config.maxCleanupPerRun);

    return {
      decayed: limited.length,
      items: limited,
    };
  }

  /**
   * 获取需要检查的记忆（用于惰性检查）
   * @param items 记忆列表
   * @returns 需要检查的记忆（按优先级排序）
   */
  getItemsToCheck(items: MemoryItem[]): MemoryItem[] {
    return items
      .filter((item) => !this.shouldDecay(item))
      .sort((a, b) => this.getDecayScore(b) - this.getDecayScore(a));
  }

  /**
   * 获取衰减统计信息
   * @param items 记忆列表
   * @returns 统计信息
   */
  getDecayStats(items: MemoryItem[]): {
    total: number;
    toDecay: number;
    byType: Record<MemoryType, number>;
    oldestItem: Date | null;
    newestItem: Date | null;
  } {
    const result = this.checkDecay(items);
    const byType: Record<MemoryType, number> = {
      identity: 0,
      preference: 0,
      habit: 0,
      event: 0,
    };

    let oldestItem: Date | null = null;
    let newestItem: Date | null = null;

    for (const item of items) {
      if (!oldestItem || item.created_at < oldestItem) {
        oldestItem = item.created_at;
      }
      if (!newestItem || item.created_at > newestItem) {
        newestItem = item.created_at;
      }
    }

    for (const item of result.items) {
      byType[item.type]++;
    }

    return {
      total: items.length,
      toDecay: result.decayed,
      byType,
      oldestItem,
      newestItem,
    };
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<DecayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): DecayConfig {
    return { ...this.config };
  }
}

// 导出单例
export const memoryDecay = new MemoryDecay();
