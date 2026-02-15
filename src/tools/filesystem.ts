import { Tool } from "../providers/base";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

export class ReadFileTool extends Tool {
  name = "read_file";
  description = "Read the contents of a file at the given path.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      path: { type: "string", description: "The file path to read" }
    },
    required: ["path"]
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = params.path as string;
    if (!path) return "Error: Missing required parameter 'path'";
    
    try {
      if (!existsSync(path)) return `Error: File not found: ${path}`;
      const stats = statSync(path);
      if (!stats.isFile()) return `Error: Not a file: ${path}`;
      return readFileSync(path, "utf-8");
    } catch (e) {
      return `Error reading file: ${e}`;
    }
  }
}

export class WriteFileTool extends Tool {
  name = "write_file";
  description = "Write content to a file at the given path. Creates parent directories if needed.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      path: { type: "string", description: "The file path to write to" },
      content: { type: "string", description: "The content to write" }
    },
    required: ["path", "content"]
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = params.path as string;
    const content = params.content as string;
    if (!path) return "Error: Missing required parameter 'path'";
    if (content === undefined) return "Error: Missing required parameter 'content'";
    
    try {
      const dir = dirname(path);
      if (dir && !existsSync(dir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (e) {
      return `Error writing file: ${e}`;
    }
  }
}

export class EditFileTool extends Tool {
  name = "edit_file";
  description = "Edit a file by replacing old_text with new_text.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      path: { type: "string", description: "The file path to edit" },
      old_text: { type: "string", description: "The exact text to find and replace" },
      new_text: { type: "string", description: "The text to replace with" }
    },
    required: ["path", "old_text", "new_text"]
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = params.path as string;
    const oldText = params.old_text as string;
    const newText = params.new_text as string;
    if (!path) return "Error: Missing required parameter 'path'";
    if (!oldText) return "Error: Missing required parameter 'old_text'";
    if (newText === undefined) return "Error: Missing required parameter 'new_text'";
    
    try {
      if (!existsSync(path)) return `Error: File not found: ${path}`;
      const content = readFileSync(path, "utf-8");
      
      if (!content.includes(oldText)) return "Error: old_text not found in file";
      
      const count = content.split(oldText).length - 1;
      if (count > 1) return `Warning: old_text appears ${count} times. Please provide more context.`;
      
      const newContent = content.replace(oldText, newText);
      writeFileSync(path, newContent, "utf-8");
      return `Successfully edited ${path}`;
    } catch (e) {
      return `Error editing file: ${e}`;
    }
  }
}

export class ListDirTool extends Tool {
  name = "list_dir";
  description = "List the contents of a directory.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      path: { type: "string", description: "The directory path to list" }
    },
    required: ["path"]
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = params.path as string;
    if (!path) return "Error: Missing required parameter 'path'";
    
    try {
      if (!existsSync(path)) return `Error: Directory not found: ${path}`;
      const stats = statSync(path);
      if (!stats.isDirectory()) return `Error: Not a directory: ${path}`;
      
      const items = readdirSync(path).sort().map(name => {
        const itemPath = join(path, name);
        const isDir = statSync(itemPath).isDirectory();
        return `${isDir ? "📁 " : "📄 "}${name}`;
      });
      
      if (items.length === 0) return `Directory ${path} is empty`;
      return items.join("\n");
    } catch (e) {
      return `Error listing directory: ${e}`;
    }
  }
}