/**
 * Context cleanup module for managing session message overflow.
 *
 * Handles automatic cleanup of conversation history when it grows too large.
 * Supports multiple cleanup modes: clear, compress, and smart extraction.
 */

import type { Session } from "./session";
import type { SessionMessage } from "./types";
import type { LLMProvider, Message, ChatOptions, LLMResponse } from "../providers/base";
import type { ContextCleanupConfig } from "../config/schema";
import { MemoryStore } from "../agent/memory";

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Whether cleanup was performed */
  cleaned: boolean;
  /** Number of messages removed */
  messages_removed: number;
  /** Number of messages kept */
  messages_kept: number;
  /** Description of what was done */
  action: string;
  /** Summarized/compressed content if applicable */
  summary?: string;
  /** Key information extracted if in smart mode */
  key_info?: string[];
}

/**
 * Options for cleanup operation
 */
export interface CleanupOptions {
  /** Force cleanup even if not needed */
  force?: boolean;
  /** Override default mode */
  mode?: "clear" | "compress" | "smart";
  /** Override max tokens threshold */
  maxTokens?: number;
  /** Override max messages threshold */
  maxMessages?: number;
}

/**
 * ContextCleaner handles automatic cleanup of session messages
 * when they exceed configured limits.
 *
 * Features:
 * - Conservative token estimation (content.length / 2)
 * - Multiple cleanup modes: clear, compress, smart
 * - Concurrent safety with session locks
 * - Circular dependency prevention
 * - Integration with MemoryStore for long-term storage
 */
export class ContextCleaner {
  /** Whether a cleanup operation is currently running */
  private isCleaning: boolean = false;
  /** Map of session keys to their lock states */
  private sessionLocks: Map<string, boolean> = new Map();
  /** Cleanup configuration */
  private config: ContextCleanupConfig;
  /** LLM provider for compression/extraction tasks */
  private provider: LLMProvider | null;
  /** Memory store for saving summaries */
  private memoryStore: MemoryStore | null;

  /**
   * Create a new ContextCleaner.
   *
   * @param config - Cleanup configuration
   * @param provider - Optional LLM provider for compression tasks
   * @param memoryStore - Optional memory store for saving summaries
   */
  constructor(
    config: ContextCleanupConfig,
    provider: LLMProvider | null = null,
    memoryStore: MemoryStore | null = null
  ) {
    this.config = config;
    this.provider = provider;
    this.memoryStore = memoryStore;
  }

  /**
   * Estimate the number of tokens in a message.
   * Uses conservative estimation: content.length / 2
   *
   * @param content - Message content
   * @returns Estimated token count
   */
  estimateTokens(content: string): number {
    // Conservative estimate: assume ~2 characters per token on average
    return Math.ceil(content.length / 2);
  }

  /**
   * Estimate total tokens for an array of messages.
   *
   * @param messages - Array of session messages
   * @returns Total estimated token count
   */
  estimateTokensForMessages(messages: SessionMessage[]): number {
    return messages.reduce((total, msg) => {
      return total + this.estimateTokens(msg.content);
    }, 0);
  }

  /**
   * Check if a session needs cleanup based on configured limits.
   *
   * @param session - The session to check
   * @returns Object with needed flag and reason string
   */
  needsCleanup(session: Session): { needed: boolean; reason: string } {
    if (!this.config.enabled) {
      return { needed: false, reason: "Cleanup is disabled" };
    }

    const messageCount = session.getMessagesCount();
    const messages = session.getAllMessages();
    const estimatedTokens = this.estimateTokensForMessages(messages);

    // Check message count limit
    if (messageCount > this.config.max_messages) {
      return {
        needed: true,
        reason: `Message count (${messageCount}) exceeds limit (${this.config.max_messages})`,
      };
    }

    // Check token limit
    if (estimatedTokens > this.config.max_tokens) {
      return {
        needed: true,
        reason: `Estimated tokens (${estimatedTokens}) exceeds limit (${this.config.max_tokens})`,
      };
    }

    return { needed: false, reason: "Within limits" };
  }

  /**
   * Acquire a lock for a session to prevent concurrent cleanup.
   *
   * @param sessionKey - Unique session identifier
   * @returns Whether lock was acquired
   */
  private acquireLock(sessionKey: string): boolean {
    if (this.sessionLocks.get(sessionKey)) {
      return false;
    }
    this.sessionLocks.set(sessionKey, true);
    return true;
  }

  /**
   * Release the lock for a session.
   *
   * @param sessionKey - Unique session identifier
   */
  private releaseLock(sessionKey: string): void {
    this.sessionLocks.delete(sessionKey);
  }

  /**
   * Perform cleanup on a session.
   *
   * @param session - The session to clean up
   * @param options - Optional cleanup options
   * @returns Promise resolving to cleanup result
   */
  async cleanup(session: Session, options: CleanupOptions = {}): Promise<CleanupResult> {
    // Check global cleaning flag (prevent circular dependency)
    if (this.isCleaning) {
      return {
        cleaned: false,
        messages_removed: 0,
        messages_kept: session.getMessagesCount(),
        action: "Skipped: cleanup already in progress",
      };
    }

    // Check session-specific lock
    if (!this.acquireLock(session.key)) {
      return {
        cleaned: false,
        messages_removed: 0,
        messages_kept: session.getMessagesCount(),
        action: "Skipped: session locked by another cleanup",
      };
    }

    this.isCleaning = true;

    try {
      // Determine if cleanup is needed
      const check = this.needsCleanup(session);
      if (!check.needed && !options.force) {
        return {
          cleaned: false,
          messages_removed: 0,
          messages_kept: session.getMessagesCount(),
          action: `Skipped: ${check.reason}`,
        };
      }

      const mode = options.mode ?? this.config.mode;
      const messages = session.getAllMessages();
      const totalMessages = messages.length;
      const keepRecent = this.config.keep_recent;

      // Calculate how many messages to remove
      let removeCount = 0;
      const maxMessages = options.maxMessages ?? this.config.max_messages;
      const maxTokens = options.maxTokens ?? this.config.max_tokens;

      // Check message count limit
      if (totalMessages > maxMessages) {
        removeCount = Math.max(removeCount, totalMessages - maxMessages);
      }

      // Check token limit
      const estimatedTokens = this.estimateTokensForMessages(messages);
      if (estimatedTokens > maxTokens) {
        // Estimate how many messages to remove to get under token limit
        const avgTokensPerMessage = estimatedTokens / totalMessages;
        const messagesToRemove = Math.ceil((estimatedTokens - maxTokens) / avgTokensPerMessage);
        removeCount = Math.max(removeCount, messagesToRemove);
      }

      // Ensure we keep at least keep_recent messages
      const maxRemovable = Math.max(0, totalMessages - keepRecent);
      removeCount = Math.min(removeCount, maxRemovable);

      if (removeCount <= 0) {
        return {
          cleaned: false,
          messages_removed: 0,
          messages_kept: totalMessages,
          action: "No messages to remove (keep_recent limit reached)",
        };
      }

      // Split messages into old (to be removed) and recent (to keep)
      const oldMessages = messages.slice(0, removeCount);
      const keptMessages = totalMessages - removeCount;

      let summary: string | undefined;
      let keyInfo: string[] | undefined;

      // Perform cleanup based on mode
      switch (mode) {
        case "clear":
          // Simple clear: just remove old messages
          session.removeMessages(removeCount);
          break;

        case "compress":
          // Compress old messages into a summary
          if (this.provider) {
            summary = await this.compress(oldMessages);
            if (summary && this.memoryStore) {
              this.memoryStore.appendToday(`Session ${session.key} summary:\n${summary}`);
            }
          }
          session.removeMessages(removeCount);
          break;

        case "smart":
          // Extract key information and compress
          if (this.provider) {
            keyInfo = await this.extractKeyInfo(oldMessages);
            summary = await this.compress(oldMessages);
            if (summary && this.memoryStore) {
              const memoryContent = [
                `Session ${session.key} summary:`,
                summary,
                keyInfo && keyInfo.length > 0 ? `Key information:\n${keyInfo.join("\n")}` : "",
              ]
                .filter(Boolean)
                .join("\n\n");
              this.memoryStore.appendToday(memoryContent);
            }
          }
          session.removeMessages(removeCount);
          break;

        default:
          // Default to clear mode
          session.removeMessages(removeCount);
      }

      return {
        cleaned: true,
        messages_removed: removeCount,
        messages_kept: keptMessages,
        action: `Cleaned ${removeCount} messages using ${mode} mode`,
        summary,
        key_info: keyInfo,
      };
    } finally {
      this.isCleaning = false;
      this.releaseLock(session.key);
    }
  }

  /**
   * Compress an array of messages into a concise summary.
   *
   * @param messages - Messages to compress
   * @returns Promise resolving to compressed summary string
   */
  async compress(messages: SessionMessage[]): Promise<string> {
    if (!this.provider) {
      return "Compression unavailable: no LLM provider configured";
    }

    if (messages.length === 0) {
      return "";
    }

    // Format messages for the LLM
    const messageContent = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n\n");

    const systemPrompt =
      "You are a conversation summarizer. Create a concise summary of the following conversation, " +
      "preserving key facts, decisions, and context. Be brief but informative.";

    const chatOptions: ChatOptions = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContent },
      ],
      model: this.config.compress_model,
      maxTokens: 500,
      temperature: 0.3,
    };

    try {
      const response: LLMResponse = await this.provider.chat(chatOptions);
      return response.content ?? "Failed to generate summary";
    } catch (error) {
      return `Compression failed: ${String(error)}`;
    }
  }

  /**
   * Extract key information from an array of messages.
   *
   * @param messages - Messages to analyze
   * @returns Promise resolving to array of key information strings
   */
  async extractKeyInfo(messages: SessionMessage[]): Promise<string[]> {
    if (!this.provider) {
      return [];
    }

    if (messages.length === 0) {
      return [];
    }

    // Format messages for the LLM
    const messageContent = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n\n");

    const systemPrompt =
      "Extract key facts, decisions, and important information from this conversation. " +
      "Return as a JSON array of strings, each representing one key fact. " +
      'Example: ["User asked about project deadlines", "Agreed to use TypeScript"]';    
    const chatOptions: ChatOptions = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContent },
      ],
      model: this.config.compress_model,
      maxTokens: 1000,
      temperature: 0.3,
    };

    try {
      const response: LLMResponse = await this.provider.chat(chatOptions);
      const content = response.content ?? "[]";

      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      } catch {
        // If JSON parsing fails, split by newlines
        return content
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith("["));
      }
    } catch (error) {
      return [`Extraction failed: ${String(error)}`];
    }

    return [];
  }

  /**
   * Update the cleanup configuration.
   *
   * @param config - New configuration
   */
  updateConfig(config: ContextCleanupConfig): void {
    this.config = config;
  }

  /**
   * Update the LLM provider.
   *
   * @param provider - New LLM provider
   */
  setProvider(provider: LLMProvider | null): void {
    this.provider = provider;
  }

  /**
   * Update the memory store.
   *
   * @param memoryStore - New memory store
   */
  setMemoryStore(memoryStore: MemoryStore | null): void {
    this.memoryStore = memoryStore;
  }

  /**
   * Get current cleanup configuration.
   *
   * @returns Current configuration
   */
  getConfig(): ContextCleanupConfig {
    return { ...this.config };
  }

  /**
   * Check if cleanup is currently in progress.
   *
   * @returns Whether cleanup is running
   */
  isCleanupInProgress(): boolean {
    return this.isCleaning;
  }

  /**
   * Check if a specific session is locked.
   *
   * @param sessionKey - Session key to check
   * @returns Whether session is locked
   */
  isSessionLocked(sessionKey: string): boolean {
    return this.sessionLocks.get(sessionKey) ?? false;
  }
}
