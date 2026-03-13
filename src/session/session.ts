/**
 * Session class for conversation history management.
 * 
 * Based on Python nanobot session/manager.py structure.
 * This module handles in-memory session state; persistence is handled by manager.ts.
 */

import type { LLMMessage, SessionData, SessionMessage } from "./types";

export class Session {
  public readonly key: string;
  public messages: SessionMessage[];
  public readonly createdAt: Date;
  public updatedAt: Date;
  public metadata: Record<string, unknown>;

  /**
   * Create a new Session.
   * 
   * @param key - Session key (usually channel:chat_id)
   * @param data - Optional initial session data
   */
  constructor(key: string, data?: Partial<SessionData>) {
    this.key = key;
    this.messages = data?.messages ?? [];
    this.createdAt = data?.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data?.updatedAt ? new Date(data.updatedAt) : new Date();
    this.metadata = data?.metadata ?? {};
  }

  /**
   * Add a message to the session.
   * 
   * @param role - Message role (user, assistant, system, tool)
   * @param content - Message content
   * @param extra - Additional message properties
   */
  addMessage(role: SessionMessage["role"], content: string, extra?: Partial<SessionMessage>): void {
    const message: SessionMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    this.messages.push(message);
    this.updatedAt = new Date();
  }

  /**
   * Get message history for LLM context.
   * 
   * @param maxMessages - Maximum messages to return (default 50)
   * @returns Array of messages in LLM format
   */
  /**
   * Get message history for LLM context.
   * 
   * @param maxMessages - Maximum messages to return (default 50)
   * @returns Array of messages in LLM format
   */
  getHistory(maxMessages: number = 50): LLMMessage[] {
    console.log('[DEBUG getHistory] this.messages count:', this.messages.length);
    
    const recent = this.messages.length > maxMessages
      ? this.messages.slice(-maxMessages)
      : this.messages;

    console.log('[DEBUG getHistory] recent messages count:', recent.length);
    console.log('[DEBUG getHistory] recent messages:', JSON.stringify(recent.map(m => ({role: m.role, hasToolCalls: !!m.toolCalls, hasToolCallId: !!m.toolCallId}))));

    // Convert to LLM format, preserving tool role and metadata
    return recent.map((m) => {
      const msg: LLMMessage = {
        role: m.role as "user" | "assistant" | "system" | "tool",
        content: m.content,
      };
      // Preserve tool call information for tool responses
      if (m.role === "tool") {
        if (m.toolCallId) msg.toolCallId = m.toolCallId;
        const toolName = (m as { toolName?: string }).toolName;
        if (toolName) msg.toolName = toolName;
      }
      // Preserve tool calls for assistant messages
      if (m.toolCalls) {
        msg.toolCalls = m.toolCalls;
        // DEBUG
        console.log(`[DEBUG getHistory] assistant message has toolCalls:`, JSON.stringify(m.toolCalls));
      }
      return msg;
    });
  }

  clear(): void {
    this.messages = [];
    this.updatedAt = new Date();
  }

  /**
   * Get the total number of messages in the session.
   * 
   * @returns Total message count
   */
  getMessagesCount(): number {
    return this.messages.length;
  }

  /**
   * Get ALL messages in the session (not limited to recent 50).
   * 
   * @returns Array of all session messages
   */
  getAllMessages(): SessionMessage[] {
    return [...this.messages];
  }

  /**
   * Remove the earliest N messages from the session.
   * 
   * @param count - Number of earliest messages to remove
   * @returns Array of removed messages
   */
  removeMessages(count: number): SessionMessage[] {
    if (count <= 0 || this.messages.length === 0) {
      return [];
    }
    const removeCount = Math.min(count, this.messages.length);
    const removed = this.messages.splice(0, removeCount);
    this.updatedAt = new Date();
    return removed;
  }

  /**
   * Remove all messages before a given timestamp.
   * 
   * @param timestamp - ISO timestamp string (messages before this will be removed)
   * @returns Array of removed messages
   */
  removeMessagesBefore(timestamp: string): SessionMessage[] {
    if (!timestamp || this.messages.length === 0) {
      return [];
    }
    const targetTime = new Date(timestamp).getTime();
    const removeIndex = this.messages.findIndex(
      (m) => new Date(m.timestamp).getTime() >= targetTime
    );
    if (removeIndex <= 0) {
      return [];
    }
    const removed = this.messages.splice(0, removeIndex);
    this.updatedAt = new Date();
    return removed;
  }

  /**
   * Serialize session to SessionData.
   * 
   * @returns Session data object
   */
  toJSON(): SessionData {
    return {
      key: this.key,
      messages: this.messages,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      metadata: this.metadata,
    };
  }

  /**
   * Create a Session from SessionData.
   * 
   * @param data - Session data object
   * @returns New Session instance
   */
  static fromJSON(data: SessionData): Session {
    return new Session(data.key, data);
  }
}
