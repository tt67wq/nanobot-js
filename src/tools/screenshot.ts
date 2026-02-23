import { Tool } from "../providers/base";
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Screenshot tool - Capture screenshots on macOS
 * 
 * Uses macOS screencapture command to capture screen or window
 */
export class ScreenshotTool extends Tool {
  name = "screenshot";
  description = "Capture a screenshot of the screen or a specific window. Returns the path to the saved screenshot file.";
  
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["screen", "window"],
        default: "screen",
        description: "What to capture: 'screen' for full screen, 'window' for specific window"
      },
      index: {
        type: "number",
        description: "Window index (if mode is 'window', optional - defaults to 1)"
      }
    }
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const mode = (params.mode as string) || "screen";
    
    // Create temp directory for screenshots
    const tempDir = join(tmpdir(), "nanobot_screenshots");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    const outputPath = join(tempDir, `screenshot_${Date.now()}.png`);
    
    try {
      let cmd: string;
      
      if (mode === "screen") {
        // Full screen capture (silent, no interaction)
        cmd = `screencapture -x "${outputPath}"`;
      } else {
        // Window capture
        const index = (params.index as number) || 1;
        // -W flag selects window, -i for interactive but we use index
        cmd = `screencapture -x -W ${index} "${outputPath}"`;
      }
      
      execSync(cmd, { stdio: "ignore" });
      
      // Verify file was created
      if (!existsSync(outputPath)) {
        return "Error: Failed to capture screenshot";
      }
      
      return outputPath;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Error capturing screenshot: ${errorMessage}`;
    }
  }
}
