/**
 * Kimi (Moonshot) provider using Anthropic-compatible API.
 *
 * Extends AnthropicProvider with Kimi-specific fixes for:
 * - tool_calls / toolCalls field name handling
 * - reasoning_content preservation for thinking mode
 * - Message format quirks
 *
 * Uses the Anthropic-messages compatible endpoint at api.kimi.com/coding
 */

import type { ChatOptions, LLMResponse, ToolDefinition } from "./base";
import { AnthropicProvider } from "./anthropic";

// Kimi uses Bearer auth by default
type AuthType = "x-api-key" | "bearer";

/**
 * Kimi provider extending Anthropic with Kimi-specific fixes.
 *
 * Kimi's api.kimi.com/coding endpoint is mostly Anthropic-compatible but has
 * some quirks that require special handling:
 *
 * 1. When thinking is enabled, assistant messages with tool_calls must include
 *    reasoning_content field
 * 2. Field name inconsistencies between tool_calls (snake_case) and toolCalls (camelCase)
 */
export class KimiProvider extends AnthropicProvider {
  constructor(
    apiKey: string | null = null,
    apiBase: string | null = null,
    authType: AuthType = "bearer"
  ) {
    // Kimi uses Bearer auth by default
    super(apiKey, apiBase, authType);
    this.defaultModel = "kimi-k2.5";
  }

  /**
   * Override chat to add Kimi-specific message preprocessing.
   */
  async chat(options: ChatOptions): Promise<LLMResponse> {
    // Pre-process messages to handle Kimi-specific requirements
    const processedOptions = this._preprocessMessages(options);
    return super.chat(processedOptions);
  }

  /**
   * Pre-process messages for Kimi compatibility.
   *
   * Fixes:
   * - Ensure assistant messages with tool_calls have reasoning_content when thinking
   * - Normalize tool_calls field names
   */
  private _preprocessMessages(options: ChatOptions): ChatOptions {
    const messages = options.messages.map((msg, index) => {
      // Handle tool_calls field name inconsistencies
      const msgAny = msg as any;
      const toolCalls = msgAny.tool_calls || msgAny.toolCalls;

      // For assistant messages with tool_calls, ensure reasoning_content is set
      if (msg.role === "assistant" && toolCalls && toolCalls.length > 0) {
        // If reasoning_content is missing but we have previous thinking content,
        // we need to extract it from the content or create a placeholder
        if (!msgAny.reasoning_content && msg.content) {
          const content = typeof msg.content === "string" ? msg.content : "";
          // Extract thinking content from [Thinking: ...] format
          const thinkingMatch = content.match(/\[Thinking: ([\s\S]*?)\]\n\n/);
          if (thinkingMatch) {
            msgAny.reasoning_content = thinkingMatch[1];
          }
        }
      }

      // Normalize to tool_calls (snake_case) for internal consistency
      if (msgAny.toolCalls && !msgAny.tool_calls) {
        msgAny.tool_calls = msgAny.toolCalls;
      }

      return msg;
    });

    return {
      ...options,
      messages,
    };
  }

  /**
   * Get default model for Kimi.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

export default KimiProvider;