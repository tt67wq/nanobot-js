/**
 * MAPLE Personalization Agent
 * 
 * 在请求路径上调用（processDirect 开头），职责：
 * - 读取用户画像（纯文件 IO，< 10ms）
 * - 生成注入到 system prompt 的用户偏好片段
 * - 控制 token 预算（≤ 300 tokens）
 * 
 * 原则：
 * - 只有画像中有实质内容时才返回非空字符串
 * - 避免把空画像或全默认值塞进 prompt 浪费 token
 */

import type { UserProfile } from "./types.js";
import type { UserStore } from "./user-store.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MAPLE:Personalization" });

/** 最大注入字符数（约 300 tokens，1 token ≈ 4 chars） */
const MAX_CONTEXT_CHARS = 1200;

export class PersonalizationAgent {
  private readonly userStore: UserStore;

  constructor(userStore: UserStore) {
    this.userStore = userStore;
  }

  /**
   * 为当前请求生成用户上下文片段（注入到 system prompt）
   * 
   * @param userId  用户 ID（即 sessionKey）
   * @param _query  当前查询内容（保留参数，未来可做意图感知选择性检索）
   * @returns system prompt 片段，或空字符串（当无实质内容时）
   */
  async buildContext(userId: string, _query: string): Promise<string> {
    try {
      const profile = this.userStore.load(userId);

      // 判断是否有实质内容
      if (!this.hasSubstantiveContent(profile)) {
        logger.debug("[MAPLE:Personalization] 用户 %s 画像无实质内容，跳过注入", userId);
        return "";
      }

      const lines: string[] = ["## User Context"];

      // 行为模式：偏好风格
      if (profile.behavioral.preferredStyle !== "default") {
        lines.push(`- 偏好风格: ${profile.behavioral.preferredStyle}`);
      }

      // 偏好语言
      if (profile.behavioral.preferredLanguage !== "auto") {
        lines.push(`- 偏好语言: ${profile.behavioral.preferredLanguage}`);
      }

      // 喜欢代码示例
      if (profile.behavioral.likesCodes) {
        lines.push("- 喜欢代码示例");
      }

      // 喜欢类比
      if (profile.behavioral.likesAnalogy) {
        lines.push("- 喜欢类比解释");
      }

      // 技术栈（最多 5 个，避免过长）
      if (profile.behavioral.techStack.length > 0) {
        const stack = profile.behavioral.techStack.slice(0, 5).join(", ");
        lines.push(`- 技术栈: ${stack}`);
      }

      // 不喜欢的内容（最多 3 条）
      if (profile.behavioral.dislikes.length > 0) {
        const dislikes = profile.behavioral.dislikes.slice(0, 3).join(", ");
        lines.push(`- 不喜欢: ${dislikes}`);
      }

      // 近期话题（最多 3 条）
      if (profile.dynamic.recentTopics.length > 0) {
        const topics = profile.dynamic.recentTopics.slice(0, 3).join(", ");
        lines.push(`- 近期关注: ${topics}`);
      }

      // 当前目标
      if (profile.dynamic.currentGoals.length > 0) {
        const goals = profile.dynamic.currentGoals.slice(0, 2).join("; ");
        lines.push(`- 当前目标: ${goals}`);
      }

      // 用户姓名（如果已知）
      if (profile.static.name) {
        lines.push(`- 用户姓名: ${profile.static.name}`);
      }

      // 角色/职位
      if (profile.static.role) {
        lines.push(`- 角色: ${profile.static.role}`);
      }

      // 高置信度洞察（最多 3 条，置信度 ≥ 0.7）
      const highConfidenceInsights = profile.insights
        .filter((i) => i.confidence >= 0.7)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

      if (highConfidenceInsights.length > 0) {
        lines.push("- 洞察:");
        for (const insight of highConfidenceInsights) {
          const confidenceLabel = insight.confidence >= 0.9 ? "高置信度" : "中置信度";
          lines.push(`  • ${insight.content}（${confidenceLabel}）`);
        }
      }

      const result = lines.join("\n");

      // 强制截断，避免超出 token 预算
      if (result.length > MAX_CONTEXT_CHARS) {
        logger.debug(
          "[MAPLE:Personalization] 用户上下文超出预算 (%d > %d 字符)，截断",
          result.length,
          MAX_CONTEXT_CHARS,
        );
        return result.slice(0, MAX_CONTEXT_CHARS) + "\n...";
      }

      logger.debug(
        "[MAPLE:Personalization] 生成用户上下文 %d 字符，用户: %s",
        result.length,
        userId,
      );
      return result;
    } catch (e) {
      // 请求路径——任何错误都不应影响主流程
      logger.warn("[MAPLE:Personalization] buildContext 失败 %s: %s", userId, String(e));
      return "";
    }
  }

  /**
   * 获取用户画像摘要（调试/CLI 查看用）
   */
  async getProfileSummary(userId: string): Promise<string> {
    const profile = this.userStore.load(userId);
    const lines: string[] = [
      `=== 用户画像: ${userId} ===`,
      `创建时间: ${profile.createdAt}`,
      `更新时间: ${profile.updatedAt}`,
      `会话数: ${profile.sessionCount}`,
      "",
      "--- 静态属性 ---",
      `姓名: ${profile.static.name ?? "(未知)"}`,
      `角色: ${profile.static.role ?? "(未知)"}`,
      `专长: ${profile.static.expertise?.join(", ") ?? "(未知)"}`,
      "",
      "--- 行为模式 ---",
      `偏好风格: ${profile.behavioral.preferredStyle}`,
      `偏好语言: ${profile.behavioral.preferredLanguage}`,
      `喜欢代码示例: ${profile.behavioral.likesCodes ? "是" : "否"}`,
      `喜欢类比解释: ${profile.behavioral.likesAnalogy ? "是" : "否"}`,
      `技术栈: ${profile.behavioral.techStack.join(", ") || "(未知)"}`,
      `不喜欢: ${profile.behavioral.dislikes.join(", ") || "(无)"}`,
      "",
      "--- 动态状态 ---",
      `最近活跃: ${profile.dynamic.lastActiveAt}`,
      `近期话题: ${profile.dynamic.recentTopics.join(", ") || "(无)"}`,
      `当前目标: ${profile.dynamic.currentGoals.join("; ") || "(无)"}`,
      "",
      `--- 洞察历史 (共 ${profile.insights.length} 条) ---`,
    ];

    for (const insight of profile.insights) {
      lines.push(
        `[${insight.source}][置信度 ${(insight.confidence * 100).toFixed(0)}%] ${insight.content}`,
      );
    }

    return lines.join("\n");
  }

  /**
   * 判断用户画像是否有实质内容（避免注入全空/全默认的画像）
   */
  private hasSubstantiveContent(profile: UserProfile): boolean {
    // 有洞察
    if (profile.insights.length > 0) return true;
    // 有非默认行为模式
    if (profile.behavioral.preferredStyle !== "default") return true;
    if (profile.behavioral.preferredLanguage !== "auto") return true;
    if (profile.behavioral.likesCodes) return true;
    if (profile.behavioral.likesAnalogy) return true;
    if (profile.behavioral.techStack.length > 0) return true;
    if (profile.behavioral.dislikes.length > 0) return true;
    // 有静态属性
    if (profile.static.name) return true;
    if (profile.static.role) return true;
    if (profile.static.expertise?.length) return true;
    // 有近期话题/目标
    if (profile.dynamic.recentTopics.length > 0) return true;
    if (profile.dynamic.currentGoals.length > 0) return true;

    return false;
  }
}
