/**
 * Anthropic provider using Bun fetch.
 *
 * Supports Claude models with tool calling capabilities.
 */

import type { ChatOptions, LLMResponse, Tool, ToolDefinition, ToolCallRequest } from "./base";
import { LLMProvider } from "./base";

/**
 * Anthropic API endpoint
 */
const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Anthropic content block types
 */
interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

/**
 * Anthropic message format
 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock | AnthropicContentBlock[];
}

/**
 * Anthropic tool definition
 */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Anthropic API response
 */
interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic provider using Bun fetch.
 *
 * Implements the LLMProvider interface for Anthropic's Claude models.
 */
export type AuthType = "x-api-key" | "bearer";

export class AnthropicProvider extends LLMProvider {
  protected defaultModel: string;
  protected authType: AuthType;

  constructor(
    apiKey: string | null = null,
    apiBase: string | null = null,
    authType: AuthType = "x-api-key"
  ) {
    super(apiKey, apiBase);
    this.defaultModel = "claude-sonnet-4-20250514";
    this.authType = authType;
  }

  /**
   * Send a chat completion request to Anthropic.
   */
  async chat(options: ChatOptions): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const maxTokens = options.maxTokens ?? 4096;
    const temperature = options.temperature ?? 0.7;

    // Convert messages to Anthropic format
    const anthropicMessages = this._convertMessages(options.messages);

    // Convert tools to Anthropic format
    const anthropicTools: AnthropicTool[] | undefined = options.tools
      ? this._convertTools(options.tools)
      : undefined;

    try {
      const response = await this._makeRequest({
        model,
        maxTokens,
        messages: anthropicMessages,
        tools: anthropicTools,
        temperature,
      });

      return this._parseResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: `Error calling Anthropic: ${errorMessage}`,
        toolCalls: [],
        finishReason: "error",
        usage: {},
      };
    }
  }

  /**
   * Make request to Anthropic API using Bun fetch.
   */
  private async _makeRequest(params: {
    model: string;
    maxTokens: number;
    messages: AnthropicMessage[];
    tools?: AnthropicTool[];
    temperature: number;
  }): Promise<AnthropicResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": ANTHROPIC_API_VERSION,
    };

    if (this.apiKey) {
      if (this.authType === "bearer") {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      } else {
        headers["x-api-key"] = this.apiKey;
      }
    }

    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages: params.messages,
      temperature: params.temperature,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
    }

    const apiBase = this.apiBase || ANTHROPIC_API_BASE;
    const response = await fetch(apiBase, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<AnthropicResponse>;
  }

  /**
   * Convert messages to Anthropic format.
   *
   * Handles:
   * - OpenAI-style tool_calls → Anthropic tool_use blocks
   * - OpenAI-style tool results (role: tool) → Anthropic tool_result blocks (role: user)
   */
  private _convertMessages(messages: ChatOptions["messages"]): AnthropicMessage[] {
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      const role = msg.role;
      const content = msg.content;
      // Handle tool calls in message (from OpenAI format)
      const toolCalls = (msg as { toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }).toolCalls;

      // Handle tool result (OpenAI format: role=tool → Anthropic format: role=user with tool_result)
      if (role === "tool" && msg.toolCallId) {
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId,
              content: content || "",
            } as AnthropicToolResultBlock,
          ],
        });
      }
      // Handle tool_calls: convert OpenAI format to Anthropic tool_use blocks
      else if (toolCalls && toolCalls.length > 0) {
        const contentBlocks: AnthropicContentBlock[] = [];

        // Add text content if present
        if (content) {
          contentBlocks.push({
            type: "text",
            text: content,
          } as AnthropicTextBlock);
        }

        // Add tool_use blocks for each tool call
        for (const tc of toolCalls) {
          contentBlocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          } as AnthropicToolUseBlock);
        }

        anthropicMessages.push({
          role: (role === "system" ? "user" : role) as "user" | "assistant",
          content: contentBlocks,
        });
      }
      else if (typeof content === "string") {
        anthropicMessages.push({
          role: (role === "system" ? "user" : role) as "user" | "assistant",
          content: [
            {
              type: "text",
              text: content,
            } as AnthropicTextBlock,
          ],
        });
      }
      else {
        anthropicMessages.push({
          role: (role === "system" ? "user" : role) as "user" | "assistant",
          content: content as AnthropicContentBlock[],
        });
      }
    }

    return anthropicMessages;
  }

  /**
   * Convert OpenAI-style tools to Anthropic format.
   */
  private _convertTools(tools: ToolDefinition[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  /**
   * Parse Anthropic response into our standard format.
   */
  private _parseResponse(response: AnthropicResponse): LLMResponse {
    let content = "";
    const toolCalls: ToolCallRequest[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content = (block as AnthropicTextBlock).text;
      }
      else if (block.type === "tool_use") {
        const toolBlock = block as AnthropicToolUseBlock;
        toolCalls.push({
          id: toolBlock.id,
          name: toolBlock.name,
          arguments: toolBlock.input,
        });
      }
      // Ignore other block types (like thinking)
    }

    const usage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return {
      content,
      toolCalls,
      finishReason: this._getFinishReason(response.stop_reason),
      usage,
    };
  }

  /**
   * Convert Anthropic stop reasons to our format.
   */
  private _getFinishReason(stopReason: string | null): string {
    if (stopReason === null) {
      return "stop";
    }

    const reasonMap: Record<string, string> = {
      end_turn: "stop",
      max_tokens: "length",
      tool_use: "tool_calls",
    };

    return reasonMap[stopReason] || stopReason;
  }

  /**
   * Get the default model for this provider.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}
