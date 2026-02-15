import { Tool } from "../providers/base";

export class MessageTool extends Tool {
  name = "message";
  description = "Send a message to the user.";
  parameters = {
    type: "object",
    properties: {
      content: { type: "string", description: "The message content to send" },
      channel: { type: "string", description: "Optional: target channel (feishu)" },
      chat_id: { type: "string", description: "Optional: target chat/user ID" }
    },
    required: ["content"]
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    return "[ERROR] MessageTool requires Phase 4 (MessageBus). Not yet implemented.";
  }
}