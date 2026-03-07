/**
 * 记忆系统类型定义
 * 实践学习记忆系统 - 记忆分类、规则化写入、向量检索和衰减机制
 */

// 记忆类型分类
export type MemoryType = "identity" | "preference" | "habit" | "event";

// 记忆来源类型
export type MemorySource = "explicit" | "inferred";

// 单条记忆项
export interface MemoryItem {
  /** 唯一标识符 */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 记忆来源 */
  source: MemorySource;
  /** 创建时间 */
  created_at: Date;
  /** 最后访问时间 */
  last_accessed: Date;
  /** 访问次数 */
  access_count: number;
  /** 重要性评分 0-1（用于衰减计算） */
  importance: number;
}

// 用于创建新记忆的输入
export interface MemoryInput {
  type: MemoryType;
  content: string;
  confidence: number;
  source: MemorySource;
  importance?: number;
}

// 记忆检索结果
export interface MemorySearchResult {
  item: MemoryItem;
  score: number;
}

// 记忆统计信息
export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  oldest: Date | null;
  newest: Date | null;
}

// 衰减检测结果
export interface DecayResult {
  decayed: number;
  items: MemoryItem[];
}

// 生成唯一 ID
export function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// 创建新的记忆项
export function createMemoryItem(input: MemoryInput): MemoryItem {
  const now = new Date();
  return {
    id: generateMemoryId(),
    type: input.type,
    content: input.content,
    confidence: input.confidence,
    source: input.source,
    created_at: now,
    last_accessed: now,
    access_count: 0,
    importance: input.importance ?? 0.5,
  };
}

// 记忆类型标签（用于日志/调试）
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  identity: "身份",
  preference: "偏好",
  habit: "习惯",
  event: "事件",
};

// 记忆来源标签
export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  explicit: "明确",
  inferred: "推断",
};
