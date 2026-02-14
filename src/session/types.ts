/**
 * Session types for conversation history management.
 * 
 * Based on Python nanobot session/manager.py structure.
 */

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  /** Optional tool call information */
  tool_calls?: ToolCall[];
  /** Optional tool call ID for tool responses */
  tool_call_id?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface SessionData {
  key: string;
  messages: SessionMessage[];
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface SessionInfo {
  key: string;
  created_at: string | null;
  updated_at: string | null;
  path: string;
}

/**
 * Message format for LLM context (role + content only)
 */
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: ToolCall[];
}
