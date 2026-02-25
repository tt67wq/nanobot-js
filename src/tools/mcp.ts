/**
 * MCP 工具适配器 - 将 MCP 工具封装为 nanobot 工具
 */

import { Tool } from '../providers/base';
import { MCPClientManager, type MCPTool } from '../mcp/manager';

/**
 * MCP 工具适配器 - 将 MCP 工具封装为 nanobot Tool
 */
export class MCPToolAdapter extends Tool {
  // 工具元数据
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  
  /**
   * @param mcpManager MCP 客户端管理器
   * @param serverName MCP 服务器名称
   * @param mcpTool MCP 工具定义
   */
  constructor(
    private mcpManager: MCPClientManager,
    private serverName: string,
    private mcpTool: MCPTool
  ) {
    super();
    this.name = `mcp_${serverName}_${mcpTool.name}`;
    this.description = `[${serverName}] ${mcpTool.description}`;
    this.parameters = mcpTool.inputSchema;
  }
  
  // 执行工具
  async execute(params: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.mcpManager.callTool(
        this.serverName,
        this.mcpTool.name,
        params
      );
      
      if (result.isError) {
        return JSON.stringify({
          error: true,
          content: result.content
        });
      }
      
      return JSON.stringify({
        error: false,
        content: result.content
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // 获取原始 MCP 工具信息
  getMcpToolInfo(): { server: string; tool: MCPTool } {
    return {
      server: this.serverName,
      tool: this.mcpTool
    };
  }
  
  // 获取服务器名称
  getServerName(): string {
    return this.serverName;
  }
}

/**
 * MCP 资源读取工具
 */
export class MCPResourceTool extends Tool {
  name = 'mcp_resource';
  description = 'Read content from MCP server resources. Usage: server (name), uri (resource URI)';
  
  parameters = {
    type: 'object',
    properties: {
      server: { 
        type: 'string', 
        description: 'MCP server name to read resource from' 
      },
      uri: { 
        type: 'string', 
        description: 'Resource URI to read' 
      }
    },
    required: ['server', 'uri']
  };
  
  constructor(private mcpManager: MCPClientManager) {
    super();
  }
  
  async execute(params: Record<string, unknown>): Promise<string> {
    const server = params.server as string;
    const uri = params.uri as string;
    
    if (!server || !uri) {
      return JSON.stringify({
        error: true,
        message: 'Missing required parameters: server and uri'
      });
    }
    
    try {
      const result = await this.mcpManager.readResource(server, uri);
      return JSON.stringify({
        error: false,
        contents: result.contents
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // 获取可用的服务器和资源列表
  getAvailableResources(): Array<{ server: string; resources: Array<{ uri: string; name: string }> }> {
    const result: Array<{ server: string; resources: Array<{ uri: string; name: string }> }> = [];
    
    for (const server of this.mcpManager.getConnectedServers()) {
      const resources = this.mcpManager.getResources(server);
      result.push({
        server,
        resources: resources.map(r => ({ uri: r.uri, name: r.name }))
      });
    }
    
    return result;
  }
}

/**
 * MCP 服务器信息工具
 */
export class MCPServerInfoTool extends Tool {
  name = 'mcp_servers';
  description = 'List connected MCP servers and their available tools';
  
  parameters = {
    type: 'object',
    properties: {}
  };
  
  constructor(private mcpManager: MCPClientManager) {
    super();
  }
  
  async execute(_params: Record<string, unknown>): Promise<string> {
    const servers = this.mcpManager.getConnectedServers();
    
    const serverInfo = servers.map(server => ({
      name: server,
      tools: this.mcpManager.getTools(server).map(t => t.name),
      toolCount: this.mcpManager.getTools(server).length,
      resources: this.mcpManager.getResources(server).map(r => r.name)
    }));
    
    return JSON.stringify({
      servers: serverInfo,
      totalServers: servers.length
    });
  }
}
