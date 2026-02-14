/**
 * Provider factory and exports.
 *
 * Creates appropriate LLM provider based on model configuration.
 */

import { Config } from "../config/index";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import {
  ChatOptions,
  LLMProvider,
  LLMResponse,
  Message,
  Tool,
  ToolCallRequest,
} from "./base";

// Re-export types from base
export type {
  ChatOptions,
  LLMResponse,
  Message,
  Tool,
  ToolCallRequest,
};

// Re-export base class
export { LLMProvider } from "./base";

// Re-export concrete providers
export { AnthropicProvider } from "./anthropic";
export { OpenAIProvider } from "./openai";

/**
 * Determine provider type based on model name.
 *
 * @param model - Model identifier (e.g., "anthropic/claude-opus-4-5", "claude-sonnet-4-20250514", "gpt-4o")
 * @returns "anthropic" for Anthropic/Claude models, "openai" for others
 */
function getProviderType(model: string): "anthropic" | "openai" {
  const lowerModel = model.toLowerCase();

  // Anthropic models: start with "anthropic/" or "claude-"
  if (lowerModel.startsWith("anthropic/") || lowerModel.startsWith("claude-")) {
    return "anthropic";
  }

  // Default to OpenAI for all other models
  return "openai";
}

/**
 * Create an LLM provider based on configuration.
 *
 * @param config - Application configuration
 * @returns Appropriate LLMProvider instance
 *
 * @example
 * ```typescript
 * import { Config, createProvider } from "./providers/index.ts";
 *
 * const config = new Config();
 * const provider = createProvider(config);
 * ```
 */
export function createProvider(config: Config): LLMProvider {
  const model = config.agents.defaults.model;
  const providerType = getProviderType(model);

  if (providerType === "anthropic") {
    const apiKey = config.providers.anthropic.api_key || null;
    const apiBase = config.providers.anthropic.api_base || null;
    return new AnthropicProvider(apiKey, apiBase);
  }

  // OpenAI or compatible (default)
  const apiKey = config.providers.openai.api_key || null;
  const apiBase = config.providers.openai.api_base || null;
  return new OpenAIProvider(apiKey, apiBase);
}
