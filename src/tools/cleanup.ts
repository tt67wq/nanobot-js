import { Tool } from "../providers/base";
import { ContextCleaner } from "../session/cleanup";
import type { Session } from "../session/session";

/**
 * Tool to clear or compress conversation context to free up token space.
 *
 * This tool allows the agent to manage its own context window by removing
 * old messages. It supports three modes:
 * - clear: Simply remove old messages
 * - compress: Summarize old messages and store in memory
 * - smart: Extract key information and compress
 */
export class ClearContextTool extends Tool {
  name = "clear_context";
  description = "Clear or compress conversation context to free up token space";
  parameters = {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["clear", "compress", "smart"],
        description: "Cleanup mode: 'clear' removes old messages, 'compress' summarizes them, 'smart' extracts key info",
        default: "smart",
      },
      keep_recent: {
        type: "number",
        description: "Number of recent messages to keep",
        default: 20,
      },
    },
    required: [],
  };

  constructor(
    private cleaner: ContextCleaner,
    private session: Session
  ) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // Validate and normalize parameters
    const mode = this.validateMode(params.mode);
    const keepRecent = this.validateKeepRecent(params.keep_recent);

    // Perform cleanup
    const result = await this.cleaner.cleanup(this.session, {
      mode,
      force: true,
    });

    // Build response
    const lines: string[] = [
      `Cleanup ${result.cleaned ? "successful" : "skipped"}`,
      `Mode: ${mode}`,
      `Action: ${result.action}`,
    ];

    if (result.cleaned) {
      lines.push(`Messages removed: ${result.messages_removed}`);
      lines.push(`Messages kept: ${result.messages_kept}`);

      if (result.summary) {
        lines.push("");
        lines.push("Summary:");
        lines.push(result.summary);
      }

      if (result.key_info && result.key_info.length > 0) {
        lines.push("");
        lines.push("Key information extracted:");
        for (const info of result.key_info) {
          lines.push(`- ${info}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Validate and normalize the mode parameter.
   *
   * @param mode - The mode parameter from tool call
   * @returns Validated mode string
   */
  private validateMode(mode: unknown): "clear" | "compress" | "smart" {
    if (typeof mode === "string" && ["clear", "compress", "smart"].includes(mode)) {
      return mode as "clear" | "compress" | "smart";
    }
    return "smart"; // default
  }

  /**
   * Validate and normalize the keep_recent parameter.
   * Note: keep_recent is used by ContextCleaner internally from config,
   * but we include it here for API consistency.
   *
   * @param keepRecent - The keep_recent parameter from tool call
   * @returns Validated number
   */
  private validateKeepRecent(keepRecent: unknown): number {
    if (typeof keepRecent === "number" && keepRecent > 0) {
      return Math.floor(keepRecent);
    }
    return 20; // default
  }
}
