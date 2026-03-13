import { ToolRegistry } from "../tools/registry";
import { ContextBuilder } from "./context";
import { SkillsLoader } from "./skills";
import { SubagentManager } from "./subagent";
import type { MessageBus } from "../bus/queue";
import { WebSearchTool, WebFetchTool, ReadFileTool, WriteFileTool, EditFileTool, ListDirTool, ExecTool, MessageTool, SpawnTool, ScreenshotTool, ClearContextTool } from "../tools";
import type { InboundMessage, OutboundMessage } from "./types";
import type { LLMProvider, Message, ChatOptions } from "../providers/base";
import { SessionManager } from "../session/manager";
import { ContextCleaner } from "../session/cleanup";
import type { MapleConfig } from "../config/schema";
import { UserStore, LearningAgent, PersonalizationAgent } from "./maple/index";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Logger } from "../utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = new Logger({ module: 'AGENT' });

/**
 * 进度事件类型
 */
export type ProgressEventType = 'tool_start' | 'tool_end' | 'thinking' | 'complete' | 'error';

/**
 * 进度事件数据
 */
export interface ProgressEvent {
  type: ProgressEventType;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  content?: string;
  iteration: number;
  error?: string;
}

export interface AgentLoopOptions {
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
  thinking?: boolean;
  /** 进度回调函数 - 在工具执行时通知外部 */
  onProgress?: (event: ProgressEvent) => void;
  /** 是否启用进度事件回调，默认 true */
  enableProgress?: boolean;
  /** 消息总线 - 用于 subagent 通知 */
  bus?: MessageBus;
  /** Brave API Key - 用于 subagent 的 web 搜索 */
  braveApiKey?: string;
}

export class AgentLoop {
  private tools: ToolRegistry;
  public context: ContextBuilder;
  private sessions: SessionManager;
  private contextCleaner!: ContextCleaner;
  private model: string;
  private maxIterations: number;
  private verbose: boolean = true;
  private currentSessionKey: string = "cli:direct";
  private thinking: boolean = false;
  private enableProgress: boolean = true;
  private onProgress?: (event: ProgressEvent) => void;
  private subagentManager?: SubagentManager;
  /** MAPLE Learning Agent（会话结束后异步触发） */
  private learningAgent?: LearningAgent;
  /** MAPLE Personalization Agent（请求路径，快速） */
  private personalizationAgent?: PersonalizationAgent;
  /**
   * 最近一次 Learning 的 Promise，供 CLI 等待（避免进程退出前异步任务被截断）
   * Gateway 模式不需要关心此字段（长期运行进程）
   */
  public lastLearningPromise?: Promise<void>;

  constructor(
    private provider: LLMProvider,
    workspace: string,
    options?: AgentLoopOptions
  ) {
    logger.debug('Creating AgentLoop...');
    logger.debug('Provider: %s', provider.constructor.name);
    logger.debug('Model: %s', options?.model ?? provider.getDefaultModel());
    
    this.tools = new ToolRegistry();
    this.sessions = new SessionManager(workspace);
    this.model = options?.model ?? provider.getDefaultModel();
    this.maxIterations = options?.maxIterations ?? 20;
    this.verbose = options?.verbose ?? true;
    this.thinking = options?.thinking ?? false;
    this.enableProgress = options?.enableProgress ?? true;
    this.onProgress = options?.onProgress;
    
    // 初始化 SubagentManager
    if (options?.bus) {
      this.subagentManager = new SubagentManager({
        provider,
        workspace,
        bus: options.bus,
        model: this.model,
        braveApiKey: options.braveApiKey,
      });
    }
    
    const builtinSkillsDir = process.env.NANOBOT_BUILTIN_SKILLS || join(__dirname, "../skills");
    logger.debug('Creating SkillsLoader...');
    logger.debug('Workspace: %s', workspace);
    logger.debug('Builtin skills dir: %s', builtinSkillsDir);
    
    const skillsLoader = new SkillsLoader(workspace, builtinSkillsDir);
    
    const allSkills = skillsLoader.list_skills(false);
    logger.debug('Found %d skills (unfiltered):', allSkills.length);
    for (const skill of allSkills) {
      logger.debug('  - %s (source: %s, path: %s)', skill.name, skill.source, skill.path);
    }
    
    const availableSkills = skillsLoader.list_skills(true);
    logger.debug('Found %d available skills:', availableSkills.length);
    
    const alwaysSkills = skillsLoader.get_always_skills();
    logger.debug('Always loaded skills: %s', alwaysSkills);
    
    this.context = new ContextBuilder(workspace, null, skillsLoader);
    logger.debug('SkillsLoader passed to ContextBuilder');

    // 注意：记忆检索系统需要外部调用 setMemorySearch 后才会初始化
    // 在 commands.ts 中配置
    
    this._registerDefaultTools();
    
    logger.debug('Created successfully');
    logger.debug('Max iterations: %d', this.maxIterations);
    logger.debug('Thinking enabled: %s', this.thinking);
  }

  private _registerDefaultTools(): void {
    // Create context cleaner with default config
    this.contextCleaner = new ContextCleaner({
      enabled: true,
      max_tokens: 100000,
      max_messages: 100,
      keep_recent: 20,
      mode: 'smart',
      compress_model: this.model,
    }, this.provider, null);
    
    // Register ClearContextTool with callback to get current session
    this.tools.register(new ClearContextTool(
      this.contextCleaner,
      this.sessions,
      () => this.currentSessionKey
    ));
    
    // Register other tools
    this.tools.register(new WebSearchTool());
    this.tools.register(new WebFetchTool());
    this.tools.register(new ReadFileTool());
    this.tools.register(new WriteFileTool());
    this.tools.register(new EditFileTool());
    this.tools.register(new ListDirTool());
    this.tools.register(new ExecTool());
    this.tools.register(new MessageTool());
    
    // Register SpawnTool with callback to SubagentManager
    const spawnTool = new SpawnTool();
    if (this.subagentManager) {
      spawnTool.setSpawnCallback((task, opts) => 
        this.subagentManager!.spawn(task, { 
          label: opts?.label,
          originChannel: 'gateway',
          originChatId: this.currentSessionKey 
        })
      );
    }
    this.tools.register(spawnTool);
    
    this.tools.register(new ScreenshotTool());
  }


  /**
   * 触发进度事件回调
   */
  private emitProgress(event: ProgressEvent, callOnProgress?: (event: ProgressEvent) => void): void {
    if (!this.enableProgress) return;
    const handler = callOnProgress ?? this.onProgress;
    if (handler) {
      try {
        handler(event);
      } catch (e) {
        logger.warn('Progress callback error: %s', String(e));
      }
    }
  }

  async processDirect(
    content: string,
    sessionKey: string = "cli:direct",
    media?: string[],
    options?: {
      /** 原始消息内容，用于记忆系统（当 content 被增强时传递） */
      rawContent?: string;
      /** 本次调用的进度回调，优先级高于构造时设置的 onProgress */
      onProgress?: (event: ProgressEvent) => void;
    }
  ): Promise<string> {
    // Update current session key for ClearContextTool
    this.currentSessionKey = sessionKey;

    // 本次调用的 onProgress 优先级高于构造时设置的默认回调，用闭包捕获避免污染实例状态
    const callOnProgress = options?.onProgress ?? this.onProgress;
    
    // ★ 优先使用原始消息内容进行记忆操作（当 content 被增强时，rawContent 包含真实用户输入）
    const memoryContent = options?.rawContent ?? content;
    
    logger.info('=== processDirect() called ===');
    logger.info('Session: %s, Content: "%s", Media: %s', sessionKey, content.substring(0, 50), media?.length ?? 0);

    // MAPLE Personalization：读取用户画像，生成注入片段（纯文件 IO，< 10ms）
    let mapleContext = "";
    if (this.personalizationAgent) {
      mapleContext = await this.personalizationAgent.buildContext(sessionKey, memoryContent);
    }

    // 提取并存储用户消息中的记忆（使用原始消息）
    await this.context.extractMemoryFromMessage(memoryContent);

    // 检索相关记忆（使用原始消息）
    const relevantMemory = await this.context.searchMemory(memoryContent);

    const session = this.sessions.getOrCreate(sessionKey);
    
    // Build user content with optional image support
    const userContent = media && media.length > 0
      ? this.context._buildUserContent(content, media)
      : content;
    
    const messages: Message[] = [
      {
        role: "system",
        content: this.context.buildSystemPrompt(undefined, mapleContext)
      },
      ...session.getHistory()
        .filter(m => {
          // 过滤掉包含 tool_calls 标记的无效 assistant 消息
          if (m.role === 'assistant' && typeof m.content === 'string' && 
              (m.content.includes('<|tool_calls_section_begin|>') || 
               m.content.includes('<|tool_call_begin|>') ||
               m.content.includes('<|function:') ||
               m.content.includes('<|assistant|>') ||
               m.content.includes('<|user|>') ||
               m.content.includes('<|system|>') ||
               m.content.includes('<|context|>') ||
               m.content.includes('<|observation|>') ||
               m.content.includes('<|message|>') ||
               m.content.includes('<|repo_info|>') ||
               m.content.includes('<|file_search_results|>') ||
               m.content.includes('<|code_interpreter'))) {
            return false;
          }
          return true;
        })
        .map(m => {
          // 保留所有角色类型，特别是 tool 角色的 toolCallId 和 toolName
          const msg: Message = {
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: m.content,
          };
          // 保留 tool 消息的关键字段
          if (m.role === "tool") {
            if (m.toolCallId) msg.toolCallId = m.toolCallId;
            if (m.toolName) msg.toolName = m.toolName;
          }
          // 保留 assistant 消息的 toolCalls
          if (m.role === "assistant" && m.toolCalls) {
            msg.tool_calls = m.toolCalls.map(tc => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments)
              }
            }));
          }
          return msg;
        }),
      {
        role: "user",
        content: userContent
      }
    ];

    // 如果有检索到相关记忆，注入到 system prompt 中
    if (relevantMemory) {
      messages[0].content = messages[0].content + "\n\n" + relevantMemory;
    }

    let iteration = 0;
    let finalContent: string | null = null;
    
    // 发送开始思考事件
    this.emitProgress({
      type: 'thinking',
      content: content.substring(0, 100),
      iteration: 0,
    }, callOnProgress);
    
    while (iteration < this.maxIterations) {
      iteration++;
      
      const response = await this.provider.chat({
        messages,
        tools: this.tools.get_definitions(),
        model: this.model,
        thinking: this.thinking
      });
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        logger.info('Tool calls: %s', response.toolCalls.map(tc => tc.name).join(', '));
        // Add assistant message with tool calls - 必须包含 tool_calls 字段
        messages.push({
          role: "assistant",
          content: response.content ?? "",
          tool_calls: response.toolCalls.map(tc => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
          }))
        } as Message);
        
        // Execute tools
        for (const toolCall of response.toolCalls) {
          // 触发工具开始事件
          this.emitProgress({
            type: 'tool_start',
            toolName: toolCall.name,
            toolArgs: toolCall.arguments,
            iteration,
          }, callOnProgress);
          
          const result = await this.tools.execute(
            toolCall.name, 
            toolCall.arguments
          );
          
          // 触发工具结束事件
          this.emitProgress({
            type: 'tool_end',
            toolName: toolCall.name,
            toolArgs: toolCall.arguments,
            toolResult: result.substring(0, 500), // 截断以避免过长
            iteration,
          }, callOnProgress);
          
          // Add tool result
          messages.push({
            role: "tool",
            content: result,
            toolCallId: toolCall.id,
            toolName: toolCall.name
          } as Message);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }
    
    // 触发完成事件
    this.emitProgress({
      type: 'complete',
      content: finalContent?.substring(0, 500),
      iteration,
    }, callOnProgress);
    
    // Save session
    session.addMessage("user", content);
    session.addMessage("assistant", finalContent ?? "");
    this.sessions.save(session);

    // MAPLE Learning：fire-and-forget，不阻塞响应路径
    // lastLearningPromise 供 CLI 在打印回复后等待，避免进程退出前被截断
    if (this.learningAgent) {
      const allMessages = session.getAllMessages();
      this.lastLearningPromise = this.learningAgent.processSession(sessionKey, allMessages)
        .catch((e: unknown) => logger.warn('[MAPLE:Learning] fire-and-forget 失败: %s', String(e)));
    }

    return finalContent ?? "No response";
  }

  /**
   * 初始化 MAPLE 个性化系统
   * 
   * 在 commands.ts 中于 setMemorySearch 之后调用。
   * 内部创建 UserStore、LearningAgent、PersonalizationAgent。
   * 
   * @param mapleConfig  maple 配置节点
   * @param provider     LLM 提供商（Learning Agent 用于 LLM 深度分析）
   */
  initMaple(mapleConfig: MapleConfig, provider: LLMProvider): void {
    if (!mapleConfig.enabled) {
      logger.debug('[MAPLE] 未启用 (maple.enabled = false)，跳过初始化');
      return;
    }

    const userStore = new UserStore(this.context.workspace);

    if (mapleConfig.personalization.enabled) {
      this.personalizationAgent = new PersonalizationAgent(userStore);
      logger.info('[MAPLE] Personalization Agent 已初始化');
    }

    if (mapleConfig.learning.enabled) {
      // context.memorySearch 是 any 类型（来自 context.ts），null 表示未配置 embedding
      // LearningAgent 内部对 null 做了安全处理，会跳过规则层
      this.learningAgent = new LearningAgent(
        this.context.memorySearch,
        provider,
        userStore,
        mapleConfig.learning.llm_model,
        mapleConfig.learning.min_messages,
        mapleConfig.learning.use_llm,
      );
      logger.info('[MAPLE] Learning Agent 已初始化 (LLM 分析: %s)', mapleConfig.learning.use_llm ? '启用' : '禁用');
    }

    logger.info('[MAPLE] MAPLE 个性化系统初始化完成');
  }
}
