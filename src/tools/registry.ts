import { Tool, ToolDefinition } from '../providers/base';

/**
 * ToolRegistry class for dynamic tool management
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool with the registry
   * @param tool - Tool to register
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   * @param name - Name of the tool to unregister
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name
   * @param name - Name of the tool to get
   * @returns Tool if found, undefined otherwise
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists in the registry
   * @param name - Name of the tool to check
   * @returns true if tool exists, false otherwise
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tool definitions
   * @returns Array of tool definitions
   */
  get_definitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      definitions.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return definitions;
  }

  /**
   * Execute a tool by name
   * @param name - Name of the tool to execute
   * @param params - Parameters to pass to the tool
   * @returns Promise with result string
   */
  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    try {
      const result = await tool.execute(params);
      return result;
    } catch (error) {
      return `Error executing ${name}: ${error}`;
    }
  }

  /**
   * Get all registered tool names
   */
  get tool_names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get the number of registered tools
   */
  get length(): number {
    return this.tools.size;
  }
}