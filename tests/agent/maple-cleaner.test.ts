import { describe, it, expect } from "bun:test";
import { ProfileCleaner, DEFAULT_CLEANER_CONFIG, type CleanerConfig } from "../../src/agent/maple/cleaner.ts";
import { createDefaultProfile, type Insight } from "../../src/agent/maple/types.ts";

describe("ProfileCleaner", () => {
  // 创建测试用洞察
  const createInsight = (
    content: string,
    confidence: number,
    daysAgo: number,
  ): Insight => {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    return {
      id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      source: "llm",
      confidence,
      createdAt: createdAt.toISOString(),
      evidence: "test evidence",
    };
  };

  describe("constructor", () => {
    it("使用默认配置", () => {
      const cleaner = new ProfileCleaner();
      expect(cleaner.getConfig()).toEqual(DEFAULT_CLEANER_CONFIG);
    });

    it("接受自定义配置覆盖默认值", () => {
      const cleaner = new ProfileCleaner({ maxInsights: 50 });
      const config = cleaner.getConfig();
      expect(config.maxInsights).toBe(50);
      expect(config.maxAgeDays).toBe(DEFAULT_CLEANER_CONFIG.maxAgeDays);
    });
  });

  describe("clean() - 完整清理流程", () => {
    it("空洞察列表直接返回", () => {
      const profile = createDefaultProfile("test");
      const cleaner = new ProfileCleaner();
      const result = cleaner.clean(profile);
      expect(result.insights).toHaveLength(0);
    });

    it("洞察无变化时返回原对象", () => {
      const insight = createInsight("用户喜欢代码示例", 0.8, 0);
      const profile = createDefaultProfile("test");
      profile.insights = [insight];

      const cleaner = new ProfileCleaner({ maxInsights: 100, maxAgeDays: 90, minConfidence: 0.6 });
      const result = cleaner.clean(profile);

      expect(result.insights).toHaveLength(1);
    });
  });

  describe("deduplicateBySimilarity()", () => {
    it("无洞察时返回空列表", () => {
      const cleaner = new ProfileCleaner();
      const result = cleaner.deduplicateBySimilarity([]);
      expect(result).toHaveLength(0);
    });

    it("单条洞察直接返回", () => {
      const cleaner = new ProfileCleaner();
      const insights = [createInsight("用户喜欢代码示例", 0.8, 0)];
      const result = cleaner.deduplicateBySimilarity(insights);
      expect(result).toHaveLength(1);
    });

    it("完全相同内容只保留一条", () => {
      const cleaner = new ProfileCleaner({ similarityThreshold: 0.85 });
      const insights = [
        createInsight("用户喜欢代码示例", 0.9, 0),
        createInsight("用户喜欢代码示例", 0.8, 0),
      ];
      const result = cleaner.deduplicateBySimilarity(insights);
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.9); // 保留高置信度
    });

    it("不相似内容全部保留", () => {
      const cleaner = new ProfileCleaner({ similarityThreshold: 0.85 });
      const insights = [
        createInsight("用户喜欢代码示例", 0.8, 0),
        createInsight("用户偏好长文本解释", 0.8, 0),
      ];
      const result = cleaner.deduplicateBySimilarity(insights);
      expect(result).toHaveLength(2);
    });
  });

  describe("filterByConfidence()", () => {
    it("过滤低置信度洞察", () => {
      const cleaner = new ProfileCleaner({ minConfidence: 0.6 });
      const insights = [
        createInsight("洞察1", 0.9, 0),
        createInsight("洞察2", 0.5, 0), // 低于阈值
        createInsight("洞察3", 0.7, 0),
        createInsight("洞察4", 0.59, 0), // 低于阈值
      ];
      const result = cleaner.filterByConfidence(insights);
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.confidence).every((c) => c >= 0.6)).toBe(true);
    });
  });

  describe("filterByAge()", () => {
    it("过滤超过天数的洞察", () => {
      const cleaner = new ProfileCleaner({ maxAgeDays: 30 });
      const insights = [
        createInsight("洞察1", 0.8, 0),      // 今天
        createInsight("洞察2", 0.8, 10),     // 10天前
        createInsight("洞察3", 0.8, 29),     // 29天前
        createInsight("洞察4", 0.8, 31),     // 31天前 - 超过
        createInsight("洞察5", 0.8, 100),    // 100天前 - 超过
      ];
      const result = cleaner.filterByAge(insights);
      expect(result).toHaveLength(3);
    });
  });

  describe("limitByCount()", () => {
    it("不超过限制时保留全部", () => {
      const cleaner = new ProfileCleaner({ maxInsights: 10 });
      const insights = Array.from({ length: 5 }, (_, i) => createInsight(`洞察${i}`, 0.8, 0));
      const result = cleaner.limitByCount(insights);
      expect(result).toHaveLength(5);
    });

    it("超过限制时保留最新的", () => {
      const cleaner = new ProfileCleaner({ maxInsights: 3 });
      const insights = [
        createInsight("旧洞察", 0.8, 10),
        createInsight("中洞察", 0.8, 5),
        createInsight("新洞察1", 0.8, 0),
        createInsight("新洞察2", 0.8, 1),
      ];
      const result = cleaner.limitByCount(insights);
      expect(result).toHaveLength(3);
      // 应该保留最新的3条
      expect(result[0].content).toBe("新洞察1");
    });
  });

  describe("完整流程组合", () => {
    it("清理多个问题：去重 + 置信度 + 时间 + 数量", () => {
      const cleaner = new ProfileCleaner({
        maxInsights: 3,
        maxAgeDays: 30,
        minConfidence: 0.6,
        similarityThreshold: 0.85,
      });

      const profile = createDefaultProfile("test");
      profile.insights = [
        createInsight("用户喜欢代码示例", 0.9, 0),
        createInsight("用户喜欢代码示例", 0.8, 0), // 重复，低置信度
        createInsight("用户偏好代码而非概念", 0.7, 0), // 相似
        createInsight("洞察1", 0.5, 0), // 低置信度
        createInsight("洞察2", 0.8, 31), // 过期
        createInsight("洞察3", 0.8, 5),
        createInsight("洞察4", 0.8, 1),
        createInsight("洞察5", 0.8, 0),
      ];

      const result = cleaner.clean(profile);
      console.log("清理结果:", result.insights.map((i) => i.content));

      // 验证不超过数量限制
      expect(result.insights.length).toBeLessThanOrEqual(3);
      // 验证置信度都达标
      expect(result.insights.every((i) => i.confidence >= 0.6)).toBe(true);
    });
  });
});
