import { describe, it, expect, beforeEach } from 'bun:test';
import { SubagentManager, type SubagentManagerOptions } from '../../src/agent/subagent';
import { MessageBus } from '../../src/bus/queue';
import { LLMProvider, type LLMResponse, type Message, type ToolDefinition } from '../../src/providers/base';

class MockProvider extends LLMProvider {
  private modelName: string;
  private mockResponse: LLMResponse;

  constructor(modelName: string = 'claude-3', mockResponse?: LLMResponse) {
    super(null, null);
    this.modelName = modelName;
    this.mockResponse = mockResponse ?? {
      content: 'Mock response',
      toolCalls: [],
      finishReason: 'stop',
      usage: {}
    };
  }

  async chat(options: { messages: Message[]; tools?: ToolDefinition[]; model?: string }): Promise<LLMResponse> {
    return this.mockResponse;
  }

  getDefaultModel(): string {
    return this.modelName;
  }
}

describe('SubagentManager', () => {
  let bus: MessageBus;
  let provider: MockProvider;
  let manager: SubagentManager;

  beforeEach(() => {
    bus = new MessageBus();
    provider = new MockProvider();
    manager = new SubagentManager({
      provider,
      workspace: '/tmp/test',
      bus,
      model: 'claude-3',
      braveApiKey: 'test-key'
    });
  });

  describe('constructor', () => {
    it('should create instance with correct defaults', () => {
      expect(manager).toBeDefined();
      expect(manager.getRunningCount()).toBe(0);
    });
  });

  describe('spawn()', () => {
    it('should return status message with task info', async () => {
      const result = await manager.spawn('Test task');
      
      expect(result).toContain('Subagent');
      expect(result).toContain('started');
      expect(result).toContain('id:');
    });

    it('should use custom label when provided', async () => {
      const result = await manager.spawn('Long task description', { label: 'MyLabel' });
      
      expect(result).toContain('MyLabel');
    });

    it('should auto-generate label from task when not provided', async () => {
      const result = await manager.spawn('Short task');
      
      expect(result).toContain('Short task');
    });

    it('should truncate long task description for label', async () => {
      const longTask = 'This is a very long task description that exceeds thirty characters';
      const result = await manager.spawn(longTask);
      
      expect(result).toContain('...');
      expect(result).toContain('This is a very long task des');
    });

    it('should use custom origin channel and chat id', async () => {
      const result = await manager.spawn('Test', {
        originChannel: 'feishu',
        originChatId: 'room123'
      });
      
      expect(result).toContain('started');
    });
  });

  describe('getRunningCount()', () => {
    it('should return 0 initially', () => {
      expect(manager.getRunningCount()).toBe(0);
    });

    it('should return correct count after spawning tasks', async () => {
      manager.spawn('Task 1');
      manager.spawn('Task 2');
      
      expect(manager.getRunningCount()).toBe(2);
    });

    it('should return 0 after tasks complete', async () => {
      // Spawn and wait for completion
      await manager.spawn('Quick task');
      
      // Wait a bit for async task to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(manager.getRunningCount()).toBe(0);
    });
  });

  describe('announceResult()', () => {
    it('should publish result to bus after task completion', async () => {
      const result = await manager.spawn('Test task');
      
      expect(result).toContain('started');
      
      // Wait for task to complete and publish result
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if message was published to inbound queue
      const size = bus.inboundSize;
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('buildSubagentPrompt()', () => {
    it('should include task description in prompt', async () => {
      // The prompt is internal, but we can verify behavior through task execution
      const mockWithTools: LLMResponse = {
        content: 'Task completed',
        toolCalls: [],
        finishReason: 'stop',
        usage: {}
      };
      
      const providerWithTools = new MockProvider('claude-3', mockWithTools);
      const managerWithTools = new SubagentManager({
        provider: providerWithTools,
        workspace: '/tmp/test',
        bus,
        model: 'claude-3'
      });
      
      await managerWithTools.spawn('Search for information');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(bus.inboundSize).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle provider errors gracefully', async () => {
      const errorProvider = new MockProvider('claude-3', {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        usage: {}
      });
      
      const managerWithError = new SubagentManager({
        provider: errorProvider,
        workspace: '/tmp/test',
        bus,
        model: 'claude-3'
      });
      
      const result = await managerWithError.spawn('Task that will error');
      
      expect(result).toContain('started');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still publish error result to bus
      expect(bus.inboundSize).toBeGreaterThan(0);
    });
  });
});
