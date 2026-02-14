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
  toolCalls?: ToolCall[];
  /** Optional tool call ID for tool responses */
  toolCallId?: string;
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
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface SessionInfo {
  key: string;
  createdAt: string | null;
  updatedAt: string | null;
  path: string;
}

/**
 * Message format for LLM context (role + content only)
 */
export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
}
