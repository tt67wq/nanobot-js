import { z } from "zod";
import { homedir } from "os";
import { join } from "path";

export const FeishuConfigSchema = z.object({
  enabled: z.boolean().default(false),
  app_id: z.string().default(""),
  app_secret: z.string().default(""),
  allow_from: z.array(z.string()).default([]),
});

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;

export const ChannelsConfigSchema = z.object({
  feishu: FeishuConfigSchema.default(() => FeishuConfigSchema.parse({})),
});

export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;

export const AgentDefaultsSchema = z.object({
  workspace: z.string().default("~/.nanobot/workspace"),
  model: z.string().default("anthropic/claude-opus-4-5"),
  max_tokens: z.number().int().default(8192),
  temperature: z.number().default(0.7),
  max_tool_iterations: z.number().int().default(20),
});

export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;

export const AgentsConfigSchema = z.object({
  defaults: AgentDefaultsSchema.default(() => AgentDefaultsSchema.parse({})),
});

export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export const ProviderConfigSchema = z.object({
  api_key: z.string().default(""),
  api_base: z.string().nullable().default(null),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const OpenAIConfigSchema = z.object({
  api_key: z.string().default(""),
  api_base: z.string().nullable().default(null),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

export const ProvidersConfigSchema = z.object({
  anthropic: ProviderConfigSchema.default(() => ProviderConfigSchema.parse({})),
  openai: OpenAIConfigSchema.default(() => OpenAIConfigSchema.parse({})),
});

export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;

export const GatewayConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().int().default(18790),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

export const WebSearchConfigSchema = z.object({
  api_key: z.string().default(""),
  max_results: z.number().int().default(5),
});

export type WebSearchConfig = z.infer<typeof WebSearchConfigSchema>;

export const WebToolsConfigSchema = z.object({
  search: WebSearchConfigSchema.default(() => WebSearchConfigSchema.parse({})),
});

export type WebToolsConfig = z.infer<typeof WebToolsConfigSchema>;

export const ToolsConfigSchema = z.object({
  web: WebToolsConfigSchema.default(() => WebToolsConfigSchema.parse({})),
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

export const MCPAuthConfigSchema = z.object({
  type: z.string().default("bearer"),
  token: z.string().default(""),
  token_env: z.string().default(""),
  api_key: z.string().default(""),
  key_env: z.string().default(""),
});

export type MCPAuthConfig = z.infer<typeof MCPAuthConfigSchema>;

export const MCPServerConfigSchema = z.object({
  name: z.string().default(""),
  url: z.string().default(""),
  enabled: z.boolean().default(true),
  auth: MCPAuthConfigSchema.default(() => MCPAuthConfigSchema.parse({})),
  timeout: z.number().int().default(30),
  retry_attempts: z.number().int().default(3),
  env: z.record(z.string()).default({}),
  env_file: z.string().nullable().default(null),
  secure_env: z.array(z.string()).default([]),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const MCPConfigSchema = z.object({
  enabled: z.boolean().default(false),
  servers: z.array(MCPServerConfigSchema).default([]),
  default_server: z.string().nullable().default(null),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

export const ConfigSchema = z.object({
  agents: AgentsConfigSchema.default(() => AgentsConfigSchema.parse({})),
  channels: ChannelsConfigSchema.default(() => ChannelsConfigSchema.parse({})),
  providers: ProvidersConfigSchema.default(() => ProvidersConfigSchema.parse({})),
  gateway: GatewayConfigSchema.default(() => GatewayConfigSchema.parse({})),
  tools: ToolsConfigSchema.default(() => ToolsConfigSchema.parse({})),
  mcp: MCPConfigSchema.default(() => MCPConfigSchema.parse({})),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

export class Config {
  public agents: AgentsConfig;
  public channels: ChannelsConfig;
  public providers: ProvidersConfig;
  public gateway: GatewayConfig;
  public tools: ToolsConfig;
  public mcp: MCPConfig;

  constructor(config: Partial<ConfigType> = {}) {
    const parsed = ConfigSchema.parse(config);
    this.agents = parsed.agents;
    this.channels = parsed.channels;
    this.providers = parsed.providers;
    this.gateway = parsed.gateway;
    this.tools = parsed.tools;
    this.mcp = parsed.mcp;
  }

  get workspacePath(): string {
    let workspace = this.agents.defaults.workspace;
    if (workspace.startsWith("~/")) {
      workspace = join(homedir(), workspace.slice(2));
    }
    return workspace;
  }

  getApiKey(): string | null {
    return this.providers.anthropic.api_key || null;
  }

  getApiBase(): string | null {
    return this.providers.anthropic.api_base;
  }
}