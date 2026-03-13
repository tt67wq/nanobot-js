/**
 * Tool Call ID 传递集成测试
 * 
 * 使用 ~/.nanobot/config.json 中的 Kimi 配置测试
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { AnthropicProvider } from "../../src/providers/anthropic";
import type { ChatOptions, ToolDefinition } from "../../src/providers/base";
import { Session } from "../../src/session/session";

// 从配置文件读取 Kimi 配置
const KIMI_API_KEY = "sk-kimi-rjVgqw87cYLPPaaGyrKVLsR3j0yBRdEgRseqvWTiMAqZaBDihMqG1nAwJAJBtulA";
const KIMI_API_BASE = "https://api.kimi.com/coding";
const KIMI_MODEL = "kimi-latest";

/**
 * 测试 Session.getHistory() 是否正确保留 toolCallId 和 toolName
 */
describe("Session.getHistory() Tool Call ID Preservation", () => {
  it("should preserve toolCallId and toolName for tool role messages", () => {
    const session = new Session("test-session");
    
    // 添加 user 消息
    session.addMessage("user", "What's the weather in Tokyo?");
    
    // 添加 assistant 消息，包含 tool call
    session.addMessage("assistant", "I'll check the weather for you.", {
      toolCalls: [{
        id: "toolu_abc123",
        name: "get_weather",
        arguments: { location: "Tokyo" }
      }]
    });
    
    // 添加 tool 消息（工具执行结果）
    session.addMessage("tool", '{"temperature": 22, "condition": "sunny"}', {
      toolCallId: "toolu_abc123",
      toolName: "get_weather"
    });
    
    // 获取历史消息
    const history = session.getHistory();
    
    // 验证 user 消息
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("What's the weather in Tokyo?");
    
    // 验证 assistant 消息包含 toolCalls
    expect(history[1].role).toBe("assistant");
    expect(history[1].toolCalls).toBeDefined();
    expect(history[1].toolCalls![0].id).toBe("toolu_abc123");
    expect(history[1].toolCalls![0].name).toBe("get_weather");
    
    // 关键验证：tool 消息必须保留 toolCallId 和 toolName
    expect(history[2].role).toBe("tool");
    expect(history[2].content).toBe('{"temperature": 22, "condition": "sunny"}');
    expect(history[2].toolCallId).toBe("toolu_abc123");
    expect(history[2].toolName).toBe("get_weather");
  });
  
  it("should handle multi-turn conversation with multiple tool calls", () => {
    const session = new Session("test-session-multi");
    
    // Turn 1: user -> assistant (tool call)
    session.addMessage("user", "What's the weather in Tokyo?");
    session.addMessage("assistant", "Let me check...", {
      toolCalls: [{ id: "call_1", name: "get_weather", arguments: { location: "Tokyo" } }]
    });
    
    // Turn 1: tool result
    session.addMessage("tool", '{"temperature": 25}', {
      toolCallId: "call_1",
      toolName: "get_weather"
    });
    
    // Turn 2: assistant continues
    session.addMessage("assistant", "The weather in Tokyo is 25°C.");
    
    // Turn 3: user asks follow-up
    session.addMessage("user", "What about Osaka?");
    
    // Turn 3: assistant tool call
    session.addMessage("assistant", "Let me check Osaka...", {
      toolCalls: [{ id: "call_2", name: "get_weather", arguments: { location: "Osaka" } }]
    });
    
    // Turn 3: tool result
    session.addMessage("tool", '{"temperature": 28}', {
      toolCallId: "call_2",
      toolName: "get_weather"
    });
    
    const history = session.getHistory();
    
    // 验证所有消息都保留 (user + assistant + tool + assistant + user + assistant + tool = 7)
    expect(history.length).toBe(7);
    
    // 验证最后一个 tool 消息的 toolCallId
    const lastToolMsg = history.filter(m => m.role === "tool").pop();
    expect(lastToolMsg?.toolCallId).toBe("call_2");
    expect(lastToolMsg?.toolName).toBe("get_weather");
  });
});

/**
 * 集成测试：使用 Kimi API 验证完整流程
 */
describe("Kimi API Tool Call Integration", () => {
  let provider: AnthropicProvider;
  
  beforeAll(() => {
    // Kimi 使用 Bearer 认证
    provider = new AnthropicProvider(
      KIMI_API_KEY,
      KIMI_API_BASE,
      "bearer"
    );
  });
  
  const weatherTool: ToolDefinition = {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city name" },
      },
      required: ["location"],
    },
  };
  
  it("should complete tool call loop without tool_call_id error", async () => {
    // 第一轮：发送用户消息，让 AI 决定是否调用工具
    const options1: ChatOptions = {
      messages: [
        { role: "user", content: "What's the weather in Tokyo?" },
      ],
      tools: [weatherTool],
      model: KIMI_MODEL,
      maxTokens: 1000,
    };
    
    const response1 = await provider.chat(options1);
    
    // 验证收到工具调用
    expect(response1.toolCalls).toBeDefined();
    expect(response1.toolCalls.length).toBeGreaterThan(0);
    
    const toolCall = response1.toolCalls[0];
    console.log("Tool call received:", toolCall);
    
    // 模拟工具执行结果
    const toolResult = JSON.stringify({ temperature: 22, condition: "sunny" });
    
    // 第二轮：将工具结果传回给 AI
    const options2: ChatOptions = {
      messages: [
        { role: "user", content: "What's the weather in Tokyo?" },
        // 模拟 assistant 的 tool call - 使用 toolCalls (驼峰)
        {
          role: "assistant",
          content: "I'll check the weather for you.",
          toolCalls: [{
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments
          }]
        },
        // 工具结果 - 关键：必须包含 toolCallId
        {
          role: "tool",
          content: toolResult,
          toolCallId: toolCall.id,
          toolName: toolCall.name
        }
      ],
      tools: [weatherTool],
      model: KIMI_MODEL,
      maxTokens: 500,
    };
    
    // 这一步如果 toolCallId 没有正确传递，会返回 "tool_call_id is not found" 错误
    const response2 = await provider.chat(options2);
    
    // 验证成功响应
    expect(response2.content).toBeDefined();
    expect(response2.content).not.toContain("tool_call_id is not found");
    expect(response2.content).not.toContain("Error");
    
    console.log("Final response:", response2.content);
  });
});

/**
 * 使用 Session 的完整集成测试
 * 
 * 模拟真实场景：Session 存储消息 -> getHistory() -> 发送给 LLM
 */
describe("Session + Kimi API Full Integration", () => {
  let provider: AnthropicProvider;
  
  beforeAll(() => {
    provider = new AnthropicProvider(
      KIMI_API_KEY,
      KIMI_API_BASE,
      "bearer"
    );
  });
  
  const weatherTool: ToolDefinition = {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city name" },
      },
      required: ["location"],
    },
  };
  
  it("should work with Session.getHistory() for tool calls", async () => {
    const session = new Session("kimi-integration-test");
    
    // 1. 用户发送消息
    session.addMessage("user", "What's the weather in Tokyo?");
    
    // 2. 获取历史消息发送给 LLM
    const history1 = session.getHistory();
    
    const response1 = await provider.chat({
      messages: history1,
      tools: [weatherTool],
      model: KIMI_MODEL,
      maxTokens: 1000,
    });
    
    // 3. 保存 assistant 响应（可能包含 tool call）
    session.addMessage("assistant", response1.content || "", {
      toolCalls: response1.toolCalls
    });
    
    // 4. 如果有 tool call，执行工具并保存结果
    if (response1.toolCalls && response1.toolCalls.length > 0) {
      const toolCall = response1.toolCalls[0];
      const toolResult = JSON.stringify({ temperature: 22, condition: "sunny" });
      
      // 保存工具结果 - 关键：必须保留 toolCallId
      session.addMessage("tool", toolResult, {
        toolCallId: toolCall.id,
        toolName: toolCall.name
      });
    }
    
    // 5. 再次获取历史消息（这里会调用 getHistory()）
    const history2 = session.getHistory();
    
    // 验证 history2 中的 tool 消息是否保留了 toolCallId
    const toolMessages = history2.filter(m => m.role === "tool");
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(toolMessages[0].toolCallId).toBeDefined();
    expect(toolMessages[0].toolName).toBeDefined();
    
    // 6. 发送完整历史给 LLM，看是否能正确处理
    const response2 = await provider.chat({
      messages: history2,
      tools: [weatherTool],
      model: KIMI_MODEL,
      maxTokens: 500,
    });
    
    // 验证没有 tool_call_id 错误
    expect(response2.content).not.toContain("tool_call_id is not found");
    expect(response2.content).not.toContain("Error");
    
    console.log("Full integration test passed!");
    console.log("Final response:", response2.content);
  });
});
