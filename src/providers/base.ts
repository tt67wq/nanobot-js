/**
 * Base LLM provider interface.
 */

export interface ToolCallRequest {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool to call */
  name: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  /** Text content from the LLM */
  content: string | null;
  /** List of tool calls requested by the LLM */
  toolCalls: ToolCallRequest[];
  /** Reason why the response finished */
  finishReason: string;
  /** Token usage statistics */
  usage: Record<string, number>;
}

export interface Message {
  /** Role of the message sender */
  role: "system" | "user" | "assistant" | "tool";
  /** Content of the message */
  content: string;
  /** Optional tool call ID (for tool messages) */
  toolCallId?: string;
  /** Optional tool name (for tool messages) */
  toolName?: string;
}

export interface ChatOptions {
  /** List of messages to send */
  messages: Message[];
  /** Optional tool definitions */
  tools?: Tool[];
  /** Model identifier (provider-specific) */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
}

export interface Tool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON schema for tool parameters */
  parameters: Record<string, unknown>;
}

/**
 * Abstract base class for LLM providers.
 *
 * Implementations should handle the specifics of each provider's API
 * while maintaining a consistent interface.
 */
export abstract class LLMProvider {
  protected apiKey: string | null;
  protected apiBase: string | null;

  constructor(apiKey: string | null = null, apiBase: string | null = null) {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  /**
   * Send a chat completion request.
   */
  abstract chat(options: ChatOptions): Promise<LLMResponse>;

  /**
   * Get the default model for this provider.
   */
  abstract getDefaultModel(): string;

  /**
   * Check if response contains tool calls.
   */
  hasToolCalls(response: LLMResponse): boolean {
    return response.toolCalls.length > 0;
  }
}
