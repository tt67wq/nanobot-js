import { ToolRegistry } from "../tools/registry";
import { ContextBuilder } from "./context";
import { SkillsLoader } from "./skills";
import { WebSearchTool, WebFetchTool, ReadFileTool, WriteFileTool, EditFileTool, ListDirTool, ExecTool, MessageTool, SpawnTool, ScreenshotTool } from "../tools";
import type { InboundMessage, OutboundMessage } from "./types";
import type { LLMProvider, Message, ChatOptions } from "../providers/base";
import { SessionManager } from "../session/manager";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Logger } from "../utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = new Logger({ module: 'AGENT' });

export interface AgentLoopOptions {
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
}

export class AgentLoop {
  private tools: ToolRegistry;
  private context: ContextBuilder;
  private sessions: SessionManager;
  private model: string;
  private maxIterations: number;
  private verbose: boolean = true;
  
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
    logger.debug('Always-loaded skills: %s', alwaysSkills);
    
    this.context = new ContextBuilder(workspace, null, skillsLoader);
    logger.debug('SkillsLoader passed to ContextBuilder');
    
    this._registerDefaultTools();
    this._registerMcpTools();
    
    logger.debug('Created successfully');
    logger.debug('Max iterations: %d', this.maxIterations);
  }

  private _registerDefaultTools(): void {
    this.tools.register(new WebSearchTool());
    this.tools.register(new WebFetchTool());
    this.tools.register(new ReadFileTool());
    this.tools.register(new WriteFileTool());
    this.tools.register(new EditFileTool());
    this.tools.register(new ListDirTool());
    this.tools.register(new ExecTool());
    this.tools.register(new MessageTool());
    this.tools.register(new SpawnTool());
    this.tools.register(new ScreenshotTool());
  }

  private _registerMcpTools(): void {
    return;
  }

  async processDirect(
    content: string, 
    sessionKey: string = "cli:direct",
    media?: string[]
  ): Promise<string> {
    logger.info('=== processDirect() called ===');
    logger.info('Session: %s, Content: "%s", Media: %s', sessionKey, content.substring(0, 50), media?.length ?? 0);
    
    const session = this.sessions.getOrCreate(sessionKey);
    
    // Build user content with optional image support
    const userContent = media && media.length > 0
      ? this.context._buildUserContent(content, media)
      : content;
    
    const messages: Message[] = [
      {
        role: "system",
        content: this.context.buildSystemPrompt()
      },
      ...session.getHistory().map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content
      })),
      {
        role: "user",
        content: userContent
      }
    ];
    
    let iteration = 0;
    let finalContent: string | null = null;
    
    while (iteration < this.maxIterations) {
      iteration++;
      
      const response = await this.provider.chat({
        messages,
        tools: this.tools.get_definitions(),
        model: this.model
      });
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool calls
        messages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCallId: response.toolCalls[0].id,
          toolName: response.toolCalls[0].name
        } as Message);
        
        // Execute tools
        for (const toolCall of response.toolCalls) {
          const result = await this.tools.execute(
            toolCall.name, 
            toolCall.arguments
          );
          
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
    
    // Save session
    session.addMessage("user", content);
    session.addMessage("assistant", finalContent ?? "");
    this.sessions.save(session);
    
    return finalContent ?? "No response";
  }
}