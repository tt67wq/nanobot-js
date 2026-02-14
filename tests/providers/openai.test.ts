import { describe, it, expect, beforeAll } from "bun:test";
import { OpenAIProvider } from "../../src/providers/openai";
import type { ChatOptions, ToolDefinition } from "../../src/providers/base";

const API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || null;
const MODEL = process.env.OPENAI_MODEL || undefined;

describe.skipIf(!API_KEY)("OpenAIProvider Integration Tests", () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    provider = new OpenAIProvider(API_KEY!, API_BASE);
  });

  describe("Basic Chat", () => {
    it("should send a simple message and receive a response", async () => {
      const options: ChatOptions = {
        messages: [
          { role: "user", content: "Say 'Hello, World!' in exactly those words." },
        ],
        model: MODEL,
        maxTokens: 100,
        temperature: 0.7,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content).toContain("Hello, World!");
      expect(response.finishReason).toBe("stop");
      expect(response.usage).toHaveProperty("promptTokens");
      expect(response.usage).toHaveProperty("completionTokens");
    });

    it("should use custom model when specified", async () => {
      const options: ChatOptions = {
        messages: [{ role: "user", content: "What is 1+1?" }],
        model: MODEL || "gpt-4o-mini",
        maxTokens: 50,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content).toMatch(/2|two/);
    });
  });

  describe("System Message", () => {
    it("should handle system message", async () => {
      const options: ChatOptions = {
        messages: [
          { role: "system", content: "You are a helpful assistant that speaks in emojis." },
          { role: "user", content: "Say hello" },
        ],
        model: MODEL,
        maxTokens: 50,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content!.length).toBeGreaterThan(0);
    });
  });

  describe("Tool Calling", () => {
    const weatherTool: ToolDefinition = {
      name: "get_weather",
      description: "Get the current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city name",
          },
        },
        required: ["location"],
      },
    };

    it("should make tool call when tools are provided", async () => {
      const options: ChatOptions = {
        messages: [
          { role: "user", content: "What's the weather in Tokyo?" },
        ],
        tools: [weatherTool],
        model: MODEL,
        maxTokens: 500,
      };

      const response = await provider.chat(options);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls.length).toBeGreaterThan(0);
      expect(response.toolCalls[0].name).toBe("get_weather");
      expect(response.toolCalls[0].arguments).toHaveProperty("location");
    });

    it("should handle conversation with tool results", async () => {
      const options: ChatOptions = {
        messages: [
          { role: "user", content: "What's the weather in Tokyo?" },
          {
            role: "tool",
            content: '{"temperature": 22, "condition": "sunny"}',
            toolCallId: "tool_123",
            toolName: "get_weather",
          },
          { role: "user", content: "Thanks! Is it a good day for a walk?" },
        ],
        tools: [weatherTool],
        model: MODEL,
        maxTokens: 200,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content!.toLowerCase()).toMatch(/22|sunny|good|walk/);
    });
  });

  describe("Message Conversion", () => {
    it("should handle multiple messages in conversation", async () => {
      const options: ChatOptions = {
        messages: [
          { role: "user", content: "My name is Alice." },
          { role: "assistant", content: "Hello Alice! Nice to meet you." },
          { role: "user", content: "What's my name?" },
        ],
        model: MODEL,
        maxTokens: 100,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content!.toLowerCase()).toMatch(/alice/);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid model gracefully", async () => {
      const providerWithInvalidModel = new OpenAIProvider(API_KEY!, API_BASE);

      const options: ChatOptions = {
        messages: [{ role: "user", content: "Hello" }],
        model: "invalid-model-name-xyz",
        maxTokens: 10,
      };

      const response = await providerWithInvalidModel.chat(options);

      expect(response.content).toContain("Error");
      expect(response.finishReason).toBe("error");
    });
  });

  describe("Temperature and MaxTokens", () => {
    it("should respect temperature parameter", async () => {
      const options: ChatOptions = {
        messages: [{ role: "user", content: "Say exactly: testing" }],
        model: MODEL,
        temperature: 0,
        maxTokens: 20,
      };

      const response = await provider.chat(options);

      expect(response.content).toBeDefined();
      expect(response.content!.toLowerCase()).toContain("testing");
    });
  });
});

describe("OpenAIProvider Unit Tests (no API key required)", () => {
  describe("Constructor", () => {
    it("should create provider with apiKey and default apiBase", () => {
      const provider = new OpenAIProvider("test-key");
      expect(provider.getDefaultModel()).toBe("gpt-4o-mini");
    });

    it("should create provider with custom apiBase", () => {
      const provider = new OpenAIProvider("test-key", "https://custom.api.com/v1");
      expect(provider.getDefaultModel()).toBe("gpt-4o-mini");
    });

    it("should handle null apiBase", () => {
      const provider = new OpenAIProvider("test-key", null);
      expect(provider.getDefaultModel()).toBe("gpt-4o-mini");
    });
  });

  describe("getDefaultModel", () => {
    it("should return the default model", () => {
      const provider = new OpenAIProvider("test-api-key");
      expect(provider.getDefaultModel()).toBe("gpt-4o-mini");
    });
  });

  describe("hasToolCalls", () => {
    let provider: OpenAIProvider;

    beforeAll(() => {
      provider = new OpenAIProvider("test-api-key");
    });

    it("should correctly identify tool calls in response", () => {
      const responseWithTools = {
        content: "test",
        toolCalls: [{ id: "1", name: "test", arguments: {} }],
        finishReason: "tool_calls",
        usage: {},
      };

      const responseWithoutTools = {
        content: "test",
        toolCalls: [],
        finishReason: "stop",
        usage: {},
      };

      expect(provider.hasToolCalls(responseWithTools)).toBe(true);
      expect(provider.hasToolCalls(responseWithoutTools)).toBe(false);
    });
  });
});

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

describe.skipIf(!MINIMAX_API_KEY)("OpenAIProvider Custom Base URL (MiniMax)", () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    provider = new OpenAIProvider(
      MINIMAX_API_KEY!,
      "https://api.minimax.chat/v1"
    );
  });

  it("should work with custom base URL (MiniMax)", async () => {
    const options: ChatOptions = {
      messages: [{ role: "user", content: "Say 'test passed' exactly" }],
      model: "abab6.5s-chat",
      maxTokens: 50,
    };

    const response = await provider.chat(options);

    expect(response.content).toBeDefined();
    expect(response.content).toMatch(/test passed/i);
    expect(response.finishReason).toBe("stop");
  });
});
