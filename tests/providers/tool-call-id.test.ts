/**
 * Tool Call ID 传递集成测试
 */

import { describe, it, expect } from "bun:test";
import { Session } from "../../src/session/session";

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
