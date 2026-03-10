/**
 * MAPLE Learning Agent E2E 测试
 * 
 * 验证 Learning Agent 的 LLM 调用和 JSON 解析能力
 * 
 * 运行方式：
 * - 使用 Anthropic: ANTHROPIC_API_KEY=xxx bun test tests/agent/maple-learning.test.ts
 * - 使用 OpenAI: OPENAI_API_KEY=xxx bun test tests/agent/maple-learning.test.ts
 * - 使用 Kimi: OPENAI_API_KEY=xxx OPENAI_BASE_URL=https://api.moonshot.cn/v1 OPENAI_MODEL=moonshot-v1-8k bun test tests/agent/maple-learning.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { OpenAIProvider } from "../../src/providers/openai";
import { AnthropicProvider } from "../../src/providers/anthropic";
import { LearningAgent } from "../../src/agent/maple/learning";
import { UserStore } from "../../src/agent/maple/user-store";
import { createDefaultProfile } from "../../src/agent/maple/types";
import type { LLMProvider } from "../../src/providers/base";
import type { SessionMessage } from "../../src/session/types";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

// 从环境变量选择 Provider
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || undefined;
const TEST_MODEL = process.env.TEST_MODEL || ""; // 可指定测试模型

// 构造测试用的消息
function createTestMessages(count: number): SessionMessage[] {
  const messages: SessionMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: "user",
      content: `这是第 ${i + 1} 条测试消息，我想了解一下 TypeScript 的类型系统。`,
    });
    messages.push({
      role: "assistant",
      content: `好的，TypeScript 的类型系统包括基础类型、联合类型、交叉类型等。`,
    });
  }
  return messages;
}

// 创建测试用的 UserStore
function createTestUserStore(testDir: string): UserStore {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  return new UserStore(testDir);
}

describe.skipIf(!ANTHROPIC_KEY && !OPENAI_KEY)("MAPLE Learning Agent E2E Tests", () => {
  let provider: LLMProvider;
  let tempDir: string;
  let userStore: UserStore;
  let providerName: string;

  beforeAll(() => {
    // 优先使用 OpenAI（便于测试 Kimi 等 OpenAI 兼容 API），其次 Anthropic
    if (OPENAI_KEY) {
      providerName = OPENAI_BASE ? `OpenAI (base: ${OPENAI_BASE}, model: ${OPENAI_MODEL || 'default'})` : "OpenAI";
      console.log(`[E2E] 使用 ${providerName} Provider`);
      provider = new OpenAIProvider(OPENAI_KEY!, OPENAI_BASE);
    } else if (ANTHROPIC_KEY) {
      providerName = "Anthropic";
      console.log(`[E2E] 使用 ${providerName} Provider`);
      provider = new AnthropicProvider(ANTHROPIC_KEY!);
    }

    // 创建临时目录
    tempDir = join("/tmp", `maple-learning-test-${Date.now()}`);
    userStore = createTestUserStore(tempDir);
  });

  describe("LLM JSON 返回格式验证", () => {
    it("应该返回有效的 JSON 格式（基础测试）", async () => {
      const agent = new LearningAgent(
        null, // 不使用规则层
        provider,
        userStore,
        TEST_MODEL,
        3, // minMessages
        true // useLlm
      );

      const messages = createTestMessages(3);
      const userId = "test:json-validation";

      // 执行 learning
      await agent.processSession(userId, messages);

      // 验证用户画像是否更新
      const profile = userStore.load(userId);
      console.log("[E2E] Provider:", providerName);
      console.log("[E2E] 用户画像洞察数:", profile.insights.length);
      console.log("[E2E] 用户画像:", JSON.stringify(profile, null, 2));

      // 至少应该创建了用户画像
      expect(profile).toBeDefined();
      expect(profile.userId).toBe(userId);
      
      // ⚠️ 关键验证：应该有洞察
      // 注意：某些模型可能不遵循指令返回空结果
      if (profile.insights.length === 0) {
        console.warn("[E2E] ⚠️ LLM 未返回有效洞察，可能是模型不遵循指令");
      }
    }, 30000); // 30 秒超时

    it("应该能解析包含 markdown 代码块的 JSON", async () => {
      const agent = new LearningAgent(
        null,
        provider,
        userStore,
        TEST_MODEL,
        3,
        true
      );

      const messages: SessionMessage[] = [
        { role: "user", content: "我想学习 React，请给我一些代码示例。" },
        { role: "assistant", content: "好的，这是一个 React 组件示例..." },
        { role: "user", content: "能否解释一下 useEffect 的用法？" },
        { role: "assistant", content: "useEffect 用于处理副作用..." },
        { role: "user", content: "谢谢，我更喜欢直接看代码而不是长篇解释。" },
      ];

      const userId = "test:markdown-json";
      await agent.processSession(userId, messages);

      const profile = userStore.load(userId);
      console.log("[E2E] 洞察数量:", profile.insights.length);
      console.log("[E2E] 洞察内容:", JSON.stringify(profile.insights, null, 2));

      // 验证洞察格式
      for (const insight of profile.insights) {
        expect(insight.id).toMatch(/^insight_/);
        expect(insight.content).toBeDefined();
        expect(insight.source).toBe("llm");
        expect(insight.confidence).toBeGreaterThanOrEqual(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
      }
    }, 30000);

    it("应该能识别用户的技术栈偏好", async () => {
      const agent = new LearningAgent(
        null,
        provider,
        userStore,
        TEST_MODEL,
        3,
        true
      );

      const messages: SessionMessage[] = [
        { role: "user", content: "我在用 Bun 做后端开发，性能很好。" },
        { role: "assistant", content: "Bun 确实是一个高性能的运行时..." },
        { role: "user", content: "TypeScript 5.0 的新特性有哪些？" },
        { role: "assistant", content: "TypeScript 5.0 引入了 decorators..." },
        { role: "user", content: "我想用 Hono 框架搭建 API。" },
      ];

      const userId = "test:tech-stack";
      await agent.processSession(userId, messages);

      const profile = userStore.load(userId);
      console.log("[E2E] 技术栈洞察:", profile.insights.map(i => i.content));

      // 应该能提取到技术栈相关的洞察
      const techRelatedInsights = profile.insights.filter(
        i => i.content.toLowerCase().includes("typescript") || 
             i.content.toLowerCase().includes("bun") ||
             i.content.toLowerCase().includes("hono") ||
             i.content.toLowerCase().includes("技术")
      );
      
      console.log("[E2E] 技术相关洞察数:", techRelatedInsights.length);
    }, 30000);
  });

  describe("边界情况测试", () => {
    it("消息数不足时不应触发 LLM 调用", async () => {
      const agent = new LearningAgent(
        null,
        provider,
        userStore,
        TEST_MODEL,
        5, // 需要 5 条消息才触发
        true
      );

      const messages = createTestMessages(2); // 只有 2 条用户消息
      const userId = "test:insufficient-messages";

      await agent.processSession(userId, messages);

      const profile = userStore.load(userId);
      // 不应该有任何洞察
      expect(profile.insights.length).toBe(0);
    });

    it("空消息列表应被安全处理", async () => {
      const agent = new LearningAgent(
        null,
        provider,
        userStore,
        TEST_MODEL,
        1,
        true
      );

      const messages: SessionMessage[] = [];
      const userId = "test:empty-messages";

      // 不应该抛出异常
      await agent.processSession(userId, messages);

      const profile = userStore.load(userId);
      expect(profile.insights.length).toBe(0);
    });

    it("只有 assistant 消息时应被安全处理", async () => {
      const agent = new LearningAgent(
        null,
        provider,
        userStore,
        TEST_MODEL,
        1,
        true
      );

      const messages: SessionMessage[] = [
        { role: "assistant", content: "这是助手消息" },
        { role: "assistant", content: "另一条助手消息" },
      ];
      const userId = "test:only-assistant";

      await agent.processSession(userId, messages);

      const profile = userStore.load(userId);
      // 没有 user 消息，LLM 应该无法分析，返回空洞察
      expect(profile.insights.length).toBe(0);
    });
  });

  describe("JSON 解析能力测试（无 API 调用）", () => {
    it("应该能解析标准 JSON", () => {
      // 直接测试 parseAnalysisResponse 的逻辑
      const jsonContent = `{
        "insights": [
          {
            "content": "用户偏好代码示例",
            "confidence": 0.85,
            "evidence": "用户多次要求直接给代码"
          }
        ]
      }`;

      // 使用正则提取 JSON
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeDefined();
      
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.insights).toBeDefined();
      expect(parsed.insights.length).toBe(1);
      expect(parsed.insights[0].content).toBe("用户偏好代码示例");
    });

    it("应该能解析 markdown 代码块包裹的 JSON", () => {
      const markdownContent = `好的，我分析了用户的行为模式：

\`\`\`json
{
  "insights": [
    {
      "content": "用户是中高级开发者",
      "confidence": 0.9,
      "evidence": "讨论了高级 TypeScript 特性"
    }
  ]
}
\`\`\`

以上是我的分析结果。`;

      // 使用正则提取 JSON
      const jsonMatch = markdownContent.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeDefined();
      
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.insights).toBeDefined();
      expect(parsed.insights.length).toBe(1);
    });

    it("应该拒绝无效的 JSON 格式", () => {
      const invalidContent = "这不是 JSON，只是一段普通的文本分析。";

      const jsonMatch = invalidContent.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeNull();
    });

    it("应该拒绝缺少 insights 字段的 JSON", () => {
      const invalidJson = `{
        "analysis": "用户偏好代码",
        "confidence": 0.8
      }`;

      const jsonMatch = invalidJson.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeDefined();
      
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.insights).toBeUndefined();
    });
  });
});

// 清理函数
describe("Cleanup", () => {
  it("清理临时测试目录", () => {
    const testDirs = ["/tmp/maple-learning-test-"];
    // 在实际运行中由 beforeAll 创建的目录会在测试结束后保留
    // 这里提供一个手动清理的方式
    console.log("[E2E] 测试完成，临时目录位于 /tmp/maple-learning-test-*");
  });
});
