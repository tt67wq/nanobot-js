/**
 * 记忆规则引擎
 * 用于从用户消息中规则化提取和分类记忆
 */

import type { MemoryType, MemoryInput } from "./types.js";

// 规则匹配结果
export interface RuleMatch {
  type: MemoryType;
  confidence: number;
  source: "explicit" | "inferred";
  content: string;
  importance: number;
}

// 规则定义
interface MemoryPattern {
  // 正则表达式模式
  regex: RegExp;
  // 提取内容的处理函数
  extract: (match: RegExpMatchArray) => string;
  // 默认置信度
  defaultConfidence: number;
  // 默认重要性
  defaultImportance: number;
}

// 记忆类型对应的匹配规则
const MEMORY_PATTERNS: Record<MemoryType, MemoryPattern[]> = {
  // 身份信息 - 关于用户是谁的信息
  identity: [
    {
      regex: /我叫(\w+)/,
      extract: (m) => `用户名字是 ${m[1]}`,
      defaultConfidence: 0.95,
      defaultImportance: 0.9,
    },
    {
      regex: /我的名字[叫|是]?(\w+)/,
      extract: (m) => `用户名字是 ${m[1]}`,
      defaultConfidence: 0.95,
      defaultImportance: 0.9,
    },
    {
      regex: /我是(\w+)[人友]/,
      extract: (m) => `用户是 ${m[1]}`,
      defaultConfidence: 0.8,
      defaultImportance: 0.7,
    },
    {
      regex: /(?:我|咱|俺)是(\w+)/,
      extract: (m) => `用户身份是 ${m[1]}`,
      defaultConfidence: 0.7,
      defaultImportance: 0.6,
    },
  ],

  // 偏好信息 - 用户喜欢什么
  preference: [
    {
      regex: /我(?:喜欢|爱|偏好|更喜欢)(.+?)(?:\。|$)/,
      extract: (m) => `用户喜欢: ${m[1].trim()}`,
      defaultConfidence: 0.9,
      defaultImportance: 0.8,
    },
    {
      regex: /(?:不|别)喜欢(.+?)(?:\。|$)/,
      extract: (m) => `用户不喜欢: ${m[1].trim()}`,
      defaultConfidence: 0.9,
      defaultImportance: 0.8,
    },
    {
      regex: /(?:比较|挺|蛮)喜欢(.+?)(?:\。|$)/,
      extract: (m) => `用户比较喜欢: ${m[1].trim()}`,
      defaultConfidence: 0.8,
      defaultImportance: 0.7,
    },
    {
      regex: /我(?:一般|通常|习惯)用(.+?)(?:\。|$)/,
      extract: (m) => `用户习惯使用: ${m[1].trim()}`,
      defaultConfidence: 0.85,
      defaultImportance: 0.7,
    },
    {
      regex: /我(?:的)?(?:开发)?(?:环境|技术栈)是(.+?)(?:\。|$)/,
      extract: (m) => `用户技术栈: ${m[1].trim()}`,
      defaultConfidence: 0.9,
      defaultImportance: 0.8,
    },
  ],

  // 习惯信息 - 用户经常做什么
  habit: [
    {
      regex: /我(?:经常|通常|平时)(.+?)(?:\。|$)/,
      extract: (m) => `用户习惯: ${m[1].trim()}`,
      defaultConfidence: 0.8,
      defaultImportance: 0.6,
    },
    {
      regex: /(?:每|天天)(?:天|天|日)(?:常)?(.+?)(?:\。|$)/,
      extract: (m) => `用户日常: ${m[1].trim()}`,
      defaultConfidence: 0.8,
      defaultImportance: 0.6,
    },
    {
      regex: /(?:总是|一直|从来)(.+?)(?:\。|$)/,
      extract: (m) => `用户总是: ${m[1].trim()}`,
      defaultConfidence: 0.75,
      defaultImportance: 0.5,
    },
  ],

  // 事件信息 - 需要记住的具体事项
  event: [
    {
      regex: /记得(.+?)(?:\。|$)/,
      extract: (m) => `需要记住: ${m[1].trim()}`,
      defaultConfidence: 0.95,
      defaultImportance: 0.9,
    },
    {
      regex: /提醒我(.+?)(?:\。|$)/,
      extract: (m) => `提醒事项: ${m[1].trim()}`,
      defaultConfidence: 0.95,
      defaultImportance: 0.9,
    },
    {
      regex: /(?:不要|别)忘记(.+?)(?:\。|$)/,
      extract: (m) => `重要事项不要忘记: ${m[1].trim()}`,
      defaultConfidence: 0.9,
      defaultImportance: 0.85,
    },
    {
      regex: /下次(?:再|还)(.+?)(?:\。|$)/,
      extract: (m) => `下次要: ${m[1].trim()}`,
      defaultConfidence: 0.8,
      defaultImportance: 0.7,
    },
    {
      regex: /(?:刚才|之前|今天)(?:跟|和|向)?你说?过(.+?)(?:\。|$)/,
      extract: (m) => `之前提到过: ${m[1].trim()}`,
      defaultConfidence: 0.85,
      defaultImportance: 0.6,
    },
  ],
};

/**
 * 规则引擎 - 从文本中提取记忆
 */
export class MemoryRules {
  /**
   * 从文本中提取所有可能的记忆
   * @param text 用户消息文本
   * @returns 匹配到的记忆列表
   */
  extract(text: string): RuleMatch[] {
    const results: RuleMatch[] = [];

    // 遍历所有记忆类型
    for (const [type, patterns] of Object.entries(MEMORY_PATTERNS) as [
      MemoryType,
      MemoryPattern[]
    ][]) {
      for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) {
          results.push({
            type,
            confidence: pattern.defaultConfidence,
            source: "explicit",
            content: pattern.extract(match),
            importance: pattern.defaultImportance,
          });
        }
      }
    }

    return results;
  }

  /**
   * 检查文本是否包含需要记忆的内容
   * @param text 用户消息文本
   * @returns 是否包含可提取的记忆
   */
  hasMemory(text: string): boolean {
    return this.extract(text).length > 0;
  }

  /**
   * 获取第一个匹配的记忆（用于快速判断）
   * @param text 用户消息文本
   * @returns 第一个匹配的记忆或 null
   */
  extractFirst(text: string): RuleMatch | null {
    const results = this.extract(text);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 将 RuleMatch 转换为 MemoryInput
   * @param match 规则匹配结果
   * @returns 记忆输入
   */
  toMemoryInput(match: RuleMatch): MemoryInput {
    return {
      type: match.type,
      content: match.content,
      confidence: match.confidence,
      source: match.source,
      importance: match.importance,
    };
  }
}

// 导出单例
export const memoryRules = new MemoryRules();
