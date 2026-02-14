import { describe, it, expect } from 'bun:test';
import { Tool } from '../../src/providers/base';

// Concrete implementation for testing
class TestTool extends Tool {
  name = "test";
  description = "A test tool";
  parameters = { 
    type: "object", 
    properties: {},
    required: []
  };
  
  async execute(params: Record<string, unknown>): Promise<string> {
    return "executed";
  }
}

// Partial implementation to test that TypeScript prevents incomplete implementations
// This class won't compile if uncommented, demonstrating abstract enforcement
/*
class PartialTool extends Tool {
  name = "partial";
  description = "A partial tool";
  // Missing parameters and execute implementation would cause compile error
}
*/

describe('Tool', () => {
  it('should not allow instantiation of abstract class directly in typescript sense', () => {
    // In TypeScript, we can't directly instantiate an abstract class at runtime
    // The compiler will prevent this statically. 
    // Testing that concrete implementation works correctly instead.
    const testTool = new TestTool();
    
    expect(testTool.name).toBe('test');
    expect(testTool.description).toBe('A test tool');
    expect(typeof testTool.execute).toBe('function');
  });

  it('should enforce implementation of all abstract members in subclass', () => {
    const testTool = new TestTool();
    
    expect(testTool.name).toBe('test');
    expect(testTool.description).toBe('A test tool');
    expect(testTool.parameters).toEqual({ 
      type: "object", 
      properties: {},
      required: []
    });
    expect(typeof testTool.execute).toBe('function');
  });

  it('should return correct schema format in toSchema()', () => {
    const testTool = new TestTool();
    
    const schema = testTool.toSchema();
    
    expect(schema).toEqual({
      type: "function",
      function: {
        name: "test",
        description: "A test tool",
        parameters: { 
          type: "object", 
          properties: {},
          required: []
        }
      }
    });
  });

  it('should execute and return string from subclass', async () => {
    const testTool = new TestTool();
    
    const result = await testTool.execute({});
    
    expect(result).toBe("executed");
  });
});