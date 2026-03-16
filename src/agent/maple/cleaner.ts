/**
 * MAPLE 用户画像清理器
 *
 * 负责自动维护用户画像中的洞察数据：
 * - 相似内容去重（基于词级别 Jaccard 相似度）
 * - 置信度过滤（低于阈值的移除）
 * - 时间过滤（超过天数的移除）
 * 数量限制（超过最大数量的裁剪）
 */

import type { Insight, UserProfile } from "./types.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MAPLE:Cleaner" });

/**
 * 清理配置
 */
export interface CleanerConfig {
  /** 最多保留的洞察数量，默认 100 */
  maxInsights: number;
  /** 超过多少天的洞察自动清理，默认 90 */
  maxAgeDays: number;
  /** 低于此置信度的洞察自动清理，默认 0.6 */
  minConfidence: number;
  /** 相似内容去重阈值（0-1），默认 0.85 */
  similarityThreshold: number;
}

/**
 * 默认清理配置
 */
export const DEFAULT_CLEANER_CONFIG: CleanerConfig = {
  maxInsights: 100,
  maxAgeDays: 90,
  minConfidence: 0.6,
  similarityThreshold: 0.85,
};

/**
 * 用户画像清理器
 *
 * 提供多种清理策略，可单独使用也可组合使用
 */
export class ProfileCleaner {
  private readonly config: CleanerConfig;

  constructor(config: Partial<CleanerConfig> = {}) {
    this.config = { ...DEFAULT_CLEANER_CONFIG, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): CleanerConfig {
    return { ...this.config };
  }

  /**
   * 执行完整清理流程
   * 清理顺序：先去重 → 再按置信度过滤 → 再按时间过滤 → 最后限制数量
   *
   * @param profile 用户画像
   * @returns 清理后的用户画像（新的对象引用）
   */
  clean(profile: UserProfile): UserProfile {
    if (profile.insights.length === 0) {
      return profile;
    }

    let insights = [...profile.insights];

    // 1. 相似内容去重
    insights = this.deduplicateBySimilarity(insights);

    // 2. 置信度过滤
    insights = this.filterByConfidence(insights);

    // 3. 时间过滤
    insights = this.filterByAge(insights);

    // 4. 数量限制
    insights = this.limitByCount(insights);

    // 如果洞察有变化，返回新画像
    if (insights.length !== profile.insights.length) {
      logger.info(
        "[MAPLE:Cleaner] 清理完成: %d 条洞察 → %d 条",
        profile.insights.length,
        insights.length
      );
      return {
        ...profile,
        insights,
        updatedAt: new Date().toISOString(),
      };
    }

    return profile;
  }

  /**
   * 相似内容去重
   *
   * 使用词级别 Jaccard 相似度：
   * 1. 将每条洞察分词为词集合
   * 2. 计算两个集合的 Jaccard 相似度 = |A ∩ B| / |A ∪ B|
   * 3. 相似度 >= 阈值时，保留置信度较高的那条
   *
   * @param insights 洞察列表
   * @returns 去重后的洞察列表
   */
  deduplicateBySimilarity(insights: Insight[]): Insight[] {
    if (insights.length <= 1) {
      return insights;
    }

    // 按置信度降序排序，保留高置信度的
    const sorted = [...insights].sort((a, b) => b.confidence - a.confidence);
    const result: Insight[] = [];

    for (const current of sorted) {
      const isDuplicate = result.some((existing) => {
        const similarity = this.computeSimilarity(existing.content, current.content);
        return similarity >= this.config.similarityThreshold;
      });

      if (!isDuplicate) {
        result.push(current);
      }
    }

    return result;
  }

  /**
   * 置信度过滤
   *
   * @param insights 洞察列表
   * @returns 过滤后的洞察列表
   */
  filterByConfidence(insights: Insight[]): Insight[] {
    return insights.filter((i) => i.confidence >= this.config.minConfidence);
  }

  /**
   * 时间过滤
   *
   * 移除创建时间超过 maxAgeDays 天的洞察
   *
   * @param insights 洞察列表
   * @returns 过滤后的洞察列表
   */
  filterByAge(insights: Insight[]): Insight[] {
    const now = Date.now();
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;

    return insights.filter((i) => {
      const createdAt = new Date(i.createdAt).getTime();
      return now - createdAt < maxAgeMs;
    });
  }

  /**
   * 数量限制
   *
   * 保留最新的 N 条洞察（按创建时间降序）
   *
   * @param insights 洞察列表
   * @returns 裁剪后的洞察列表
   */
  limitByCount(insights: Insight[]): Insight[] {
    if (insights.length <= this.config.maxInsights) {
      return insights;
    }

    // 按创建时间降序排序，保留最新的
    return [...insights]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, this.config.maxInsights);
  }

  /**
   * 计算两个字符串的词级别 Jaccard 相似度
   *
   * 分词策略：
   * 1. 转小写
   * 2. 移除非字母数字字符
   * 3. 按空白字符分割为词
   *
   * @param a 字符串 A
   * @param b 字符串 B
   * @returns 相似度 [0, 1]
   */
  private computeSimilarity(a: string, b: string): number {
    if (a === b) {
      return 1;
    }

    const wordsA = this.tokenize(a);
    const wordsB = this.tokenize(b);

    if (wordsA.size === 0 || wordsB.size === 0) {
      return 0;
    }

    // 计算交集
    const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));

    // 计算并集
    const union = new Set([...wordsA, ...wordsB]);

    // Jaccard 相似度
    return intersection.size / union.size;
  }

  /**
   * 分词：将字符串转换为词集合
   *
   * @param text 文本
   * @returns 词集合
   */
  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        // 移除非字母数字字符
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, " ")
        // 按空白字符分割
        .split(/\s+/)
        // 过滤空词
        .filter((word) => word.length > 0)
    );
  }
}
