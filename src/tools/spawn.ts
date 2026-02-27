import { Tool } from "../providers/base";

interface SpawnOptions {
  label?: string;
  originChannel?: string;
  originChatId?: string;
}

export class SpawnTool extends Tool {
  name = "spawn";
  description = "Spawn a subagent to handle a task in the background.";
  parameters = {
    type: "object",
    properties: {
      task: { type: "string", description: "The task for the subagent to complete" },
      label: { type: "string", description: "Optional short label for the task" }
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
