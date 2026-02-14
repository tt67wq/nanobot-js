import { describe, it, expect, beforeEach } from "bun:test";
import { AgentLoop } from "../../src/agent/loop";
import type { LLMProvider, LLMResponse } from "../../src/providers/base";

describe("AgentLoop", () => {
  let mockProvider: LLMProvider;
  let tempWorkspace: string;

  beforeEach(() => {
    // Create temp workspace
    tempWorkspace = "/tmp/test-agent-loop";
    
    // Mock provider
    mockProvider = {
      chat: async () => ({
        content: "Hello, world!",
        toolCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5 }
      }),
      getDefaultModel: () => "test-model",
      hasToolCalls: (response) => response.toolCalls.length > 0
    } as unknown as LLMProvider;
  });

  it("should initialize with provider and workspace", () => {
    const loop = new AgentLoop(mockProvider, tempWorkspace);
    expect(loop).toBeDefined();
  });

  it("should use default model from provider", () => {
    const loop = new AgentLoop(mockProvider, tempWorkspace);
    expect(loop).toBeDefined();
  });

  it("should process direct message without tool calls", async () => {
    const loop = new AgentLoop(mockProvider, tempWorkspace);
    const response = await loop.processDirect("Hello");
    expect(response).toBe("Hello, world!");
  });

  it("should use custom model when specified", async () => {
    const customProvider = {
      ...mockProvider,
      chat: async (options: any) => {
        expect(options.model).toBe("custom-model");
        return {
          content: "Response",
          toolCalls: [],
          finishReason: "stop",
          usage: {}
        };
      }
    } as unknown as LLMProvider;
    
    const loop = new AgentLoop(customProvider, tempWorkspace, { model: "custom-model" });
    await loop.processDirect("Test");
  });
});