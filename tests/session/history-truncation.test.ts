/**
 * Session history truncation tests
 * 
 * Tests that getHistory() preserves tool_use/tool_result pairs
 * to avoid "tool_call_id is not found" errors with Anthropic API
 */

import { describe, it, expect } from "bun:test";
import { Session } from "../../src/session/session";

describe("Session.getHistory() truncation with tool calls", () => {
  it("should include matching assistant message when tool message is at the start of truncated history", () => {
    const session = new Session("test-truncation");
    
    // Add 60 messages (exceeds default limit of 50)
    for (let i = 0; i < 20; i++) {
      session.addMessage("user", `Message ${i}`);
      session.addMessage("assistant", `Response ${i}`);
    }
    
    // Add a tool use and tool result pair at the end
    session.addMessage("user", "What's the weather?");
    session.addMessage("assistant", "I'll check the weather.", {
      toolCalls: [{ id: "call_weather_123", name: "get_weather", arguments: { location: "Tokyo" } }]
    });
    session.addMessage("tool", '{"temperature": 22}', {
      toolCallId: "call_weather_123",
      toolName: "get_weather"
    });
    
    // Get history with default limit (50)
    const history = session.getHistory(50);
    
    // Find the assistant message with tool_calls
    const assistantMsg = history.find(m => m.role === "assistant" && m.toolCalls);
    // Find the tool message
    const toolMsg = history.find(m => m.role === "tool");
    
    // Both should be present
    expect(assistantMsg).toBeDefined();
    expect(toolMsg).toBeDefined();
    
    // The tool_call IDs should match
    expect(assistantMsg?.toolCalls?.[0].id).toBe("call_weather_123");
    expect(toolMsg?.toolCallId).toBe("call_weather_123");
    
    console.log("History length:", history.length);
    console.log("Assistant message found:", !!assistantMsg);
    console.log("Tool message found:", !!toolMsg);
  });

  it("should handle multiple tool calls in the same assistant message", () => {
    const session = new Session("test-multi-tools");
    
    // Add 55 messages to trigger truncation
    for (let i = 0; i < 25; i++) {
      session.addMessage("user", `Message ${i}`);
      session.addMessage("assistant", `Response ${i}`);
    }
    
    // Add assistant with multiple tool calls
    session.addMessage("assistant", "I'll check both.", {
      toolCalls: [
        { id: "call_1", name: "get_weather", arguments: { location: "Tokyo" } },
        { id: "call_2", name: "get_time", arguments: { timezone: "JST" } }
      ]
    });
    session.addMessage("tool", '{"temp": 22}', { toolCallId: "call_1", toolName: "get_weather" });
    session.addMessage("tool", '{"time": "12:00"}', { toolCallId: "call_2", toolName: "get_time" });
    session.addMessage("assistant", "The weather is 22°C and time is 12:00.");
    
    const history = session.getHistory(10); // Small limit to force truncation
    
    // Should have the assistant with tool_calls and both tool results
    const toolCallsMsgs = history.filter(m => m.role === "assistant" && m.toolCalls);
    const toolMsgs = history.filter(m => m.role === "tool");
    
    expect(toolCallsMsgs.length).toBeGreaterThan(0);
    expect(toolMsgs.length).toBe(2);
    
    console.log("Tool calls message found:", toolCallsMsgs.length);
    console.log("Tool messages found:", toolMsgs.length);
  });

  it("should not break when toolCallId does not match any assistant message", () => {
    const session = new Session("test-orphan-tool");
    
    // Add messages
    for (let i = 0; i < 25; i++) {
      session.addMessage("user", `Message ${i}`);
      session.addMessage("assistant", `Response ${i}`);
    }
    
    // Add orphan tool message (no matching assistant in history)
    session.addMessage("tool", '{"result": "orphan"}', {
      toolCallId: "non_existent_call",
      toolName: "some_tool"
    });
    
    // Should not throw
    const history = session.getHistory(50);
    expect(history.length).toBeGreaterThan(0);
    
    // The orphan tool should still be there
    const toolMsg = history.find(m => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.toolCallId).toBe("non_existent_call");
  });
});

console.log("Session history truncation tests loaded");