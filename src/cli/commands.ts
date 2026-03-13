import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getDataDir,
} from "../config/loader";
import { getWorkspacePath } from "../utils/helpers";
import { AgentLoop, ProgressEvent } from "../agent/loop";
import { MessageBus } from "../bus/queue";
import { getSessionKey, type InboundMessage } from "../bus/events";
import { ChannelManager } from "../channels/manager";
import { CronService } from "../cron/service";
import { HeartbeatService } from "../heartbeat/service";
import { AnthropicProvider } from "../providers/anthropic";
import { OpenAIProvider } from "../providers/openai";
import { KimiProvider } from "../providers/kimi";
import { configureGlobalLogger } from "../utils/logger";
import chalk from "chalk";

const VERSION = "0.1.0";
const LOGO = `
    ____
   / __ \\__  ______  ____ ____  ____
  / / / / / / / __ \\/ __ \`/ _ \\/ __ \\
 / /_/ / /_/ / / / / /_/ /  __/ /_/
/_____/\\____/_/_/ /_/\\__, /\\___/\\____/
                   /____/
`;

const program = new Command();

program
  .name("nanobot")
  .description("nanobot - Personal AI Assistant")
  .version(VERSION, "-v, --version", "Output the version number");

program
  .command("onboard")
  .description("Initialize nanobot configuration and workspace")
  .action(async () => {
    console.log(LOGO);
    console.log("Initializing nanobot...\n");

    const configPath = getConfigPath();

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`Config already exists at ${configPath}`));
      const overwrite = await promptConfirm("Overwrite?");
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
    }

    const config = loadConfig();
    saveConfig(config);
    console.log(chalk.green("✓") + ` Created config at ${configPath}`);

    const workspace = getWorkspacePath();
    console.log(chalk.green("✓") + ` Created workspace at ${workspace}`);

    createWorkspaceTemplates(workspace);

    console.log(chalk.green("\n✓") + " nanobot is ready!");
    console.log("\nNext steps:");
    console.log(
      "  1. Add your API key to " + chalk.cyan("~/.nanobot/config.json"),
    );
    console.log(
      "     Get one at: Anthropic (https://console.anthropic.com/settings/keys) or OpenAI (https://platform.openai.com/api-keys)",
    );
    console.log("  2. Chat: " + chalk.cyan('nanobot agent -m "Hello!"'));
  });

const agentCmd = program
  .command("agent")
  .description("Interact with the agent directly");

agentCmd
  .option("-m, --message <message>", "Message to send to the agent")
  .option("-s, --session <session>", "Session ID", "cli:default")
  .option("-i, --image <paths>", "Image file path(s), comma-separated for multiple")
  .action(async (options) => {
    console.log(LOGO);

    const config = loadConfig();
    configureGlobalLogger(config.logger);
    const provider = createProvider(config);

    if (!provider) {
      console.log(
        chalk.red("Error: No Anthropic or OpenAI API key configured."),
      );
      console.log(
        "Set one in ~/.nanobot/config.json under providers.anthropic.apiKey or providers.openai.apiKey",
      );
      process.exit(1);
    }

    const bus = new MessageBus();

    const agent = new AgentLoop(provider, config.workspacePath, {
      model: config.agents.defaults.model,
      maxIterations: config.agents.defaults.max_tool_iterations,
      thinking: config.agents.defaults.thinking,
      enableProgress: config.agents.defaults.progress_events,
      bus,
      braveApiKey: config.tools?.web?.search?.api_key,
    });

    // 配置并初始化记忆检索系统
    if (config.embedding?.enabled && config.embedding.api_key) {
      await agent.context.setMemorySearch({
        apiKey: config.embedding.api_key,
        apiBase: config.embedding.api_base || undefined,
        model: config.embedding.model,
        timeout: config.embedding.timeout,
      });
    }

    // 初始化 MAPLE 个性化系统
    if (config.maple?.enabled) {
      agent.initMaple(config.maple, provider);
      console.log(chalk.green("✓") + " MAPLE personalization enabled");
    }

    // Parse image paths
    const media = options.image 
      ? options.image.split(',').map((p: string) => p.trim())
      : undefined;

    if (options.message) {
      const response = await agent.processDirect(
        options.message,
        options.session,
        media,
      );
      console.log("\n" + response);

      // 等待 subagent 结果（最多 60 秒）
      // 检查是否有 subagent 任务在运行
      const startTime = Date.now();
      while (Date.now() - startTime < 60000) {
        if (bus.inboundSize > 0) {
          const msg = await bus.consumeInbound();
          if (msg.senderId === 'subagent') {
            console.log("\n" + "=".repeat(50));
            console.log(chalk.cyan("[Subagent 完成]"));
            console.log(msg.content);
            console.log("=".repeat(50));
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 等待 MAPLE Learning 完成（最多 15 秒），避免进程退出前异步任务被截断
      if (agent.lastLearningPromise) {
        await Promise.race([
          agent.lastLearningPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 15000)),
        ]);
      }
    } else {
      console.log("Interactive mode (Ctrl+C to exit)\n");

      // 启动 subagent 结果监听器
      const subagentListener = async () => {
        while (true) {
          try {
            if (bus.inboundSize > 0) {
              const msg = await bus.consumeInbound();
              if (msg.senderId === 'subagent') {
                console.log("\n" + "=".repeat(50));
                console.log(chalk.cyan("[Subagent 完成]"));
                console.log(msg.content);
                console.log("=".repeat(50) + "\n");
                console.log(chalk.bold.blue("You: ") + "(继续输入，或 Ctrl+C 退出)");
              }
            }
          } catch {
            // ignore
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
      subagentListener(); // 不 await，后台运行

      while (true) {
        try {
          const input = await promptInput(chalk.bold.blue("You: "));
          if (!input.trim()) continue;

          const response = await agent.processDirect(input, options.session, media);
          console.log("\n" + response + "\n");
        } catch (e) {
          console.log("\nGoodbye!");
          break;
        }
      }
    }
  });

const gatewayCmd = program
  .command("gateway")
  .description("Start the nanobot gateway");

gatewayCmd
  .option("-p, --port <port>", "Gateway port", "18790")
  .option("-v, --verbose", "Verbose output")
  .action(async (options) => {
    console.log(LOGO);
    console.log(`Starting nanobot gateway on port ${options.port}...\n`);

    const config = loadConfig();
    configureGlobalLogger(config.logger);
    const bus = new MessageBus();

    const provider = createProvider(config);

    if (!provider) {
      console.log(
        chalk.red("Error: No Anthropic or OpenAI API key configured."),
      );
      console.log(
        "Set one in ~/.nanobot/config.json under providers.anthropic.apiKey or providers.openai.apiKey",
      );
      process.exit(1);
    }

    console.log(
      chalk.green("✓") + ` Provider: ${config.agents.defaults.model}`,
    );

    const agent = new AgentLoop(provider, config.workspacePath, {
      model: config.agents.defaults.model,
      maxIterations: config.agents.defaults.max_tool_iterations,
      thinking: config.agents.defaults.thinking,
      enableProgress: config.agents.defaults.progress_events,
      bus,
      braveApiKey: config.tools?.web?.search?.api_key,
    });

    // 配置并初始化记忆检索系统
    if (config.embedding?.enabled && config.embedding.api_key) {
      await agent.context.setMemorySearch({
        apiKey: config.embedding.api_key,
        apiBase: config.embedding.api_base || undefined,
        model: config.embedding.model,
        timeout: config.embedding.timeout,
      });
    }

    // 初始化 MAPLE 个性化系统
    if (config.maple?.enabled) {
      agent.initMaple(config.maple, provider);
      console.log(chalk.green("✓") + " MAPLE personalization enabled");
    }

    const cronStorePath = join(getDataDir(), "cron", "jobs.json");
    const cronDir = dirname(cronStorePath);
    if (!existsSync(cronDir)) {
      mkdirSync(cronDir, { recursive: true });
    }

    const cron = new CronService(cronStorePath, async (job) => {
      const response = await agent.processDirect(
        job.payload.message,
        `cron:${job.id}`,
      );
      return response;
    });

    const heartbeat = new HeartbeatService(
      config.workspacePath,
      async (prompt) => {
        return await agent.processDirect(prompt, "heartbeat");
      },
      30 * 60,
      true,
    );

    const channels = new ChannelManager(config, bus);

    if (channels.enabledChannels.length > 0) {
      console.log(
        chalk.green("✓") + ` Channels: ${channels.enabledChannels.join(", ")}`,
      );
      await channels.startAll();
    } else {
      console.log(chalk.yellow("Warning: No channels enabled"));
    }

    const cronStatus = cron.status();
    if (cronStatus.jobs > 0) {
      console.log(
        chalk.green("✓") + ` Cron: ${cronStatus.jobs} scheduled jobs`,
      );
    }

    console.log(chalk.green("✓") + " Heartbeat: every 30m");

    console.log("\nPress Ctrl+C to stop...\n");

    try {
      await cron.start();
      await heartbeat.start();

      // ============================================
      // 启动消息消费循环 - 读取 bus 中的入站消息并处理
      // ============================================
      const messageLoop = async () => {
        console.log("[Gateway:INFO] Starting message consumption loop...");
        while (true) {
          try {
            // 等待并读取入站消息
            const inboundMsg = await bus.consumeInbound();
            
            // 处理 subagent 完成通知
            if (inboundMsg.senderId === 'subagent') {
              console.log(
                "[Gateway:INFO] Received subagent notification:",
                inboundMsg.content.substring(0, 100),
              );
              
              // 解析 chatId 格式为 "channel:chatId"
              const [originChannel, originChatId] = inboundMsg.chatId.split(':');
              
              // 如果 origin 是 gateway（CLI 直接调用），直接打印到控制台
              if (originChannel === 'gateway') {
                console.log("\n" + "=".repeat(50));
                console.log("[Subagent 完成]");
                console.log(inboundMsg.content);
                console.log("=".repeat(50) + "\n");
                continue;
              }
              
              // 否则发送通知到对应渠道（如飞书）
              await bus.publishOutbound({
                channel: originChannel || 'feishu',
                chatId: originChatId || inboundMsg.chatId,
                content: inboundMsg.content,
                replyTo: inboundMsg.metadata?.message_id as string | undefined,
                metadata: inboundMsg.metadata,
              });
              continue;
            }
            
            console.log(
              "[Gateway:DEBUG] Received inbound message:",
              inboundMsg.content.substring(0, 50),
            );

            // 生成会话键
            const sessionKey = getSessionKey(inboundMsg);

            // 记录开始时间
            const startTime = Date.now();

            // 发送初始 "正在思考" 消息
            const initialMsg = {
              channel: inboundMsg.channel,
              chatId: inboundMsg.chatId,
              content: "🤔 正在思考...",
              replyTo: inboundMsg.metadata?.message_id as string | undefined,
              metadata: inboundMsg.metadata,
            };
            await bus.publishOutbound(initialMsg);

            // 进度回调函数
            const progressHandler = (event: ProgressEvent): void => {
              const elapsed = Math.round((Date.now() - startTime) / 1000);
              let content = "";
              
              switch (event.type) {
                case 'thinking':
                  content = `🤔 思考中... (${elapsed}s)`;
                  break;
                case 'tool_start':
                  const args = typeof event.toolArgs === 'string' 
                    ? event.toolArgs.substring(0, 200) 
                    : JSON.stringify(event.toolArgs).substring(0, 200);
                  content = `🔧 **执行工具: ${event.toolName}**\n\`\`\`\n${args}\n\`\`\`\n⏱️ ${elapsed}s`;
                  break;
                case 'tool_end':
                  content = `✅ **${event.toolName}** 完成\n${event.toolResult?.substring(0, 300) || ''}\n⏱️ ${elapsed}s`;
                  break;
                case 'complete':
                  content = `✨ **处理完成!** (${elapsed}s)`;
                  break;
                case 'error':
                  content = `❌ **错误**: ${event.error || '未知错误'}`;
                  break;
              }
              
              if (content) {
                bus.publishOutbound({
                  channel: inboundMsg.channel,
                  chatId: inboundMsg.chatId,
                  content,
                  replyTo: inboundMsg.metadata?.message_id as string | undefined,
                  metadata: inboundMsg.metadata,
                });
              }
            };

            // 构建带上下文的消息内容
            const contextMessage = buildContextMessage(inboundMsg);

            // 复用主 agent 单例，通过 processDirect options 传入本次进度回调
            // ★ 传入原始消息 content 用于记忆系统，增强后的 contextMessage 用于 LLM
            const response = await agent.processDirect(
              contextMessage,
              sessionKey,
              inboundMsg.media,
              { rawContent: inboundMsg.content, onProgress: progressHandler },
            );

            // 将响应发布到出站队列
            const outboundMsg = {
              channel: inboundMsg.channel,
              chatId: inboundMsg.chatId,
              content: response,
              replyTo: inboundMsg.metadata?.message_id as string | undefined,
              metadata: inboundMsg.metadata,
            };

            await bus.publishOutbound(outboundMsg);
            console.log("[Gateway:DEBUG] Published response to outbound queue");
          } catch (e) {
            console.error("[Gateway:ERROR] Error processing message:", e);
          }
        }
      };

      // 启动消息消费循环 (不阻塞)
      messageLoop();

      console.log("[Gateway:INFO] Message loops started");
    } catch (e) {
      console.log("\nShutting down...");
      heartbeat.stop();
      cron.stop();
      await channels.stopAll();
    }
  });

const cronCmd = program.command("cron").description("Manage scheduled tasks");

cronCmd
  .command("list")
  .description("List scheduled jobs")
  .option("-a, --all", "Include disabled jobs")
  .action((options) => {
    const storePath = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(storePath);

    const jobs = service.listJobs(options.all);

    if (jobs.length === 0) {
      console.log("No scheduled jobs.");
      return;
    }

    console.log("\nScheduled Jobs:\n");
    console.log(
      "ID".padEnd(10) +
        "Name".padEnd(20) +
        "Schedule".padEnd(20) +
        "Status".padEnd(12) +
        "Next Run",
    );
    console.log("-".repeat(70));

    for (const job of jobs) {
      let schedule = "";
      if (job.schedule.kind === "every") {
        schedule = `every ${(job.schedule.everyMs ?? 0) / 1000}s`;
      } else if (job.schedule.kind === "cron") {
        schedule = job.schedule.expr ?? "";
      } else {
        schedule = "one-time";
      }

      let nextRun = "";
      if (job.state.nextRunAtMs) {
        const date = new Date(job.state.nextRunAtMs);
        nextRun = date.toLocaleString();
      }

      const status = job.enabled
        ? chalk.green("enabled")
        : chalk.dim("disabled");

      console.log(
        job.id.padEnd(10) +
          job.name.padEnd(20) +
          schedule.padEnd(20) +
          status.padEnd(12) +
          nextRun,
      );
    }
    console.log("");
  });

cronCmd
  .command("add")
  .description("Add a scheduled job")
  .requiredOption("-n, --name <name>", "Job name")
  .requiredOption("-m, --message <message>", "Message for agent")
  .option("-e, --every <seconds>", "Run every N seconds")
  .option("-c, --cron <expression>", 'Cron expression (e.g. "0 9 * * *")')
  .option("-a, --at <datetime>", 'Run at specific time (e.g. "2026-01-26 21:15:00")')
  .option("-d, --deliver", "Deliver response to channel")
  .option("--to <recipient>", "Recipient for delivery")
  .option("--channel <channel>", "Channel for delivery")
  .action((options) => {
    const storePath = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(storePath);

    let schedule: {
      kind: "every" | "cron" | "at";
      everyMs?: number;
      expr?: string;
      atMs?: number;
    };

    if (options.every) {
      schedule = { kind: "every", everyMs: parseInt(options.every) * 1000 };
    } else if (options.cron) {
      schedule = { kind: "cron", expr: options.cron };
    } else if (options.at) {
      const atMs = new Date(options.at).getTime();
      if (isNaN(atMs)) {
        console.log(chalk.red("Error: Invalid date format for --at"));
        process.exit(1);
      }
      schedule = { kind: "at", atMs };
    } else {
      console.log(chalk.red("Error: Must specify --every, --cron, or --at"));
      process.exit(1);
    }

    const job = service.addJob({
      name: options.name,
      schedule,
      message: options.message,
      deliver: options.deliver ?? false,
      channel: options.channel,
      to: options.to,
    });

    console.log(chalk.green("✓") + ` Added job '${job.name}' (${job.id})`);
  });

cronCmd
  .command("remove")
  .description("Remove a scheduled job")
  .argument("<job_id>", "Job ID to remove")
  .action((jobId) => {
    const storePath = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(storePath);

    if (service.removeJob(jobId)) {
      console.log(chalk.green("✓") + ` Removed job ${jobId}`);
    } else {
      console.log(chalk.red(`Job ${jobId} not found`));
    }
  });

cronCmd
  .command("enable")
  .description("Enable or disable a job")
  .argument("<job_id>", "Job ID")
  .option("-d, --disable", "Disable instead of enable")
  .action((jobId, options) => {
    const storePath = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(storePath);

    const job = service.enableJob(jobId, !options.disable);
    if (job) {
      const status = options.disable ? "disabled" : "enabled";
      console.log(chalk.green("✓") + ` Job '${job.name}' ${status}`);
    } else {
      console.log(chalk.red(`Job ${jobId} not found`));
    }
  });

cronCmd
  .command("run")
  .description("Manually run a job")
  .argument("<job_id>", "Job ID to run")
  .option("-f, --force", "Run even if disabled")
  .action(async (jobId, options) => {
    const storePath = join(getDataDir(), "cron", "jobs.json");
    const service = new CronService(storePath);

    const success = await service.runJob(jobId, options.force);
    if (success) {
      console.log(chalk.green("✓") + " Job executed");
    } else {
      console.log(chalk.red(`Failed to run job ${jobId}`));
    }
  });

program
  .command("status")
  .description("Show nanobot status")
  .action(() => {
    console.log(LOGO);
    console.log("nanobot Status\n");

    const configPath = getConfigPath();
    const workspace = getWorkspacePath();

    const configExists = existsSync(configPath);
    const workspaceExists = existsSync(workspace);

    console.log(
      "Config: " +
        configPath +
        " " +
        (configExists ? chalk.green("✓") : chalk.red("✗")),
    );
    console.log(
      "Workspace: " +
        +workspace +
        " " +
        (workspaceExists ? chalk.green("✓") : chalk.red("✗")),
    );

    if (configExists) {
      const config = loadConfig();
      console.log("Model: " + config.agents.defaults.model);

      const hasAnthropic = !!config.providers.anthropic?.api_key;
      const hasOpenAI = !!config.providers.openai?.api_key;

      console.log(
        "Anthropic API: " +
          (hasAnthropic ? chalk.green("✓") : chalk.dim("not set")),
      );
      console.log(
        "OpenAI API: " + (hasOpenAI ? chalk.green("✓") : chalk.dim("not set")),
      );
    }
  });

/**
 * 飞书 @ 提及结构
 */
interface FeishuMentionInfo {
  key: string;
  id?: {
    user_id?: string;
    union_id?: string;
    open_id?: string;
  };
  name: string;
}

/**
 * 构建带上下文的消息内容
 * 在消息开头附加发送者、会话、消息ID、时间、提及等上下文信息
 */
function buildContextMessage(inboundMsg: InboundMessage): string {
  const { content, metadata } = inboundMsg;

  // 如果没有 metadata 或为空，直接返回原内容
  if (!metadata || Object.keys(metadata).length === 0) {
    return content;
  }

  const parts: string[] = ['[消息上下文]'];

  // 发送者
  if (inboundMsg.senderId) {
    const senderName = metadata.sender_name as string;
    if (senderName) {
      parts.push(`发送者: ${senderName}(${inboundMsg.senderId})`);
    } else {
      parts.push(`发送者: ${inboundMsg.senderId}`);
    }
  }

  // 会话
  const chatType = metadata.chat_type as string;
  const chatTypeLabel = chatType?.includes('group') ? '群聊' : '私聊';
  parts.push(`会话: ${inboundMsg.chatId} (${chatTypeLabel})`);

  // 消息ID
  if (metadata.message_id) {
    parts.push(`消息ID: ${metadata.message_id}`);
  }

  // 时间
  if (metadata.create_time) {
    // 飞书时间戳是毫秒
    const timestamp = parseInt(String(metadata.create_time));
    if (!isNaN(timestamp)) {
      const date = new Date(timestamp);
      parts.push(`时间: ${date.toLocaleString('zh-CN')}`);
    }
  }

  // 提及
  const mentions = metadata.mentions as FeishuMentionInfo[] | undefined;
  if (mentions && Array.isArray(mentions) && mentions.length > 0) {
    const mentionStrs = mentions.map(m => {
      const name = m.name || '未知';
      const openId = m.id?.open_id || m.id?.user_id || '';
      return openId ? `@${name}(${openId})` : `@${name}`;
    });
    parts.push(`提及: ${mentionStrs.join(', ')}`);
  }

  return parts.join('\n') + '\n\n---\n\n' + content;
}

function createProvider(config: ReturnType<typeof loadConfig>) {
  // 配置文件可能是 camelCase 或 snake_case，都兼容
  const anthropic = config.providers.anthropic as any;
  const openai = config.providers.openai as any;

  const anthropicKey = anthropic?.apiKey || anthropic?.api_key;
  const openaiKey = openai?.apiKey || openai?.api_key;
  const anthropicBase = anthropic?.apiBase || anthropic?.api_base;
  const openaiBase = openai?.apiBase || openai?.api_base;
  const model = config.agents.defaults.model;

  // 根据模型名选择 provider
  const lowerModel = model.toLowerCase();
  
  // Kimi 模型
  if (lowerModel.includes("kimi") && anthropicKey) {
    return new KimiProvider(anthropicKey, anthropicBase ?? null, "bearer");
  }
  
  // Anthropic 模型
  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey, anthropicBase ?? null);
  } else if (openaiKey) {
    return new OpenAIProvider(openaiKey, openaiBase ?? null);
  }

  return null;
}

function createWorkspaceTemplates(workspace: string) {
  const templates: Record<string, string> = {
    "AGENTS.md": `# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks
`,
    "SOUL.md": `# Soul

I am nanobot, a lightweight AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn

## Values

- Accuracy over speed
- User privacy and safety
- Transparency in actions
`,
    "USER.md": `# User

Information about the user goes here.

## Preferences

- Communication style: (casual/formal)
- Timezone: (your timezone)
- Language: (your preferred language)
`,
  };

  for (const [filename, content] of Object.entries(templates)) {
    const filePath = join(workspace, filename);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content);
      console.log("  " + chalk.dim(`Created ${filename}`));
    }
  }

  const memoryDir = join(workspace, "memory");
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  const memoryFile = join(memoryDir, "MEMORY.md");
  if (!existsSync(memoryFile)) {
    const memoryContent = `# Long-term Memory

This file stores important information that should persist across sessions.

## User Information

(Important facts about the user)

## Preferences

(User preferences learned over time)

## Important Notes

(Things to remember)
`;
    writeFileSync(memoryFile, memoryContent);
    console.log("  " + chalk.dim("Created memory/MEMORY.md"));
  }
}

function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question(question + " (y/N) ", (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

function promptInput(question: string): Promise<string> {
  return new Promise((resolve) => {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question(question, (answer: string) => {
      readline.close();
      resolve(answer);
    });
  });
}



// ============================================
// maple 子命令：查看/清除用户画像（调试用）
// ============================================
const mapleCmd = program
  .command("maple")
  .description("MAPLE personalization profile management");

mapleCmd
  .command("profile [userId]")
  .description("View user profile (default: cli:default)")
  .action(async (userId?: string) => {
    const config = loadConfig();
    const { PersonalizationAgent, UserStore } = await import("../agent/maple/index.js");
    const userStore = new UserStore(config.workspacePath);
    const personalizationAgent = new PersonalizationAgent(userStore);
    const targetUserId = userId ?? "cli:default";
    const summary = await personalizationAgent.getProfileSummary(targetUserId);
    console.log(summary);
  });

mapleCmd
  .command("clear [userId]")
  .description("Clear user profile (default: cli:default)")
  .action(async (userId?: string) => {
    const config = loadConfig();
    const { UserStore, createDefaultProfile } = await import("../agent/maple/index.js");
    const userStore = new UserStore(config.workspacePath);
    const targetUserId = userId ?? "cli:default";
    const emptyProfile = createDefaultProfile(targetUserId);
    userStore.save(emptyProfile);
    console.log(chalk.green("✓") + ` MAPLE profile cleared for: ${targetUserId}`);
  });

export function runCLI(args: string[]) {
  program.parse(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI(process.argv);
}
