import { randomUUID } from 'node:crypto';
import type { LLMProvider, Message } from '../providers/base';
import { ToolRegistry } from '../tools/registry';
import { MessageBus } from '../bus/queue';
import type { InboundMessage } from '../bus/events';

import { ReadFileTool } from '../tools/filesystem';
import { WriteFileTool } from '../tools/filesystem';
import { ListDirTool } from '../tools/filesystem';
import { ExecTool } from '../tools/shell';
import { WebSearchTool } from '../tools/web';
import { WebFetchTool } from '../tools/web';
import { Logger } from '../utils/logger';

const logger = new Logger({ module: 'SUBAGENT' });

interface SpawnOptions {
  label?: string;
  originChannel?: string;
  originChatId?: string;
}

interface Origin {
  channel: string;
  chatId: string;
}

interface Task {
  id: string;
  label: string;
  promise: Promise<void>;
}

export interface SubagentManagerOptions {
  provider: LLMProvider;
  workspace: string;
  bus: MessageBus;
  model?: string;
  braveApiKey?: string;
}

export class SubagentManager {
  private provider: LLMProvider;
  private workspace: string;
  private bus: MessageBus;
  private model: string;
  private braveApiKey?: string;
  private runningTasks: Map<string, Task> = new Map();

  constructor(options: SubagentManagerOptions) {
    this.provider = options.provider;
    this.workspace = options.workspace;
    this.bus = options.bus;
    this.model = options.model ?? options.provider.getDefaultModel();
    this.braveApiKey = options.braveApiKey;
  }

  async spawn(task: string, options?: SpawnOptions): Promise<string> {
    const taskId = randomUUID().slice(0, 8);
    
    const displayLabel = options?.label 
      ?? (task.length > 30 ? task.slice(0, 30) + '...' : task);
    
    const origin: Origin = {
      channel: options?.originChannel ?? 'cli',
      chatId: options?.originChatId ?? 'direct',
    };

    const taskPromise = this.runSubagent(taskId, task, displayLabel, origin);
    
    const taskObj: Task = {
      id: taskId,
      label: displayLabel,
      promise: taskPromise,
    };
    this.runningTasks.set(taskId, taskObj);
    
    taskPromise
      .then(() => this.runningTasks.delete(taskId))
      .catch(() => this.runningTasks.delete(taskId));
    
    logger.info('Spawned [%s]: %s', taskId, displayLabel);
    
    return `Subagent [${displayLabel}] started (id: ${taskId}). I'll notify you when it completes.`;
  }

  private async runSubagent(
    taskId: string,
    task: string,
    label: string,
    origin: Origin
  ): Promise<void> {
    logger.info('[%s] Starting task: %s', taskId, label);
    
    try {
      const tools = new ToolRegistry();
      tools.register(new ReadFileTool());
      tools.register(new WriteFileTool());
      tools.register(new ListDirTool());
      tools.register(new ExecTool(60, this.workspace));
      tools.register(new WebSearchTool(this.braveApiKey ?? ""));
      tools.register(new WebFetchTool());
      
      const systemPrompt = this.buildSubagentPrompt(task);
      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ];
      
      const maxIterations = 15;
      let iteration = 0;
      let finalResult: string | null = null;
      
      while (iteration < maxIterations) {
        iteration++;
        
        const response = await this.provider.chat({
          messages,
          tools: tools.get_definitions(),
          model: this.model,
        });
        
        if (response.toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
            toolCallId: response.toolCalls[0].id,
            toolName: response.toolCalls[0].name,
          } as Message);
          
          for (const toolCall of response.toolCalls) {
            logger.info('[%s] Executing: %s', taskId, toolCall.name);
            const result = await tools.execute(toolCall.name, toolCall.arguments);
            messages.push({
              role: 'tool',
              content: result,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            } as Message);
          }
        } else {
          finalResult = response.content;
          break;
        }
      }
      
      if (finalResult === null) {
        finalResult = 'Task completed but no final response was generated.';
      }
      
      logger.info('[%s] Completed successfully', taskId);
      
      await this.announceResult(taskId, label, task, finalResult, origin, 'ok');
      
    } catch (error) {
      const errorMsg = `Error: ${error}`;
      logger.error('[%s] Failed: %s', taskId, String(error));
      
      await this.announceResult(taskId, label, task, errorMsg, origin, 'error');
    }
  }

  async announceResult(
    taskId: string,
    label: string,
    task: string,
    result: string,
    origin: Origin,
    status: 'ok' | 'error'
  ): Promise<void> {
    const statusText = status === 'ok' ? 'completed successfully' : 'failed';
    
    const announceContent = `[Subagent '${label}' ${statusText}]

Task: ${task}

Result:
${result}

Summarize this naturally for the user. Keep it brief (1-2 sentences). Do not mention technical details like "subagent" or task IDs.`;
    
    const msg: InboundMessage = {
      channel: 'system',
      senderId: 'subagent',
      chatId: `${origin.channel}:${origin.chatId}`,
      content: announceContent,
    };
    
    await this.bus.publishInbound(msg);
    logger.info('[%s] Announced result to %s:%s', taskId, origin.channel, origin.chatId);
  }

  private buildSubagentPrompt(task: string): string {
    return `# Subagent

You are a subagent spawned by the main agent to complete a specific task.

## Your Task
${task}

## Rules
1. Stay focused - complete only the assigned task, nothing else
2. Your final response will be reported back to the main agent
3. Do not initiate conversations or take on side tasks
4. Be concise but informative in your findings

## What You Can Do
- Read and write files in the workspace
- Execute shell commands
- Search the web and fetch web pages
- Complete the task thoroughly

## What You Cannot Do
- Send messages directly to users (no message tool available)
- Spawn other subagents
- Access the main agent's conversation history

## Workspace
Your workspace is at: ${this.workspace}

When you have completed the task, provide a clear summary of your findings or actions.`;
  }

  getRunningCount(): number {
    return this.runningTasks.size;
  }
}
