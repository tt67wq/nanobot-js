/**
 * Embedding 服务
 * 使用 OpenAI 兼容 API 生成文本向量
 */

import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "Embedding" });

// 默认 embedding 模型
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_BASE = "https://api.openai.com/v1";

/**
 * Embedding 服务配置
 */
export interface EmbeddingConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  timeout: number; // 请求超时（秒）
}

/**
 * Embedding 服务类
 * 使用 OpenAI 兼容 API 生成文本向量
 */
export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || "",
      apiBase: config.apiBase || DEFAULT_EMBEDDING_BASE,
      model: config.model || DEFAULT_EMBEDDING_MODEL,
      timeout: config.timeout || 5,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EmbeddingConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      timeout: config.timeout ?? this.config.timeout,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * 生成文本的 embedding 向量
   * @param text 要向量化的文本
   * @returns embedding 向量数组
   */
  async getEmbedding(text: string): Promise<number[]> {
    if (!this.isConfigured()) {
      throw new Error("Embedding service not configured. Please provide API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout * 1000);

    try {
      const response = await fetch(`${this.config.apiBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error("Embedding API error: %s", error);
        throw new Error(`Embedding API failed: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 批量生成 embedding
   * @param texts 要向量化的文本数组
   * @returns embedding 向量数组
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error("Embedding service not configured. Please provide API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout * 1000);

    try {
      const response = await fetch(`${this.config.apiBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error("Embedding API error: %s", error);
        throw new Error(`Embedding API failed: ${response.status}`);
      }

      const data = await response.json();
      // 按输入顺序返回 embedding
      const embeddings = new Map<number, number[]>();
      for (const item of data.data) {
        embeddings.set(item.index, item.embedding);
      }

      return texts.map((_, i) => embeddings.get(i) || []);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取向量维度
   */
  getDimensions(): number {
    // 根据模型返回对应维度
    const modelDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-v4': 1024,
      'text-embedding-ada-002': 1536,
    };
    
    return modelDimensions[this.config.model] || 1536;
  }

  /**
   * 从配置创建 EmbeddingService
   * @param config 配置文件（可复用 openai 配置）
   * @returns EmbeddingService 实例
   */
  static fromConfig(config: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
    timeout?: number;
  }): EmbeddingService {
    return new EmbeddingService({
      apiKey: config.apiKey || "",
      apiBase: config.apiBase || DEFAULT_EMBEDDING_BASE,
      model: config.model || DEFAULT_EMBEDDING_MODEL,
      timeout: config.timeout || 5,
    });
  }
}

// 导出单例（需要配置后使用）
export const embeddingService = new EmbeddingService();
