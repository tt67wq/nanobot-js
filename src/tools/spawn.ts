import { Tool } from "../providers/base";

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

  async execute(params: Record<string, unknown>): Promise<string> {
    return "[ERROR] SpawnTool requires Phase 3G (SubagentManager). Not yet implemented.";
  }
}