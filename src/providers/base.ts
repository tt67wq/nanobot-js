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

/**
 * Content part types for messages with images.
 * Used when sending messages with image attachments.
 */
export type ContentPart = 
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface Message {
  /** Role of the message sender */
  role: "system" | "user" | "assistant" | "tool";
  /** Content of the message - string or array of content parts (text + images) */
  content: string | ContentPart[];
  /** Optional tool call ID (for tool messages) */
  toolCallId?: string;
  /** Optional tool name (for tool messages) */
  toolName?: string;
}

export interface ChatOptions {
  /** List of messages to send */
  messages: Message[];
  /** Optional tool definitions */
  tools?: ToolDefinition[];
  /** Model identifier (provider-specific) */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
}

/**
 * Abstract base class for tools.
 */
export abstract class Tool {
  /** Tool name */
  abstract name: string;
  /** Tool description */
  abstract description: string;
  /** JSON schema for tool parameters */
  abstract parameters: Record<string, unknown>;

  /**
   * Execute the tool with the given parameters.
   */
  abstract execute(params: Record<string, unknown>): Promise<string>;

  /**
   * Convert the tool to OpenAI function calling format.
   */
  toSchema(): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Type alias for tool schema representation used in API calls.
 */
export type ToolDefinition = Pick<Tool, "name" | "description" | "parameters">;

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
