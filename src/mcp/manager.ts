/**
 * MCP Client Manager - 管理 MCP 服务器连接和工具调用
 * 
 * 直接实现 MCP 协议 (JSON-RPC over stdio)
 */

import type { MCPServerConfig } from '../config/schema';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
    mimeType?: string;
  }>;
  isError?: boolean;
}

interface MCPMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

/**
 * 恢复被配置加载器转换的环境变量名
 * 例如: m_i_n_i_m_a_x__a_p_i__k_e_y -> MINIMAX_API_KEY
 */
function restoreEnvKey(key: string): string {
  return key
    .replace(/__/g, '\x00')
    .replace(/_/g, '')
    .replace(/\x00/g, '_')
    .toUpperCase();
}

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  method: string;
}

export class MCPClientManager {
  private processes: Map<string, { 
    proc: any; 
    stdin: any; 
    stdout: any;
    readerStarted: boolean;
  }> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private resources: Map<string, MCPResource[]> = new Map();
  private requestId = 0;
  
  // 待处理的请求
  private pendingRequests = new Map<string, Map<number, PendingRequest>>();
  
  /**
   * 连接到 MCP 服务器
   */
  async connect(serverConfig: MCPServerConfig): Promise<void> {
    const name = serverConfig.name;
    const command = serverConfig.command;
    const args = serverConfig.args || [];
    const cwd = serverConfig.cwd;
    const env = serverConfig.env || {};
    const secure_env = serverConfig.secure_env || [];
    
    if (!name) throw new Error('MCP server name is required');
    if (!command) throw new Error(`MCP server '${name}': command is required`);
    
    // 构建环境变量
    const envVars: Record<string, string> = { ...process.env } as any;
    for (const [key, value] of Object.entries(env)) {
      const restoredKey = restoreEnvKey(key);
      envVars[restoredKey] = value;
    }
    for (const key of secure_env) {
      const envValue = process.env[key];
      if (envValue) envVars[key] = envValue;
    }
    
    console.log(`[MCP] Starting server: ${command} ${args.join(' ')}`);
    
    const proc = Bun.spawn({
      cmd: [command, ...args],
      cwd,
      env: envVars,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    if (!proc.stdin || !proc.stdout) {
      throw new Error(`Failed to create stdio for MCP server '${name}'`);
    }
    
    this.processes.set(name, { proc, stdin: proc.stdin, stdout: proc.stdout, readerStarted: false });
    this.pendingRequests.set(name, new Map());
    
    // 读取 stderr
    (async () => {
      for await (const chunk of proc.stderr) {
        const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        if (text.trim()) console.log(`[MCP stderr] ${text}`);
      }
    })();
    
    // 启动 stdout reader
    this.startReader(name);
    
    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 发送 initialize 请求
    try {
      const initResult = await this.sendRequest(name, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'nanobot', version: '1.0.0' }
      });
      
      console.log(`[MCP] Server initialized:`, JSON.stringify(initResult).substring(0, 100));
      
      // 发送 initialized 通知
      await this.sendNotification(name, 'notifications/initialized', {});
      
      // 发现工具
      const toolsResult = await this.sendRequest(name, 'tools/list', {});
      console.log(`[MCP] tools/list result:`, JSON.stringify(toolsResult).substring(0, 200));
      
      const toolList = toolsResult?.tools || [];
      this.tools.set(name, toolList.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      })));
      
    } catch (e) {
      console.warn(`[MCP] Failed to initialize '${name}':`, e);
      this.tools.set(name, []);
    }
    
    console.log(`[MCP] Connected to '${name}' with ${this.getTools(name).length} tools`);
  }
  
  /**
   * 启动持久的 stdout reader
   */
  private startReader(name: string): void {
    const procInfo = this.processes.get(name);
    if (!procInfo || procInfo.readerStarted) return;
    
    procInfo.readerStarted = true;
    const requests = this.pendingRequests.get(name)!;
    const proc = procInfo.proc;
    
    (async () => {
      let buffer = '';
      
      for await (const chunk of procInfo.stdout) {
        const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        buffer += text;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const response = JSON.parse(line) as MCPMessage;
            console.log(`[MCP] Received:`, JSON.stringify(response).substring(0, 100));
            
            // 处理响应
            if (response.id !== undefined) {
              const pending = requests.get(Number(response.id));
              if (pending) {
                requests.delete(Number(response.id));
                if (response.error) {
                  pending.reject(new Error(`MCP error: ${response.error.message}`));
                } else {
                  pending.resolve(response.result);
                }
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    })();
  }
  
  /**
   * 发送请求
   */
  private sendRequest(name: string, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const procInfo = this.processes.get(name);
      if (!procInfo) {
        reject(new Error(`MCP server '${name}' not connected`));
        return;
      }
      
      const id = ++this.requestId;
      const requests = this.pendingRequests.get(name)!;
      requests.set(id, { resolve, reject, method });
      
      const message: MCPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      const messageStr = JSON.stringify(message) + '\n';
      console.log(`[MCP] Sending ${method}:`, messageStr.substring(0, 100));
      procInfo.stdin.write(messageStr);
      
      // 设置超时
      setTimeout(() => {
        if (requests.has(id)) {
          requests.delete(id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 10000);
    });
  }
  
  /**
   * 发送通知
   */
  private async sendNotification(name: string, method: string, params: any): Promise<void> {
    const procInfo = this.processes.get(name);
    if (!procInfo) return;
    
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };
    
    const messageStr = JSON.stringify(message) + '\n';
    procInfo.stdin.write(messageStr);
  }
  
  /**
   * 断开连接
   */
  async disconnect(name: string): Promise<void> {
    const procInfo = this.processes.get(name);
    if (procInfo) {
      procInfo.proc.kill();
      this.processes.delete(name);
      this.pendingRequests.delete(name);
      this.tools.delete(name);
      this.resources.delete(name);
    }
  }
  
  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    for (const name of this.processes.keys()) {
      await this.disconnect(name);
    }
  }
  
  /**
   * 获取工具列表
   */
  getTools(name: string): MCPTool[] {
    return this.tools.get(name) || [];
  }
  
  /**
   * 获取所有工具
   */
  getAllTools(): Array<{ server: string; tools: MCPTool[] }> {
    return Array.from(this.tools.entries()).map(([server, tools]) => ({ server, tools }));
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.processes.has(serverName)) {
      throw new Error(`MCP server '${serverName}' is not connected`);
    }
    
    try {
      const result = await this.sendRequest(serverName, 'tools/call', {
        name: toolName,
        arguments: args
      });
      
      return {
        content: result.content || [],
        isError: result.isError
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `Error: ${e}` }],
        isError: true
      };
    }
  }
  
  /**
   * 获取资源列表
   */
  getResources(name: string): MCPResource[] {
    return this.resources.get(name) || [];
  }
  
  /**
   * 读取资源
   */
  async readResource(name: string, uri: string): Promise<any> {
    if (!this.processes.has(name)) {
      throw new Error(`MCP server '${name}' is not connected`);
    }
    
    return await this.sendRequest(name, 'resources/read', { uri });
  }
  
  /**
   * 检查连接状态
   */
  isConnected(name: string): boolean {
    return this.processes.has(name);
  }
  
  /**
   * 获取已连接的服务器列表
   */
  getConnectedServers(): string[] {
    return Array.from(this.processes.keys());
  }
}
