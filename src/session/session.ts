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
  getHistory(maxMessages: number = 50): LLMMessage[] {
    const recent = this.messages.length > maxMessages
      ? this.messages.slice(-maxMessages)
      : this.messages;

    // Convert to LLM format (role + content only)
    return recent.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
    }));
  }

  clear(): void {
    this.messages = [];
    this.updatedAt = new Date();
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
