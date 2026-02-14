import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolRegistry } from '../../src/tools/registry';
import { Tool } from '../../src/providers/base';

// Define TestTool class locally for testing
class TestTool extends Tool {
  constructor(public name: string, public description: string, public parameters: Record<string, unknown> = {}) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // Simulate successful execution
    if (this.name === 'error-tool') {
      throw new Error('Execution failed');
    }
    return `Executed ${this.name} with params: ${JSON.stringify(params)}`;
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register()', () => {
    it('should add a tool and verify get() returns it', () => {
      const tool = new TestTool('test-tool', 'A test tool');
      registry.register(tool);
      
      const retrievedTool = registry.get('test-tool');
      expect(retrievedTool).toBe(tool);
      expect(registry.has('test-tool')).toBe(true);
    });
  });

  describe('unregister()', () => {
    it('should remove an existing tool', () => {
      const tool = new TestTool('test-tool', 'A test tool');
      registry.register(tool);
      
      expect(registry.has('test-tool')).toBe(true);
      registry.unregister('test-tool');
      expect(registry.has('test-tool')).toBe(false);
      expect(registry.get('test-tool')).toBeUndefined();
    });

    it('should be a no-op for non-existent tool', () => {
      // Should not throw or cause issues
      registry.unregister('non-existent-tool');
      expect(registry.get('non-existent-tool')).toBeUndefined();
    });
  });

  describe('get()', () => {
    it('should return the tool if found', () => {
      const tool = new TestTool('found-tool', 'A found tool');
      registry.register(tool);
      
      const retrievedTool = registry.get('found-tool');
      expect(retrievedTool).toBe(tool);
    });

    it('should return undefined if tool not found', () => {
      const retrievedTool = registry.get('not-found-tool');
      expect(retrievedTool).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('should return true if tool exists', () => {
      const tool = new TestTool('existing-tool', 'An existing tool');
      registry.register(tool);
      
      expect(registry.has('existing-tool')).toBe(true);
    });

    it('should return false if tool does not exist', () => {
      expect(registry.has('missing-tool')).toBe(false);
    });
  });

  describe('get_definitions()', () => {
    it('should return empty array when no tools', () => {
      const definitions = registry.get_definitions();
      expect(definitions).toEqual([]);
    });

    it('should return definition for single tool', () => {
      const parameters = {
        type: 'object',
        properties: {},
        required: []
      };
      const tool = new TestTool('single-tool', 'A single tool', parameters);
      registry.register(tool);
      
      const definitions = registry.get_definitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toEqual({
        name: 'single-tool',
        description: 'A single tool',
        parameters: parameters
      });
    });

    it('should return definitions for multiple tools', () => {
      const parameters1 = {
        type: 'object',
        properties: {},
        required: []
      };
      const parameters2 = {
        type: 'object',
        properties: {},
        required: []
      };
      const tool1 = new TestTool('first-tool', 'First tool', parameters1);
      const tool2 = new TestTool('second-tool', 'Second tool', parameters2);
      registry.register(tool1);
      registry.register(tool2);
      
      const definitions = registry.get_definitions();
      expect(definitions).toHaveLength(2);
      
      const names = definitions.map(d => d.name);
      expect(names).toContain('first-tool');
      expect(names).toContain('second-tool');
    });
  });

  describe('execute()', () => {
    it('should return tool execution result string on success', async () => {
      const tool = new TestTool('success-tool', 'A success tool');
      registry.register(tool);
      
      const result = await registry.execute('success-tool', {});
      expect(result).toBe('Executed success-tool with params: {}');
    });

    it('should return "Error: Tool \'{name}\' not found" when tool does not exist', async () => {
      const result = await registry.execute('missing-tool', {});
      expect(result).toBe("Error: Tool 'missing-tool' not found");
    });

    it('should return "Error executing {name}: {error}" when execution fails', async () => {
      const errorTool = new TestTool('error-tool', 'An error tool');
      registry.register(errorTool);
      
      const result = await registry.execute('error-tool', {});
      // Check if the result starts with expected format since error might include Error object details
      expect(result.startsWith('Error executing error-tool:')).toBe(true);
    });
  });

  describe('tool_names getter', () => {
    it('should return array of registered tool names', () => {
      const tool1 = new TestTool('first', 'First tool');
      const tool2 = new TestTool('second', 'Second tool');
      registry.register(tool1);
      registry.register(tool2);
      
      const names = registry.tool_names;
      expect(names).toHaveLength(2);
      expect(names).toContain('first');
      expect(names).toContain('second');
    });

    it('should return empty array when no tools', () => {
      const names = registry.tool_names;
      expect(names).toEqual([]);
    });
  });

  describe('length getter', () => {
    it('should return count of registered tools', () => {
      expect(registry.length).toBe(0);
      
      const tool1 = new TestTool('first', 'First tool');
      registry.register(tool1);
      expect(registry.length).toBe(1);
      
      const tool2 = new TestTool('second', 'Second tool');
      registry.register(tool2);
      expect(registry.length).toBe(2);
      
      registry.unregister('first');
      expect(registry.length).toBe(1);
    });
  });
});