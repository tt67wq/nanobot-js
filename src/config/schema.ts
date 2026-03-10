import { z } from "zod";
import { homedir } from "os";
import { join } from "path";


// Feishu (飞书) configuration
export const FeishuConfigSchema = z.object({
  enabled: z.boolean().default(false),
  app_id: z.string().default(""),
  app_secret: z.string().default(""),
  bot_user_id: z.string().default(""),
  allow_from: z.array(z.string()).default([]),
  // 通道级别的 fallback 消息
  fallback_message: z.string().optional(),
});

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;

// CLI (命令行) configuration
export const CliConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // CLI 场景不需要白名单，当前用户就是发送者
});

export type CliConfig = z.infer<typeof CliConfigSchema>;

export const ChannelsConfigSchema = z.object({
  feishu: FeishuConfigSchema.default(() => FeishuConfigSchema.parse({})),
  cli: CliConfigSchema.default(() => CliConfigSchema.parse({})),
  // 白名单外的 fallback 消息
  fallback_message: z.string().default("未授权用户访问，请委婉拒绝并说明原因。"),
});

export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;

export const AgentDefaultsSchema = z.object({
  workspace: z.string().default("~/.nanobot/workspace"),
  model: z.string().default("anthropic/claude-opus-4-5"),
  max_tokens: z.number().int().default(8192),
  temperature: z.number().default(0.7),
  max_tool_iterations: z.number().int().default(20),
  // 是否启用 thinking (扩展思考)
  thinking: z.boolean().default(false),
  // 是否发送进度事件回调
  progress_events: z.boolean().default(true),
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

export const EmbeddingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  api_key: z.string().default(""),
  api_base: z.string().nullable().default(null),
  model: z.string().default("text-embedding-3-small"),
});

export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

export const ToolsConfigSchema = z.object({
  web: WebToolsConfigSchema.default(() => WebToolsConfigSchema.parse({})),
});

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;


export const LoggerConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['pretty', 'json']).default('pretty'),
  output: z.enum(['console', 'file', 'both']).default('console'),
});

export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;

// Context Cleanup 配置
export const ContextCleanupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_tokens: z.number().int().default(100000),
  max_messages: z.number().int().default(100),
  keep_recent: z.number().int().default(20),
  mode: z.enum(['clear', 'compress', 'smart']).default('smart'),
  compress_model: z.string().default('anthropic/claude-sonnet-4-20250514'),
});

export type ContextCleanupConfig = z.infer<typeof ContextCleanupConfigSchema>;

// MAPLE (Memory-Augmented Personalized LLM Engine) 配置
export const MapleConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // Learning Agent 配置
  learning: z.object({
    enabled: z.boolean().default(true),
    /** 是否启用 LLM 深度分析（会话结束后异步调用） */
    use_llm: z.boolean().default(true),
    /** 使用的模型名，空字符串 = 复用 agent 默认 model */
    llm_model: z.string().default(""),
    /** 至少 N 条消息才触发 learning */
    min_messages: z.number().int().default(3),
  }).default({}),
  // Personalization Agent 配置
  personalization: z.object({
    enabled: z.boolean().default(true),
    /** 注入到 system prompt 的最大 token 数（约 300 tokens） */
    max_tokens: z.number().int().default(300),
  }).default({}),
});

export type MapleConfig = z.infer<typeof MapleConfigSchema>;

export const ConfigSchema = z.object({
  agents: AgentsConfigSchema.default(() => AgentsConfigSchema.parse({})),
  channels: ChannelsConfigSchema.default(() => ChannelsConfigSchema.parse({})),
  providers: ProvidersConfigSchema.default(() => ProvidersConfigSchema.parse({})),
  embedding: EmbeddingConfigSchema.default(() => EmbeddingConfigSchema.parse({})),
  gateway: GatewayConfigSchema.default(() => GatewayConfigSchema.parse({})),
  tools: ToolsConfigSchema.default(() => ToolsConfigSchema.parse({})),
  logger: LoggerConfigSchema.default(() => LoggerConfigSchema.parse({})),
  context_cleanup: ContextCleanupConfigSchema.default(() => ContextCleanupConfigSchema.parse({})),
  maple: MapleConfigSchema.default(() => MapleConfigSchema.parse({})),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

export class Config {
  public agents: AgentsConfig;
  public channels: ChannelsConfig;
  public providers: ProvidersConfig;
  public embedding: EmbeddingConfig;
  public gateway: GatewayConfig;
  public tools: ToolsConfig;
  public logger: LoggerConfig;
  public contextCleanup: ContextCleanupConfig;
  public maple: MapleConfig;
  constructor(config: Partial<ConfigType> = {}) {
    const parsed = ConfigSchema.parse(config);
    this.agents = parsed.agents;
    this.channels = parsed.channels;
    this.providers = parsed.providers;
    this.embedding = parsed.embedding;
    this.gateway = parsed.gateway;
    this.tools = parsed.tools;
    this.logger = parsed.logger;
    this.contextCleanup = parsed.context_cleanup;
    this.maple = parsed.maple;
  }
  // Expands ~ to home directory
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
