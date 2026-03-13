/**
 * MAPLE Learning Agent
 * 
 * 在会话结束后异步运行，负责：
 * 1. 规则层：复用现有 MemoryExtractor 快速提取结构化记忆，写入 MemorySearch
 * 2. LLM 层：深度分析会话，提取用户偏好洞察，写入 UserProfile.insights
 * 
 * 设计原则：
 * - 全程 fire-and-forget，绝不阻塞响应路径
 * - 内部捕获所有异常，失败只打 warn 日志
 * - LLM 调用失败不影响规则层结果
 */

import type { LLMProvider } from "../../providers/base.js";
import type { SessionMessage } from "../../session/types.js";
import type { UserStore } from "./user-store.js";
import { type Insight, generateInsightId } from "./types.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "MAPLE:Learning" });

/**
 * LLM 分析返回的单条洞察结构
 */
interface LlmInsightRaw {
  content: string;
  confidence: number;
  evidence: string;
}

/**
 * LLM 记忆提取返回的单条记忆结构
 */
interface LlmMemoryRaw {
  type: "identity" | "preference" | "habit" | "event";
  content: string;
  confidence: number;
  source: "explicit" | "inferred";
}

/**
 * LLM 分析结果
 */
interface LlmAnalysisResult {
  insights: LlmInsightRaw[];
}

/**
 * LLM 记忆提取结果
 */
interface LlmMemoryResult {
  memories: LlmMemoryRaw[];
}

export class LearningAgent {
  /** ContextBuilder.memorySearch，类型为 any（来自 context.ts 声明），null 表示未配置 embedding */
  private readonly memorySearch: unknown;
  private readonly provider: LLMProvider;
  private readonly userStore: UserStore;
  private readonly model: string;
  private readonly minMessages: number;
  private readonly useLlm: boolean;

  /**
   * @param memorySearch  ContextBuilder.memorySearch（可为 null，此时跳过规则层）
   * @param provider      LLM 提供商（用于深度分析）
   * @param userStore     用户画像持久化
   * @param model         使用的模型名称（空字符串 = 使用 provider 默认模型）
   * @param minMessages   触发 learning 的最小消息数
   * @param useLlm        是否启用 LLM 深度分析
   */
  constructor(
    memorySearch: unknown,
    provider: LLMProvider,
    userStore: UserStore,
    model: string,
    minMessages: number,
    useLlm: boolean,
  ) {
    this.memorySearch = memorySearch;
    this.provider = provider;
    this.userStore = userStore;
    this.model = model || provider.getDefaultModel();
    this.minMessages = minMessages;
    this.useLlm = useLlm;
  }

  /**
   * 处理会话，提取洞察。
   * 
   * 设计为 fire-and-forget：调用方不 await，此方法内部不抛出异常。
   */
  async processSession(
    userId: string,
    messages: SessionMessage[],
  ): Promise<void> {
    try {
      // 消息数不足，不触发 learning
      if (messages.length < this.minMessages) {
        logger.debug("[MAPLE:Learning] 消息数 %d < 最小阈值 %d，跳过", messages.length, this.minMessages);
        return;
      }

      logger.info("[MAPLE:Learning] 开始处理会话，用户: %s，消息数: %d", userId, messages.length);

      // 规则层：提取结构化记忆（快速，无 LLM 调用）
      await this.extractWithRules(messages);

      // LLM 层：深度分析（慢，需要 LLM 调用）
      if (this.useLlm) {
        const insights = await this.analyzeWithLlm(userId, messages);
        if (insights.length > 0) {
          this.persistInsights(userId, insights, messages.length);
        }

        // LLM 层：结构化记忆提取（新增）
        await this.extractMemoryWithLlm(messages);
      }

      // 更新 sessionCount 和 lastActiveAt
      this.userStore.update(userId, {
        dynamic: {
          lastActiveAt: new Date().toISOString(),
          currentGoals: [],
          recentTopics: this.extractRecentTopics(messages),
        },
      });

      logger.info("[MAPLE:Learning] 会话处理完成，用户: %s", userId);
    } catch (e) {
      // 确保不抛出：任何错误只打 warn
      logger.warn("[MAPLE:Learning] 处理失败 %s: %s", userId, String(e));
    }
  }

  /**
   * 规则层：遍历用户消息，复用 memoryExtractor 提取结构化记忆
   */
  private async extractWithRules(messages: SessionMessage[]): Promise<void> {
    if (!this.memorySearch) {
      logger.debug("[MAPLE:Learning] memorySearch 未配置，跳过规则层");
      return;
    }

    try {
      // 动态加载 memoryExtractor（避免循环依赖，与 context.ts 一致的做法）
      const memoryModule = await import("../memory/index.js");
      const { memoryExtractor } = memoryModule;

      // 设置存储后端（memorySearch 实现了 MemoryStoreInterface 的全部方法）
      memoryExtractor.setStore(this.memorySearch as unknown as import("../memory/extractor.js").MemoryStoreInterface);

      // 只处理用户消息（role === "user"）
      const userMessages = messages.filter((m) => m.role === "user");
      let totalExtracted = 0;

      for (const msg of userMessages) {
        if (!msg.content || typeof msg.content !== "string") continue;
        const items = await memoryExtractor.extractAndStore(msg.content);
        totalExtracted += items.length;
      }

      if (totalExtracted > 0) {
        logger.info("[MAPLE:Learning] 规则层提取了 %d 条记忆", totalExtracted);
      }
    } catch (e) {
      logger.warn("[MAPLE:Learning] 规则层提取失败: %s", String(e));
    }
  }

  /**
   * LLM 层：用 LLM 从会话中提取结构化记忆（异步，非阻塞）
   * 
   * 与规则层的区别：
   * - 规则层只能识别显式表达（"我叫/我喜欢/记得"）
   * - LLM 能推断隐式偏好（从对话中推断用户兴趣/习惯）
   */
  private async extractMemoryWithLlm(messages: SessionMessage[]): Promise<void> {
    if (!this.memorySearch) {
      return;
    }

    // 取最近 N 条用户消息（避免 token 过多）
    const userMessages = messages
      .filter((m) => m.role === "user")
      .slice(-15)
      .map((m, i) => `[${i + 1}] ${typeof m.content === "string" ? m.content.slice(0, 300) : ""}`);

    if (userMessages.length === 0) {
      return;
    }

    const prompt = this.buildMemoryExtractionPrompt(userMessages.join("\n"));

    try {
      logger.debug("[MAPLE:Learning] 调用 LLM 提取记忆，模型: %s", this.model);

      const response = await this.provider.chat({
        messages: [{ role: "user", content: prompt }],
        model: this.model,
      });

      if (!response.content) {
        logger.debug("[MAPLE:Learning] LLM 返回空内容");
        return;
      }

      const result = this.parseMemoryResponse(response.content);

      if (result.memories.length === 0) {
        return;
      }

      // 动态导入 createMemoryItem
      const memoryModule = await import("../memory/types.js");
      const { createMemoryItem } = memoryModule;

      const added: string[] = [];

      for (const m of result.memories) {
        // 低置信度过滤（低于 0.6 不要包含）
        if (m.confidence < 0.6) continue;

        // 去重：与已有记忆内容相似则跳过
        const existing = await (this.memorySearch as { search: (query: string, limit: number) => Promise<{ item: unknown }[]> }).search(m.content, 1);
        if (existing.length > 0) continue;

        const item = createMemoryItem({
          type: m.type,
          content: m.content,
          confidence: m.confidence,
          source: m.source,
        });

        await (this.memorySearch as { add: (item: unknown) => Promise<void> }).add(item);
        added.push(`[${m.type}] ${m.content}`);
      }

      if (added.length > 0) {
        logger.info("[MAPLE:Learning] LLM 提取记忆 %d 条: %s", added.length, added.join(", "));
      }
    } catch (e) {
      logger.warn("[MAPLE:Learning] LLM 记忆提取失败: %s", String(e));
    }
  }

  /**
   * 构造给 LLM 的记忆提取 prompt
   */
  private buildMemoryExtractionPrompt(dialogue: string): string {
    return `分析以下对话，提取关于用户的长期记忆，以 JSON 返回。

只提取值得长期记住的信息（身份/明确偏好/习惯/重要事项），不要提取临时信息。

JSON 格式：
{
  "memories": [
    {
      "type": "identity|preference|habit|event",
      "content": "简洁描述，例如：用户名字是张三",
      "confidence": 0.0-1.0,
      "source": "explicit|inferred"
    }
  ]
}

置信度标准：
- explicit（用户明确说出）：0.85-0.95
- inferred（从行为/语境推断）：0.6-0.8
- 低于 0.6 不要包含

对话历史：
${dialogue}

只返回 JSON：`;
  }

  /**
   * 解析 LLM 返回的记忆提取 JSON
   */
  private parseMemoryResponse(content: string): LlmMemoryResult {
    try {
      // 提取 JSON 块（LLM 有时会包裹在 markdown 代码块中）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.debug("[MAPLE:Learning] 记忆响应中未找到 JSON");
        return { memories: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;

      // 类型校验
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray((parsed as Record<string, unknown>).memories)
      ) {
        logger.debug("[MAPLE:Learning] 记忆 JSON 格式不符合预期");
        return { memories: [] };
      }

      const raw = parsed as { memories: unknown[] };

      const memories: LlmMemoryRaw[] = (raw.memories as Record<string, unknown>[])
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null
        )
        .filter(
          (item) =>
            typeof item.type === "string" &&
            typeof item.content === "string" &&
            typeof item.confidence === "number" &&
            typeof item.source === "string"
        )
        .map((item) => ({
          type: item.type as "identity" | "preference" | "habit" | "event",
          content: item.content as string,
          confidence: item.confidence as number,
          source: item.source as "explicit" | "inferred",
        }));

      return { memories };
    } catch (e) {
      logger.debug("[MAPLE:Learning] 解析记忆响应失败: %s", String(e));
      return { memories: [] };
    }
  }

  /**
   * LLM 层：深度分析会话，返回 Insight 列表
   */
  private async analyzeWithLlm(
    userId: string,
    messages: SessionMessage[],
  ): Promise<Insight[]> {
    try {
      const prompt = this.buildAnalysisPrompt(messages);
      
      logger.debug("[MAPLE:Learning] 调用 LLM 分析，模型: %s", this.model);

      const response = await this.provider.chat({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        model: this.model,
        // 不传 tools，纯文本对话
      });

      // 打印 LLM 原始返回，便于调试 JSON 解析问题
      logger.debug("[MAPLE:Learning] LLM 原始响应 (前 500 字): %s", response.content?.slice(0, 500) ?? "(空)");

      if (!response.content) {
        logger.debug("[MAPLE:Learning] LLM 返回空内容");
        return [];
      }

      const result = this.parseAnalysisResponse(response.content);
      const now = new Date().toISOString();

      return result.insights.map((raw) => ({
        id: generateInsightId(),
        content: raw.content.slice(0, 500), // 截断防止过长
        source: "llm" as const,
        confidence: Math.max(0, Math.min(1, raw.confidence)), // 钳制到 [0,1]
        createdAt: now,
        evidence: raw.evidence.slice(0, 200),
      }));
    } catch (e) {
      logger.warn("[MAPLE:Learning] LLM 分析失败: %s", String(e));
      return [];
    }
  }

  /**
   * 构造给 LLM 的分析 prompt
   * 
   * 只传用户消息，最多 10 条，每条截断到 200 字
   */
  private buildAnalysisPrompt(messages: SessionMessage[]): string {
    const userMessages = messages
      .filter((m) => m.role === "user")
      .slice(-10) // 取最近 10 条
      .map((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        return content.slice(0, 200);
      });

    const dialogue = userMessages
      .map((msg, i) => `[用户消息 ${i + 1}]: ${msg}`)
      .join("\n");

    return `分析以下对话中用户的行为模式，提取关于用户的洞察，以 JSON 格式返回。

JSON 格式要求（严格遵守，不要添加额外字段）：
{
  "insights": [
    {
      "content": "用户偏好的特征描述，例如：偏好直接给出代码而非概念解释",
      "confidence": 0.85,
      "evidence": "支持该洞察的原始对话片段（简短摘录）"
    }
  ]
}

分析维度（每个维度最多 2 条洞察，置信度低于 0.6 的不要包含）：
1. 技术水平（初学者/中级/专家）
2. 偏好的回复风格（要代码示例/要概念说明/要简洁/要详细）
3. 感兴趣的领域或技术栈
4. 明显的不满信号（如果有的话）

对话历史：
${dialogue}

只返回 JSON，不要有任何其他内容：`;
  }

  /**
   * 解析 LLM 返回的 JSON
   * 如果解析失败，返回空列表（不抛出）
   */
  private parseAnalysisResponse(content: string): LlmAnalysisResult {
    try {
      // 提取 JSON 块（LLM 有时会包裹在 markdown 代码块中）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.debug("[MAPLE:Learning] LLM 响应中未找到 JSON");
        return { insights: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;

      // 类型校验
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray((parsed as Record<string, unknown>).insights)
      ) {
        logger.debug("[MAPLE:Learning] LLM JSON 格式不符合预期");
        return { insights: [] };
      }

      const raw = parsed as { insights: unknown[] };

      const insights: LlmInsightRaw[] = raw.insights
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .filter((item) =>
          typeof item.content === "string" &&
          typeof item.confidence === "number" &&
          typeof item.evidence === "string"
        )
        .map((item) => ({
          content: item.content as string,
          confidence: item.confidence as number,
          evidence: item.evidence as string,
        }));

      return { insights };
    } catch (e) {
      logger.debug("[MAPLE:Learning] 解析 LLM 响应失败: %s", String(e));
      return { insights: [] };
    }
  }

  /**
   * 将 Insight 追加到用户画像（去重：相同 content 不重复写入）
   */
  private persistInsights(
    userId: string,
    newInsights: Insight[],
    messageCount: number,
  ): void {
    try {
      const profile = this.userStore.load(userId);

      // 去重：只保留 content 不相同的洞察
      const existingContents = new Set(profile.insights.map((i) => i.content));
      const deduplicated = newInsights.filter((i) => !existingContents.has(i.content));

      if (deduplicated.length === 0) {
        logger.debug("[MAPLE:Learning] 所有洞察均已存在，无需写入");
        return;
      }

      const updated = this.userStore.update(userId, {
        insights: [...profile.insights, ...deduplicated],
        sessionCount: profile.sessionCount + 1,
      });

      logger.info(
        "[MAPLE:Learning] 写入 %d 条新洞察 (共 %d 条)，会话数: %d",
        deduplicated.length,
        updated.insights.length,
        updated.sessionCount,
      );
    } catch (e) {
      logger.warn("[MAPLE:Learning] 写入洞察失败: %s", String(e));
    }
  }

  /**
   * 从最近的用户消息中提取近期话题（最多 5 个关键词）
   * 简单实现：取最后 3 条用户消息的前 50 字
   */
  private extractRecentTopics(messages: SessionMessage[]): string[] {
    return messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => (typeof m.content === "string" ? m.content.slice(0, 50) : ""))
      .filter((s) => s.length > 0);
  }
}
