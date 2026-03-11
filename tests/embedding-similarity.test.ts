/**
 * 向量相似度测试
 *
 * 运行方式：
 *   bun test tests/embedding-similarity.test.ts
 *
 * 验证两句话的语义相关性，使用余弦相似度计算
 */

import { describe, it, expect } from 'bun:test';
import { loadConfig } from '../src/config/loader';
import { EmbeddingService } from '../src/agent/memory/embedding';

// 余弦相似度计算（与 vector-store.ts 保持一致）
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

describe('Embedding 相似度', () => {
  const config = loadConfig();
  const embeddingService = EmbeddingService.fromConfig({
    apiKey: config.embedding.api_key,
    apiBase: config.embedding.api_base || undefined,
    model: config.embedding.model,
    timeout: config.embedding.timeout,
  });

  it('相同句子相似度应接近 1.0', async () => {
    const text = '我喜欢编程';
    const [vec1, vec2] = await embeddingService.getEmbeddings([text, text]);
    const similarity = cosineSimilarity(vec1, vec2);
    
    console.log(`相同句子相似度: ${similarity}`);
    expect(similarity).toBeGreaterThan(0.99);
  }, 30000);

  it('同义词句子相似度应较高', async () => {
    const [vec1, vec2] = await embeddingService.getEmbeddings([
      '我喜欢编程',
      '我爱写代码'
    ]);
    const similarity = cosineSimilarity(vec1, vec2);
    
    console.log(`"我喜欢编程" vs "我爱写代码": ${similarity}`);
    // 中文同义词相似度通常在 0.6-0.8 之间
    expect(similarity).toBeGreaterThan(0.5);
  }, 30000);

  it('相关但不同句子相似度应适中', async () => {
    const [vec1, vec2] = await embeddingService.getEmbeddings([
      '今天天气很好',
      '明天可能会下雨'
    ]);
    const similarity = cosineSimilarity(vec1, vec2);
    
    console.log(`"今天天气很好" vs "明天可能会下雨": ${similarity}`);
    expect(similarity).toBeGreaterThan(0.5);
  }, 30000);

  it('完全不相关句子相似度应较低', async () => {
    const [vec1, vec2] = await embeddingService.getEmbeddings([
      '今天天气很好',
      '如何安装 Node.js'
    ]);
    const similarity = cosineSimilarity(vec1, vec2);
    
    console.log(`"今天天气很好" vs "如何安装 Node.js": ${similarity}`);
    expect(similarity).toBeLessThan(0.4);
  }, 30000);

  it('英文句子也应该工作', async () => {
    const [vec1, vec2] = await embeddingService.getEmbeddings([
      'I love programming',
      'I enjoy coding'
    ]);
    const similarity = cosineSimilarity(vec1, vec2);
    
    console.log(`"I love programming" vs "I enjoy coding": ${similarity}`);
    expect(similarity).toBeGreaterThan(0.7);
  }, 30000);
});
