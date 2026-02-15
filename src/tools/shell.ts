import { Tool } from "../providers/base";

export class ExecTool extends Tool {
  name = "exec";
  description = "Execute a shell command and return its output. Use with caution.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      working_dir: { type: "string", description: "Optional working directory for the command" }
    },
    required: ["command"]
  };

  constructor(
    private timeout: number = 60,
    private workingDir: string = process.cwd()
  ) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const command = params.command as string;
    const workingDir = (params.working_dir as string) || this.workingDir;
    
    if (!command) return "Error: Missing required parameter 'command'";

    const proc = Bun.spawn({
      cmd: ["/bin/sh", "-c", command],
      cwd: workingDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        proc.kill();
        resolve(`Error: Command timed out after ${this.timeout} seconds`);
      }, this.timeout * 1000);

      try {
        const stdoutBuffer = await Bun.readableStreamToText(proc.stdout);
        const stderrBuffer = await Bun.readableStreamToText(proc.stderr);
        
        const exitCode = await proc.exited;

        clearTimeout(timeoutId);

        let result = stdoutBuffer;
        if (stderrBuffer.trim()) result += `\nSTDERR:\n${stderrBuffer}`;
        if (exitCode !== 0) result += `\nExit code: ${exitCode}`;

        resolve(result || "(no output)");
      } catch (e) {
        clearTimeout(timeoutId);
        resolve(`Error executing command: ${(e as Error).message}`);
      }
    });
  }
}