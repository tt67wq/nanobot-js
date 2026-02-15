import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_HEARTBEAT_INTERVAL_S = 30 * 60;

const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;

const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

function isHeartbeatEmpty(content: string | null): boolean {
  if (!content) {
    return true;
  }

  const skipPatterns = new Set(["- [ ]", "* [ ]", "- [x]", "* [x]"]);

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("<!--") || skipPatterns.has(trimmed)) {
      continue;
    }
    return false;
  }

  return true;
}

export class HeartbeatService {
  private workspace: string;
  private onHeartbeat?: (prompt: string) => Promise<string>;
  private intervalS: number;
  private enabled: boolean;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    workspace: string,
    onHeartbeat?: (prompt: string) => Promise<string>,
    intervalS: number = DEFAULT_HEARTBEAT_INTERVAL_S,
    enabled: boolean = true
  ) {
    this.workspace = workspace;
    this.onHeartbeat = onHeartbeat;
    this.intervalS = intervalS;
    this.enabled = enabled;
  }

  private get heartbeatFile(): string {
    return join(this.workspace, "HEARTBEAT.md");
  }

  private readHeartbeatFile(): string | null {
    const filePath = this.heartbeatFile;
    if (existsSync(filePath)) {
      try {
        return readFileSync(filePath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log("Heartbeat disabled");
      return;
    }

    this.running = true;
    this.runLoop();
    console.log(`Heartbeat started (every ${this.intervalS}s)`);
  }

  private runLoop(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      if (this.running) {
        await this.tick();
        this.runLoop();
      }
    }, this.intervalS * 1000);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const content = this.readHeartbeatFile();

    if (isHeartbeatEmpty(content)) {
      console.log("Heartbeat: no tasks (HEARTBEAT.md empty)");
      return;
    }

    console.log("Heartbeat: checking for tasks...");

    if (this.onHeartbeat) {
      try {
        const response = await this.onHeartbeat(HEARTBEAT_PROMPT);

        const normalized = response.toUpperCase().replace("_", "");
        if (normalized.includes(HEARTBEAT_OK_TOKEN.toUpperCase())) {
          console.log("Heartbeat: OK (no action needed)");
        } else {
          console.log("Heartbeat: completed task");
        }
      } catch (e) {
        console.error(`Heartbeat execution failed: ${e}`);
      }
    }
  }

  async triggerNow(): Promise<string | null> {
    if (this.onHeartbeat) {
      return await this.onHeartbeat(HEARTBEAT_PROMPT);
    }
    return null;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
