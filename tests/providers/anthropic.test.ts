/**
 * Anthropic Provider Integration Tests
 *
 * Requires ANTHROPIC_API_KEY environment variable to run.
 * Skip tests if no API key is available.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { AnthropicProvider } from "../../src/providers/anthropic";
import type { ChatOptions, ToolDefinition } from "../../src/providers/base";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_BASE = process.env.ANTHROPIC_BASE_URL || null;
const MODEL = process.env.ANTHROPIC_MODEL || undefined;

describe.skipIf(!API_KEY)("AnthropicProvider Integration Tests", () => {
  let provider: AnthropicProvider;

  beforeAll(() => {
    provider = new AnthropicProvider(API_KEY!, API_BASE || null);
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
        model: MODEL || "claude-3-haiku-20240307",
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
      const providerWithInvalidModel = new AnthropicProvider(API_KEY!, API_BASE || null);

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

describe("AnthropicProvider Unit Tests (no API key required)", () => {
  describe("Constructor", () => {
    it("should create provider with apiKey and default apiBase", () => {
      const provider = new AnthropicProvider("test-key");
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });

    it("should create provider with custom apiBase", () => {
      const provider = new AnthropicProvider("test-key", "https://custom.api.com/v1");
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });

    it("should create provider with bearer authType", () => {
      const provider = new AnthropicProvider("test-key", "https://custom.api.com/v1", "bearer");
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });

    it("should handle null apiBase", () => {
      const provider = new AnthropicProvider("test-key", null);
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("getDefaultModel", () => {
    it("should return the default model", () => {
      const provider = new AnthropicProvider("test-api-key");
      expect(provider.getDefaultModel()).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("hasToolCalls", () => {
    let provider: AnthropicProvider;

    beforeAll(() => {
      provider = new AnthropicProvider("test-api-key");
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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

describe.skipIf(!OPENROUTER_API_KEY)("AnthropicProvider Custom Base URL (OpenRouter)", () => {
  let provider: AnthropicProvider;

  beforeAll(() => {
    provider = new AnthropicProvider(
      OPENROUTER_API_KEY!,
      "https://openrouter.ai/api/v1"
    );
  });

  it("should work with custom base URL (OpenRouter)", async () => {
    const options: ChatOptions = {
      messages: [{ role: "user", content: "Say 'test passed' exactly" }],
      model: "anthropic/claude-3-haiku-20240307",
      maxTokens: 50,
    };

    const response = await provider.chat(options);

    expect(response.content).toBeDefined();
    expect(response.content).toMatch(/test passed/i);
      expect(response.finishReason).toBe("stop");
  });
});

describe.skipIf(!API_KEY)("AnthropicProvider Bearer Auth (DashScope/Minimax)", () => {
  let provider: AnthropicProvider;

  beforeAll(() => {
    provider = new AnthropicProvider(
      API_KEY!,
      API_BASE || null,
      "bearer"
    );
  });

  it("should work with Bearer auth", async () => {
    const options: ChatOptions = {
      messages: [{ role: "user", content: "Say 'test passed' exactly" }],
      model: MODEL || "qwen3-coder-plus",
      maxTokens: 50,
    };

    const response = await provider.chat(options);

    expect(response.content).toBeDefined();
    expect(response.content).toMatch(/test passed/i);
    expect(response.finishReason).toBe("stop");
  });
});
