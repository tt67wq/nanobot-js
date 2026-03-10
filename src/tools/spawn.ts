import { Tool } from "../providers/base";

interface SpawnOptions {
  label?: string;
  originChannel?: string;
  originChatId?: string;
}

export class SpawnTool extends Tool {
  name = "spawn";
  description = "启动一个后台子任务（subagent）。子任务会独立执行，完成后自动通知结果。适用于需要并行处理的任务，如查询信息、执行耗时操作等。";
  parameters = {
    type: "object",
    properties: {
      task: { type: "string", description: "子任务的具体内容描述" },
      label: { type: "string", description: "可选的任务标签，用于识别任务" }
    },
    required: ["task"]
  };
  
  private spawnCallback?: (task: string, options?: SpawnOptions) => Promise<string>;
  
  setSpawnCallback(callback: (task: string, options?: SpawnOptions) => Promise<string>): void {
    this.spawnCallback = callback;
  }
  
  async execute(params: Record<string, unknown>): Promise<string> {
    if (!this.spawnCallback) {
      return "[ERROR] SpawnTool not initialized. SubagentManager not provided.";
    }
    
    const task = params.task as string;
    const label = params.label as string | undefined;
    
    return await this.spawnCallback(task, { label });
  }
}
