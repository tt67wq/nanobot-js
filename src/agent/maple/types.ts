/**
 * MAPLE 架构类型定义
 * 
 * MAPLE = Memory-Augmented Personalized LLM Engine
 * 
 * 用户模型分为四个维度（参考 MAPLE 论文）：
 * - S_u: 静态属性（几乎不变）
 * - D_u: 动态状态（会话间变化）
 * - B_u: 行为模式（长期积累）
 * - G_u: 预测性元素（主动推断）
 */

/**
 * 用户画像的回复风格偏好
 */
export type PreferredStyle = "technical" | "conceptual" | "concise" | "detailed" | "default";

/**
 * 用户偏好的语言
 */
export type PreferredLanguage = "zh" | "en" | "auto";

/**
 * 单条洞察——Learning Agent 写入的最小学习单元
 */
export interface Insight {
  /** 唯一 ID，格式 `insight_<timestamp>_<random>` */
  id: string;
  /** 洞察内容，例如："用户偏好代码示例而非长段文字" */
  content: string;
  /** 来源：rule = 规则引擎快速提取，llm = LLM 深度分析 */
  source: "rule" | "llm";
  /** 置信度 0-1 */
  confidence: number;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 支持该洞察的原始证据片段（截断到 200 字） */
  evidence: string;
}

/**
 * 完整用户画像
 */
export interface UserProfile {
  /** 用户 ID，来自 sessionKey，如 "feishu:ou_xxx" 或 "cli:direct" */
  userId: string;

  /**
   * S_u：静态属性，几乎不变
   */
  static: {
    name?: string;
    role?: string;
    expertise?: string[];
    /** 偏好语言 */
    language?: string;
  };

  /**
   * D_u：动态状态，随会话更新
   */
  dynamic: {
    lastActiveAt: string;
    currentGoals: string[];
    recentTopics: string[];
  };

  /**
   * B_u：行为模式，长期积累
   */
  behavioral: {
    preferredStyle: PreferredStyle;
    preferredLanguage: PreferredLanguage;
    /** 是否喜欢代码示例 */
    likesCodes: boolean;
    /** 是否喜欢类比解释 */
    likesAnalogy: boolean;
    /** 熟悉的技术栈 */
    techStack: string[];
    /** 明确不喜欢的内容 */
    dislikes: string[];
  };

  /**
   * G_u：预测性元素
   */
  predictive: {
    anticipatedNeeds: string[];
  };

  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 历史会话数 */
  sessionCount: number;

  /** Learning Agent 写入的洞察历史 */
  insights: Insight[];
}

/**
 * 会话摘要（Learning Agent 处理后生成）
 */
export interface SessionSummary {
  /** 会话键 */
  sessionKey: string;
  /** LLM 生成的摘要 */
  summary: string;
  /** 从本次会话提取的洞察 */
  insights: Insight[];
  /** 处理时间 */
  processedAt: string;
  /** 本次会话消息数 */
  messageCount: number;
}

/**
 * 工厂函数：创建默认用户画像
 */
export function createDefaultProfile(userId: string): UserProfile {
  const now = new Date().toISOString();
  return {
    userId,
    static: {},
    dynamic: {
      lastActiveAt: now,
      currentGoals: [],
      recentTopics: [],
    },
    behavioral: {
      preferredStyle: "default",
      preferredLanguage: "auto",
      likesCodes: false,
      likesAnalogy: false,
      techStack: [],
      dislikes: [],
    },
    predictive: {
      anticipatedNeeds: [],
    },
    createdAt: now,
    updatedAt: now,
    sessionCount: 0,
    insights: [],
  };
}

/**
 * 生成 Insight ID
 */
export function generateInsightId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `insight_${ts}_${rand}`;
}
