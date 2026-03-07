/**
 * 记忆系统导出
 * 统一导出所有记忆相关模块
 */

// 类型定义
export type {
  MemoryType,
  MemorySource,
  MemoryItem,
  MemoryInput,
  MemorySearchResult,
  MemoryStats,
  DecayResult,
} from "./types.js";

export {
  generateMemoryId,
  createMemoryItem,
  MEMORY_TYPE_LABELS,
  MEMORY_SOURCE_LABELS,
} from "./types.js";

// 规则引擎
export { memoryRules, MemoryRules, type RuleMatch } from "./rules.js";

// 提取器
export {
  memoryExtractor,
  MemoryExtractor,
  type ExtractorConfig,
  type MemoryStoreInterface,
  DEFAULT_EXTRACTOR_CONFIG,
} from "./extractor.js";

// 存储
export { MemoryStore } from "./store.js";

// Embedding
export { embeddingService, EmbeddingService, type EmbeddingConfig } from "./embedding.js";

// 向量存储
export { VectorStore } from "./vector-store.js";

// 检索
export { MemorySearch, type SearchOptions } from "./search.js";

// 衰减
export { memoryDecay, MemoryDecay, type DecayConfig, DEFAULT_DECAY_CONFIG } from "./decay.js";
