/**
 * Context builder for assembling agent prompts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IMemoryStore, ISkillsLoader, BOOTSTRAP_FILES } from "./types.js";
import type { Message } from "../providers/base.js";

interface MessageContent {
  type: string;
  [key: string]: unknown;
}

interface MediaContentItem {
  type: string;
  text?: string;
  image_url?: {
    url: string;
  };
}

type UserContent = string | MediaContentItem[];

class ContextBuilder {
  workspace: string;
  memory: IMemoryStore;
  skills: ISkillsLoader;

  /**
   * Builds the context (system prompt + messages) for the agent.
   * 
   * Assembles bootstrap files, memory, skills, and conversation history
   * into a coherent prompt for the LLM.
   */
  constructor(workspace: string, memory?: IMemoryStore | null, skills?: ISkillsLoader | null) {
    this.workspace = workspace;
    // Use provided memory or create default that returns empty string
    this.memory = memory || {
      get_memory_context: () => null
    };
    
    // Use provided skills or create default that returns empty values
    this.skills = skills || {
      get_always_skills: () => [],
      load_skills_for_context: (skills: string[]) => "",
      build_skills_summary: () => ""
    };
  }

  /**
   * Build the system prompt from bootstrap files, memory, and skills.
   * 
   * @param skillNames Optional list of skills to include.
   * @returns Complete system prompt.
   */
  buildSystemPrompt(skillNames?: string[]): string {
    const parts = [];

    // Core identity
    parts.push(this._getIdentity());

    // Bootstrap files  
    const bootstrap = this._loadBootstrapFiles();
    if (bootstrap) {
      parts.push(bootstrap);
    }

    // Memory context
    const memory = this.memory.get_memory_context();
    if (memory) {
      parts.push(`# Memory\n\n${memory}`);
    }

    // Skills - progressive loading
    // 1. Always-loaded skills: include full content
    const alwaysSkills = this.skills.get_always_skills();
    if (alwaysSkills.length > 0) {
      const alwaysContent = this.skills.load_skills_for_context(alwaysSkills);
      if (alwaysContent) {
        parts.push(`# Active Skills\n\n${alwaysContent}`);
      }
    }

    // 2. Available skills: only show summary (agent uses read_file to load)
    const skillsSummary = this.skills.build_skills_summary();
    if (skillsSummary) {
      parts.push(`# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.

${skillsSummary}`);
    }

    return parts.join("\n\n---\n\n");
  }

  /**
   * Get the core identity section.
   */
  /**
   * Get the core identity section with improved prompt engineering.
   */
  _getIdentity(): string {
    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`;
    const workspacePath = this.workspace;
    const memoryPath = `${workspacePath}/memory/MEMORY.md`;

    return `# nanobot 🐈

You are nanobot, an **autonomous** AI assistant that acts **proactively** rather than just responding passively.

## Core Principles
- **Think before act**: Analyze the user's intent and choose the best approach
- **Be curious**: Ask clarifying questions when requirements are ambiguous
- **Own the task**: Execute to completion, don't just answer questions
- **Learn proactively**: Capture important information for future sessions

## Current Time
${formattedDateTime}

## Workspace
Your workspace is at: ${workspacePath}
- Memory files: ${memoryPath}
- Daily notes: ${workspacePath}/memory/YYYY-MM-DD.md
- Custom skills: ${workspacePath}/skills/{skill-name}/SKILL.md

## Memory Management

### When to write to MEMORY.md
- User explicitly mentions preferences, habits, or personal info
- Important decisions or commitments are made
- Project-specific conventions or patterns you discover
- Anything you'd want to know if you forgot this conversation

### When to compress context (call clear_context)
- Conversation exceeds ~30 turns
- You notice repetitive context being sent to LLM
- Task is complete and worth summarizing before moving on

### Memory Format
Write in **bullet points** for easy scanning:
- ✅ "User prefers TypeScript over JavaScript"
- ✅ "Project uses Bun as runtime"
- ❌ Avoid: "We talked about TypeScript and the user said they prefer it"

## Tool Usage Guidelines

### Decision Framework
- **read_file/write_file** → Use for code, config, documentation
- **shell** → Use for git, build commands, system operations
- **web** → Use for current info, research, fact-checking
- **message** → ONLY when explicitly sending to external channels
- **clear_context** → Proactively when context grows large
- **spawn** → Use for parallel independent tasks

### Error Handling
- If a tool fails, try to understand WHY before retrying
- Don't blindly repeat failed commands
- If stuck after 2 attempts, explain the issue to user

## Handling Ambiguity

### When to ask clarifying questions
- Missing critical info (file path, exact requirement)
- Multiple valid interpretations with significantly different effort
- User's proposed approach seems problematic

### When to proceed with assumptions
- Minor details that don't affect the core task
- Standard conventions you can reasonably infer

## Constraints

### Never do without explicit confirmation
- Delete files outside workspace
- Execute commands that could be destructive (rm -rf, --force)
- Share sensitive information externally
- Modify system configuration

### If asked to do something unsafe
- Explain WHY it's unsafe
- Propose safer alternative
- Wait for explicit confirmation

## Output Guidelines
- **Code**: Use fenced code blocks with language identifier
- **File paths**: Use inline code formatting
- **Long output**: Use bullet points or tables for readability
- **Errors**: Explain what happened + what you'll do about it

---

IMPORTANT: When responding to direct questions or conversations, reply directly with your text response.
Only use the 'message' tool when you need to send a message to a specific chat channel.
For normal conversation, just respond with text - do not call the message tool.

Always be helpful, accurate, and concise. When using tools, explain what you're doing.
When remembering something important, write to ${memoryPath}`;
  }

  /**
   * Load all bootstrap files from workspace.
   */
  _loadBootstrapFiles(): string {
    const parts = [];

    for (const filename of BOOTSTRAP_FILES) {
      const filePath = join(this.workspace, filename);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        parts.push(`## ${filename}\n\n${content}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }

  /**
   * Build the complete message list for an LLM call.
   * 
   * @param history Previous conversation messages.
   * @param currentMessage The new user message.
   * @param skillNames Optional skills to include.
   * @param media Optional list of local file paths for images/media.
   * @returns List of messages including system prompt.
   */
  buildMessages(
    history: Message[],
    currentMessage: string,
    skillNames?: string[],
    media?: string[]
  ): Message[] {
    const messages: Message[] = [];

    // System prompt
    const systemPrompt = this.buildSystemPrompt(skillNames);
    messages.push({ role: "system", content: systemPrompt });

    // History
    messages.push(...history);

    // Current message (with optional image attachments)
    const userContent = this._buildUserContent(currentMessage, media);
    
    messages.push({ 
      role: "user", 
      content: userContent
    });

    return messages;
  }

  /**
   * Build user message content with optional base64-encoded images.
   */
  _buildUserContent(text: string, media?: string[]): string | MessageContent[] {
    if (!media || media.length === 0) {
      return text;
    }

    const images: MessageContent[] = [];
    for (const path of media) {
      try {
        const mimeType = this._getMimeType(path);
        if (!this._isImageFile(path) || !mimeType.startsWith("image/")) {
          continue;
        }
                
        const imageData = readFileSync(path);
        const base64Data = imageData.toString('base64');
        images.push({ 
          type: "image_url", 
          image_url: { url: `data:${mimeType};base64,${base64Data}` } 
        });
      } catch {
        continue;
      }
    }

    if (images.length === 0) {
      return text;
    }
    
    return [...images, { type: "text", text }];
  }
  
  /**
   * Helper to determine if a path points to an image file
   */
  _isImageFile(path: string): boolean {
    try {
      // Check if the file exists and is a file
      const fs = require('node:fs') as typeof import('fs');
      const stats = fs.statSync(path);
      return stats.isFile();
    } catch {
      return false;
    }
  }
  
  /**
   * Helper to get MIME type based on file extension
   */
  _getMimeType(path: string): string {
    const ext = path.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg', 
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Add a tool result to the message list.
   * 
   * Supports both OpenAI format (toolCallId) and Anthropic format (toolUseId).
   * 
   * @param messages Current message list.
   * @param toolCallId ID of the tool call.
   * @param toolName Name of the tool.
   * @param result Tool execution result.
   * @returns Updated message list.
   */
  addToolResult(
    messages: Message[], 
    toolCallId: string, 
    toolName: string, 
    result: string
  ): Message[] {
    // Support both OpenAI (toolCallId) and Anthropic (toolUseId) formats
    messages.push({
      role: "tool",
      toolCallId: toolCallId,
      // @ts-ignore: Adding toolUseId to Message type for Anthropic compatibility
      toolUseId: toolCallId,
      toolName: toolName,
      content: result,
    });
    return messages;
  }

  /**
   * Add an assistant message to the message list.
   * 
   * @param messages Current message list.
   * @param content Message content.
   * @param toolCalls Optional tool calls.
   * @returns Updated message list.
   */
  addAssistantMessage(
    messages: Message[],
    content: string | null = null,
    toolCalls?: Array<Record<string, unknown>>
  ): Message[] {
    const msg: Message & { toolCalls?: Array<Record<string, unknown>> } = {
      role: "assistant",
      content: content ?? "",
    };

    if (toolCalls && toolCalls.length > 0) {
      // @ts-ignore: Adding toolCalls property which is specific to assistant messages
      msg.toolCalls = toolCalls;
    }

    messages.push(msg as Message);
    return messages;
  }
}

export { ContextBuilder };