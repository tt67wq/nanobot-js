import { ToolRegistry } from "../tools/registry";
import { ContextBuilder } from "./context";
import { SkillsLoader } from "./skills";
import type { InboundMessage, OutboundMessage } from "./types";
import type { LLMProvider, Message, ChatOptions } from "../providers/base";
import { SessionManager } from "../session/manager";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AgentLoopOptions {
  model?: string;
  maxIterations?: number;
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
    console.debug('[AgentLoop] Creating AgentLoop...');
    console.debug('[AgentLoop] Provider:', provider.constructor.name);
    console.debug('[AgentLoop] Model:', options?.model ?? provider.getDefaultModel());
    
    this.tools = new ToolRegistry();
    this.sessions = new SessionManager(workspace);
    this.model = options?.model ?? provider.getDefaultModel();
    this.maxIterations = options?.maxIterations ?? 20;
    this.verbose = (options as any)?.verbose ?? true;
    
    // ============================================================
    // [DEBUG] 创建 SkillsLoader 并传入 ContextBuilder
    // ============================================================
    const builtinSkillsDir = process.env.NANOBOT_BUILTIN_SKILLS || join(__dirname, "../skills");
    console.debug('[AgentLoop] Creating SkillsLoader...');
    console.debug('[AgentLoop] Workspace:', workspace);
    console.debug('[AgentLoop] Builtin skills dir:', builtinSkillsDir);
    
    const skillsLoader = new SkillsLoader(workspace, builtinSkillsDir);
    
    // 列出所有可用的 skills（用于 debug）
    const allSkills = skillsLoader.list_skills(false);
    console.debug('[AgentLoop] Found %d skills (unfiltered):', allSkills.length);
    for (const skill of allSkills) {
      console.debug('[AgentLoop]   - %s (source: %s, path: %s)', skill.name, skill.source, skill.path);
    }
    
    const availableSkills = skillsLoader.list_skills(true);
    console.debug('[AgentLoop] Found %d available skills:', availableSkills.length);
    
    // 检查 always-skills
    const alwaysSkills = skillsLoader.get_always_skills();
    console.debug('[AgentLoop] Always-loaded skills:', alwaysSkills);
    
    // 将 SkillsLoader 传入 ContextBuilder
    this.context = new ContextBuilder(workspace, null, skillsLoader);
    console.debug('[AgentLoop] SkillsLoader passed to ContextBuilder');
    // ============================================================
    
    this._registerDefaultTools();
    this._registerMcpTools();
    
    console.debug('[AgentLoop] Created successfully');
    console.debug('[AgentLoop] Max iterations:', this.maxIterations);
  }

  private _log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (!this.verbose && level === 'debug') return;
    const prefix = `[AgentLoop:${level.toUpperCase()}]`;
    const formatted = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
    if (level === 'debug') console.debug(prefix, message, formatted);
    else if (level === 'info') console.log(prefix, message, formatted);
    else if (level === 'warn') console.warn(prefix, message, formatted);
    else console.error(prefix, message, formatted);
  }

  private _registerDefaultTools(): void {
    // MVP: Stub - tools will be registered in Phase 3D
    // TODO: Register ReadFileTool, WriteFileTool, etc.
  }

  private _registerMcpTools(): void {
    // Stub: MCP will be implemented in Phase 4
    return;
  }

  async processDirect(
    content: string, 
    sessionKey: string = "cli:direct"
  ): Promise<string> {
    this._log('info', '=== processDirect() called ===');
    this._log('info', 'Session: %s, Content: "%s"', sessionKey, content.substring(0, 50));
    
    // Get or create session
    const session = this.sessions.getOrCreate(sessionKey);
    this._log('debug', 'Session history length:', session.getHistory().length);
    
    // Build messages
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
        content
      }
    ];
    
    // Agent loop
    let iteration = 0;
    let finalContent: string | null = null;
    
    while (iteration < this.maxIterations) {
      iteration++;
      
      // Call LLM
      const response = await this.provider.chat({
        messages,
        tools: this.tools.get_definitions(),
        model: this.model
      });
      
      // Handle tool calls
      if (response.toolCalls.length > 0) {
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