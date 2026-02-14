/**
 * OpenAI provider using Bun fetch.
 *
 * Supports OpenAI-compatible models including GPT, MiniMax, Azure OpenAI, etc.
 */

import type { ChatOptions, LLMResponse, Tool, ToolCallRequest } from "./base";
import { LLMProvider } from "./base";

/**
 * Default OpenAI API base URL
 */
const OPENAI_API_BASE = "https://api.openai.com/v1";

/**
 * OpenAI message format for API requests
 */
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

/**
 * OpenAI tool definition format
 */
interface OpenAIToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OpenAITool {
  type: "function";
  function: OpenAIToolFunction;
}

/**
 * OpenAI tool call format in response
 */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI message in response
 */
interface OpenAIMessageResponse {
  role: "assistant" | "system" | "user" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

/**
 * OpenAI API response
 */
interface OpenAIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessageResponse;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI provider using Bun fetch.
 *
 * Implements the LLMProvider interface for OpenAI-compatible APIs.
 * Supports custom API bases for MiniMax, Azure OpenAI, and other compatible providers.
 */
export class OpenAIProvider extends LLMProvider {
  protected defaultModel: string;

  constructor(apiKey: string | null = null, apiBase: string | null = null) {
    super(apiKey, apiBase);
    this.defaultModel = "gpt-4o-mini";
  }

  /**
   * Send a chat completion request to OpenAI-compatible API.
   */
  async chat(options: ChatOptions): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const maxTokens = options.maxTokens ?? 4096;
    const temperature = options.temperature ?? 0.7;

    try {
      const response = await this._makeRequest({
        model,
        maxTokens,
        messages: options.messages,
        tools: options.tools,
        temperature,
      });

      return this._parseResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: `Error calling OpenAI: ${errorMessage}`,
        toolCalls: [],
        finishReason: "error",
        usage: {},
      };
    }
  }

  /**
   * Make request to OpenAI API using Bun fetch.
   */
  private async _makeRequest(params: {
    model: string;
    maxTokens: number;
    messages: ChatOptions["messages"];
    tools?: Tool[];
    temperature: number;
  }): Promise<OpenAIResponse> {
    const baseUrl = this.apiBase || OPENAI_API_BASE;
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const openaiMessages: OpenAIMessage[] = this._convertMessages(params.messages);

    const openaiTools: OpenAITool[] | undefined = params.tools
      ? this._convertTools(params.tools)
      : undefined;

    const body: Record<string, unknown> = {
      model: params.model,
      messages: openaiMessages,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    };

    if (openaiTools && openaiTools.length > 0) {
      body.tools = openaiTools;
      body.tool_choice = "auto";
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<OpenAIResponse>;
  }

  /**
   * Convert messages to OpenAI format.
   */
  private _convertMessages(messages: ChatOptions["messages"]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === "tool") {
        openaiMsg.tool_call_id = msg.toolCallId;
        openaiMsg.name = msg.toolName;
      }

      return openaiMsg;
    });
  }

  /**
   * Convert tools to OpenAI format.
   */
  private _convertTools(tools: Tool[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Parse OpenAI response into our standard format.
   */
  private _parseResponse(response: OpenAIResponse): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;

    let content = message.content || "";
    const toolCalls: ToolCallRequest[] = [];

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        const rawArgs = tc.function.arguments;

        if (typeof rawArgs === "string") {
          try {
            parsedArgs = JSON.parse(rawArgs);
          } catch {
            // Keep empty object on parse failure
          }
        } else {
          parsedArgs = rawArgs as Record<string, unknown>;
        }

        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    const reasoningDetails = (message as { reasoning_details?: Array<{ text: string }> }).reasoning_details;
    if (reasoningDetails && reasoningDetails.length > 0) {
      const thinkingContent = `[Thinking: ${reasoningDetails[0].text}]`;
      if (content) {
        content = thinkingContent + "\n\n" + content;
      } else {
        content = thinkingContent;
      }
    }

    const usage: Record<string, number> = {};
    if (response.usage) {
      usage.promptTokens = response.usage.prompt_tokens;
      usage.completionTokens = response.usage.completion_tokens;
      usage.totalTokens = response.usage.total_tokens;
    }

    return {
      content,
      toolCalls,
      finishReason: this._getFinishReason(choice.finish_reason),
      usage,
    };
  }

  /**
   * Convert OpenAI finish reasons to our format.
   */
  private _getFinishReason(finishReason: string | null | undefined): string {
    if (!finishReason) {
      return "stop";
    }

    const reasonMap: Record<string, string> = {
      stop: "stop",
      length: "length",
      tool_calls: "tool_calls",
      content_filter: "content_filter",
    };

    return reasonMap[finishReason] || finishReason;
  }

  /**
   * Get the default model for this provider.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}
