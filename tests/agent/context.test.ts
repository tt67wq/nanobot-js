import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ContextBuilder } from '../../src/agent/context';
import { Message } from '../../src/providers/base';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BOOTSTRAP_FILES } from '../../src/agent/types';

interface IMemoryStore {
  get_memory_context: () => string | null;
}

interface ISkillsLoader {
  get_always_skills: () => string[];
  load_skills_for_context: (skills: string[]) => string;
  build_skills_summary: () => string;
}

describe('ContextBuilder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create an instance with workspace only (memory/skills optional)', () => {
    const builder = new ContextBuilder(tempDir);
    
    expect(builder).toBeInstanceOf(ContextBuilder);
    expect(builder.workspace).toBe(tempDir);
  });

  describe('_loadBootstrapFiles', () => {
    it('loads bootstrap files content when they exist', async () => {
      const bootstrapPath = path.join(tempDir, BOOTSTRAP_FILES[0]);
      await fs.writeFile(bootstrapPath, 'This is bootstrap content');

      const builder = new ContextBuilder(tempDir);
      const bootstrapContent = builder._loadBootstrapFiles();
      
      expect(bootstrapContent).toContain('This is bootstrap content');
    });

    it('handles loading bootstrap files gracefully when no files exist', async () => {
      const builder = new ContextBuilder(tempDir);
      const bootstrapContent = builder._loadBootstrapFiles();
      
      expect(bootstrapContent).toBe('');
    });
  });

  describe('buildSystemPrompt', () => {
    it('builds system prompt containing identity, workspace, and bootstrap content', async () => {
      const bootstrapPath = path.join(tempDir, BOOTSTRAP_FILES[0]);
      await fs.writeFile(bootstrapPath, 'Bootstrap content here');
      
      const builder = new ContextBuilder(tempDir);

      const systemPrompt = builder.buildSystemPrompt();
      
      expect(systemPrompt).toContain('nanobot');
      expect(systemPrompt).toContain(tempDir);
      expect(systemPrompt).toContain('Bootstrap content here');
    });

    it('includes memory and skills in system prompt when provided', () => {
      const mockMemory: IMemoryStore = {
        get_memory_context: () => 'Memory context content'
      };
      
      const mockSkills: ISkillsLoader = {
        get_always_skills: () => ['testSkill'],
        load_skills_for_context: (skills: string[]) => 'Skill content for testSkill',
        build_skills_summary: () => 'Test skill available'
      };

      const builder = new ContextBuilder(tempDir, mockMemory, mockSkills);
      const systemPrompt = builder.buildSystemPrompt();

      expect(systemPrompt).toContain('Memory context content');
      expect(systemPrompt).toContain('Skill content for testSkill');
      expect(systemPrompt).toContain('Test skill available');
    });
  });

  describe('buildMessages', () => {
    it('creates correct message structure with system, history, and user message', () => {
      const builder = new ContextBuilder(tempDir);
      
      const history: Message[] = [
        { role: 'user', content: 'Previous user message' },
        { role: 'assistant', content: 'Previous assistant response' }
      ];
      const currentMessage = 'Current user message';

      const messages = builder.buildMessages(history, currentMessage);

      expect(messages.length).toBe(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1]).toEqual({ role: 'user', content: 'Previous user message' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Previous assistant response' });
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toContain('Current user message');
    });
    
    it('includes history in the message sequence', () => {
      const builder = new ContextBuilder(tempDir);
      
      const history: Message[] = [
        { role: 'user', content: 'First user message' },
        { role: 'assistant', content: 'First assistant response' },
        { role: 'user', content: 'Second user message' }
      ];
      const currentMessage = 'Current user message';

      const messages = builder.buildMessages(history, currentMessage);

      const messageContents = messages.map(m => m.content);
      expect(messageContents.includes('First user message')).toBe(true);
      expect(messageContents.includes('First assistant response')).toBe(true);
      expect(messageContents.includes('Second user message')).toBe(true);
      expect(messageContents.some(c => c.includes('Current user message'))).toBe(true);
    });
    
    it('puts current message as the last message', () => {
      const builder = new ContextBuilder(tempDir);
      
      const history: Message[] = [
        { role: 'user', content: 'History user message' },
        { role: 'assistant', content: 'History assistant message' }
      ];
      const currentMessage = 'Last user message';

      const messages = builder.buildMessages(history, currentMessage);

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toContain('Last user message');
    });
  });

  describe('addToolResult', () => {
    it('adds tool message with toolCallId, toolName, and result to the message list', () => {
      const builder = new ContextBuilder(tempDir);
      const initialMessages: Message[] = [
        { role: 'user', content: 'Initial message' }
      ];
      
      const toolCallId = 'tool-call-123';
      const toolName = 'testTool';
      const result = 'Tool result content';
      
      const updatedMessages = builder.addToolResult(initialMessages, toolCallId, toolName, result);
      
      expect(updatedMessages.length).toBe(2);
      expect(updatedMessages[1].role).toBe('tool');
      expect((updatedMessages[1] as any).toolCallId).toBe(toolCallId);
      expect((updatedMessages[1] as any).toolUseId).toBe(toolCallId);
      expect((updatedMessages[1] as any).toolName).toBe(toolName);
      expect(updatedMessages[1].content).toBe(result);
    });
  });

  describe('addAssistantMessage', () => {
    it('adds assistant message to the message list correctly', () => {
      const builder = new ContextBuilder(tempDir);
      const initialMessages: Message[] = [
        { role: 'user', content: 'Initial message' }
      ];
      
      const content = 'Assistant response';
      
      const updatedMessages = builder.addAssistantMessage(initialMessages, content);
      
      expect(updatedMessages.length).toBe(2);
      expect(updatedMessages[1].role).toBe('assistant');
      expect(updatedMessages[1].content).toBe(content);
    });
    
    it('handles null content gracefully', () => {
      const builder = new ContextBuilder(tempDir);
      const initialMessages: Message[] = [
        { role: 'user', content: 'Initial message' }
      ];
      
      const updatedMessages = builder.addAssistantMessage(initialMessages, null);
      
      expect(updatedMessages.length).toBe(2);
      expect(updatedMessages[1].role).toBe('assistant');
      expect(updatedMessages[1].content).toBe('');
    });
  });
});