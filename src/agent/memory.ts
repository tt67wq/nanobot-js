import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IMemoryStore } from "./types";
import { Logger } from "../utils/logger";

const logger = new Logger({ module: 'MEMORY' });

export class MemoryStore implements IMemoryStore {
  private memoryDir: string;
  private memoryFile: string;

  constructor(workspace: string) {
    this.memoryDir = join(workspace, "memory");
    this.memoryFile = join(this.memoryDir, "MEMORY.md");
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private todayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  getTodayFile(): string {
    return join(this.memoryDir, `${this.todayDate()}.md`);
  }

  readToday(): string {
    const path = this.getTodayFile();
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf-8");
  }

  appendToday(content: string): void {
    const path = this.getTodayFile();
    let finalContent: string;

    if (existsSync(path)) {
      const existing = readFileSync(path, "utf-8");
      finalContent = existing + "\n" + content;
    } else {
      finalContent = `# ${this.todayDate()}\n\n${content}`;
    }

    writeFileSync(path, finalContent, "utf-8");
  }

  readLongTerm(): string {
    if (!existsSync(this.memoryFile)) return "";
    return readFileSync(this.memoryFile, "utf-8");
  }

  writeLongTerm(content: string): void {
    writeFileSync(this.memoryFile, content, "utf-8");
  }

  getRecentMemories(days: number = 7): string {
    const memories: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const path = join(this.memoryDir, `${dateStr}.md`);

      if (existsSync(path)) {
        memories.push(readFileSync(path, "utf-8"));
      }
    }

    return memories.join("\n\n---\n\n");
  }

  getMemoryContext(): string {
    const parts: string[] = [];

    const longTerm = this.readLongTerm();
    if (longTerm) {
      parts.push(`## Long-term Memory\n${longTerm}`);
    }

    const today = this.readToday();
    if (today) {
      parts.push(`## Today's Notes\n${today}`);
    }

    return parts.join("\n\n");
  }

  // Implement IMemoryStore interface
  get_memory_context(): string | null {
    try {
      const parts: string[] = [];

      const longTerm = this.readLongTermSync();
      if (longTerm) {
        parts.push(`## Long-term Memory\n${longTerm}`);
      }

      const today = this.readTodaySync();
      if (today) {
        parts.push(`## Today's Notes\n${today}`);
      }

      return parts.join("\n\n") || null;
    } catch (error) {
      logger.error('Error getting memory context: %s', String(error));
      return null;
    }
  }

  private readTodaySync(): string {
    const path = this.getTodayFile();
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf-8");
  }

  private readLongTermSync(): string {
    if (!existsSync(this.memoryFile)) return "";
    return readFileSync(this.memoryFile, "utf-8");
  }
}