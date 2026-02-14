import { ToolRegistry } from "../tools/registry";
import { ContextBuilder } from "./context";
import type { InboundMessage, OutboundMessage } from "./types";
import type { LLMProvider, Message, ChatOptions } from "../providers/base";
import { SessionManager } from "../session/manager";

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
  
  constructor(
    private provider: LLMProvider,
    workspace: string,
    options?: AgentLoopOptions
  ) {
    this.tools = new ToolRegistry();
    this.context = new ContextBuilder(workspace);
    this.sessions = new SessionManager(workspace);
    this.model = options?.model ?? provider.getDefaultModel();
    this.maxIterations = options?.maxIterations ?? 20;
    
    this._registerDefaultTools();
    this._registerMcpTools();
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
    // Get or create session
    const session = this.sessions.getOrCreate(sessionKey);
    
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