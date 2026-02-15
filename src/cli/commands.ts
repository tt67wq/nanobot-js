import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig, getConfigPath, getDataDir } from '../config/loader';
import { getWorkspacePath } from '../utils/helpers';
import { AgentLoop } from '../agent/loop';
import { MessageBus } from '../bus/queue';
import { ChannelManager } from '../channels/manager';
import { CronService } from '../cron/service';
import { HeartbeatService } from '../heartbeat/service';
import { AnthropicProvider } from '../providers/anthropic';
import { OpenAIProvider } from '../providers/openai';
import chalk from 'chalk';

const VERSION = '0.1.0';
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
  .name('deadbot')
  .description('deadbot - Personal AI Assistant')
  .version(VERSION, '-v, --version', 'Output the version number');

program
  .command('onboard')
  .description('Initialize deadbot configuration and workspace')
  .action(async () => {
    console.log(LOGO);
    console.log('Initializing deadbot...\n');

    const configPath = getConfigPath();

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`Config already exists at ${configPath}`));
      const overwrite = await promptConfirm('Overwrite?');
      if (!overwrite) {
        console.log('Aborted.');
        return;
      }
    }

    const config = loadConfig();
    saveConfig(config);
    console.log(chalk.green('✓') + ` Created config at ${configPath}`);

    const workspace = getWorkspacePath();
    console.log(chalk.green('✓') + ` Created workspace at ${workspace}`);

    createWorkspaceTemplates(workspace);

    console.log(chalk.green('\n✓') + ' deadbot is ready!');
    console.log('\nNext steps:');
    console.log('  1. Add your API key to ' + chalk.cyan('~/.nanobot/config.json'));
    console.log('     Get one at: Anthropic (https://console.anthropic.com/settings/keys) or OpenAI (https://platform.openai.com/api-keys)');
    console.log('  2. Chat: ' + chalk.cyan('deadbot agent -m "Hello!"'));
  });

const agentCmd = program
  .command('agent')
  .description('Interact with the agent directly');

agentCmd
  .option('-m, --message <message>', 'Message to send to the agent')
  .option('-s, --session <session>', 'Session ID', 'cli:default')
  .action(async (options) => {
    console.log(LOGO);

    const config = loadConfig();
    const provider = createProvider(config);

    if (!provider) {
      console.log(chalk.red('Error: No Anthropic or OpenAI API key configured.'));
      console.log('Set one in ~/.nanobot/config.json under providers.anthropic.apiKey or providers.openai.apiKey');
      process.exit(1);
    }

    const bus = new MessageBus();

    const agent = new AgentLoop(
      provider,
      config.workspacePath,
      {
        model: config.agents.defaults.model,
        maxIterations: config.agents.defaults.max_tool_iterations,
      }
    );

    if (options.message) {
      const response = await agent.processDirect(options.message, options.session);
      console.log('\n' + response);
    } else {
      console.log('Interactive mode (Ctrl+C to exit)\n');

      while (true) {
        try {
          const input = await promptInput(chalk.bold.blue('You: '));
          if (!input.trim()) continue;

          const response = await agent.processDirect(input, options.session);
          console.log('\n' + response + '\n');
        } catch (e) {
          console.log('\nGoodbye!');
          break;
        }
      }
    }
  });

const gatewayCmd = program
  .command('gateway')
  .description('Start the deadbot gateway');

gatewayCmd
  .option('-p, --port <port>', 'Gateway port', '18790')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    console.log(LOGO);
    console.log(`Starting deadbot gateway on port ${options.port}...\n`);

    const config = loadConfig();
    const bus = new MessageBus();

    const provider = createProvider(config);

    if (!provider) {
      console.log(chalk.red('Error: No Anthropic or OpenAI API key configured.'));
      console.log('Set one in ~/.nanobot/config.json under providers.anthropic.apiKey or providers.openai.apiKey');
      process.exit(1);
    }

    console.log(chalk.green('✓') + ` Provider: ${config.agents.defaults.model}`);

    const agent = new AgentLoop(
      provider,
      config.workspacePath,
      {
        model: config.agents.defaults.model,
        maxIterations: config.agents.defaults.max_tool_iterations,
      }
    );

    const cronStorePath = join(getDataDir(), 'cron', 'jobs.json');
    const cronDir = dirname(cronStorePath);
    if (!existsSync(cronDir)) {
      mkdirSync(cronDir, { recursive: true });
    }

    const cron = new CronService(cronStorePath, async (job) => {
      const response = await agent.processDirect(job.payload.message, `cron:${job.id}`);
      return response;
    });

    const heartbeat = new HeartbeatService(
      config.workspacePath,
      async (prompt) => {
        return await agent.processDirect(prompt, 'heartbeat');
      },
      30 * 60,
      true
    );

    const channels = new ChannelManager(config, bus);

    if (channels.enabledChannels.length > 0) {
      console.log(chalk.green('✓') + ` Channels: ${channels.enabledChannels.join(', ')}`);
    } else {
      console.log(chalk.yellow('Warning: No channels enabled'));
    }

    const cronStatus = cron.status();
    if (cronStatus.jobs > 0) {
      console.log(chalk.green('✓') + ` Cron: ${cronStatus.jobs} scheduled jobs`);
    }

    console.log(chalk.green('✓') + ' Heartbeat: every 30m');

    console.log('\nPress Ctrl+C to stop...\n');

    try {
      await cron.start();
      await heartbeat.start();
      await Promise.all([
        new Promise(() => {}),
      ]);
    } catch (e) {
      console.log('\nShutting down...');
      heartbeat.stop();
      cron.stop();
    }
  });

const cronCmd = program
  .command('cron')
  .description('Manage scheduled tasks');

cronCmd
  .command('list')
  .description('List scheduled jobs')
  .option('-a, --all', 'Include disabled jobs')
  .action((options) => {
    const storePath = join(getDataDir(), 'cron', 'jobs.json');
    const service = new CronService(storePath);

    const jobs = service.listJobs(options.all);

    if (jobs.length === 0) {
      console.log('No scheduled jobs.');
      return;
    }

    console.log('\nScheduled Jobs:\n');
    console.log('ID'.padEnd(10) + 'Name'.padEnd(20) + 'Schedule'.padEnd(20) + 'Status'.padEnd(12) + 'Next Run');
    console.log('-'.repeat(70));

    for (const job of jobs) {
      let schedule = '';
      if (job.schedule.kind === 'every') {
        schedule = `every ${(job.schedule.everyMs ?? 0) / 1000}s`;
      } else if (job.schedule.kind === 'cron') {
        schedule = job.schedule.expr ?? '';
      } else {
        schedule = 'one-time';
      }

      let nextRun = '';
      if (job.state.nextRunAtMs) {
        const date = new Date(job.state.nextRunAtMs);
        nextRun = date.toLocaleString();
      }

      const status = job.enabled ? chalk.green('enabled') : chalk.dim('disabled');

      console.log(
        job.id.padEnd(10) +
        job.name.padEnd(20) +
        schedule.padEnd(20) +
        status.padEnd(12) +
        nextRun
      );
    }
    console.log('');
  });

cronCmd
  .command('add')
  .description('Add a scheduled job')
  .requiredOption('-n, --name <name>', 'Job name')
  .requiredOption('-m, --message <message>', 'Message for agent')
  .option('-e, --every <seconds>', 'Run every N seconds')
  .option('-c, --cron <expression>', 'Cron expression (e.g. "0 9 * * *")')
  .option('-d, --deliver', 'Deliver response to channel')
  .option('--to <recipient>', 'Recipient for delivery')
  .option('--channel <channel>', 'Channel for delivery')
  .action((options) => {
    const storePath = join(getDataDir(), 'cron', 'jobs.json');
    const service = new CronService(storePath);

    let schedule: { kind: 'every' | 'cron' | 'at'; everyMs?: number; expr?: string; atMs?: number };

    if (options.every) {
      schedule = { kind: 'every', everyMs: parseInt(options.every) * 1000 };
    } else if (options.cron) {
      schedule = { kind: 'cron', expr: options.cron };
    } else {
      console.log(chalk.red('Error: Must specify --every or --cron'));
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

    console.log(chalk.green('✓') + ` Added job '${job.name}' (${job.id})`);
  });

cronCmd
  .command('remove')
  .description('Remove a scheduled job')
  .argument('<job_id>', 'Job ID to remove')
  .action((jobId) => {
    const storePath = join(getDataDir(), 'cron', 'jobs.json');
    const service = new CronService(storePath);

    if (service.removeJob(jobId)) {
      console.log(chalk.green('✓') + ` Removed job ${jobId}`);
    } else {
      console.log(chalk.red(`Job ${jobId} not found`));
    }
  });

cronCmd
  .command('enable')
  .description('Enable or disable a job')
  .argument('<job_id>', 'Job ID')
  .option('-d, --disable', 'Disable instead of enable')
  .action((jobId, options) => {
    const storePath = join(getDataDir(), 'cron', 'jobs.json');
    const service = new CronService(storePath);

    const job = service.enableJob(jobId, !options.disable);
    if (job) {
      const status = options.disable ? 'disabled' : 'enabled';
      console.log(chalk.green('✓') + ` Job '${job.name}' ${status}`);
    } else {
      console.log(chalk.red(`Job ${jobId} not found`));
    }
  });

cronCmd
  .command('run')
  .description('Manually run a job')
  .argument('<job_id>', 'Job ID to run')
  .option('-f, --force', 'Run even if disabled')
  .action(async (jobId, options) => {
    const storePath = join(getDataDir(), 'cron', 'jobs.json');
    const service = new CronService(storePath);

    const success = await service.runJob(jobId, options.force);
    if (success) {
      console.log(chalk.green('✓') + ' Job executed');
    } else {
      console.log(chalk.red(`Failed to run job ${jobId}`));
    }
  });

program
  .command('status')
  .description('Show deadbot status')
  .action(() => {
    console.log(LOGO);
    console.log('deadbot Status\n');

    const configPath = getConfigPath();
    const workspace = getWorkspacePath();

    const configExists = existsSync(configPath);
    const workspaceExists = existsSync(workspace);

    console.log(
      'Config: ' + configPath + ' ' + (configExists ? chalk.green('✓') : chalk.red('✗'))
    );
    console.log(
      'Workspace: ' + +workspace + ' ' + (workspaceExists ? chalk.green('✓') : chalk.red('✗'))
    );

    if (configExists) {
      const config = loadConfig();
      console.log('Model: ' + config.agents.defaults.model);

      const hasAnthropic = !!config.providers.anthropic?.api_key;
      const hasOpenAI = !!config.providers.openai?.api_key;

      console.log(
        'Anthropic API: ' + (hasAnthropic ? chalk.green('✓') : chalk.dim('not set'))
      );
      console.log(
        'OpenAI API: ' + (hasOpenAI ? chalk.green('✓') : chalk.dim('not set'))
      );
    }
  });

function createProvider(config: ReturnType<typeof loadConfig>) {
  const anthropicKey = config.providers.anthropic?.api_key;
  const openaiKey = config.providers.openai?.api_key;

  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey, config.providers.anthropic?.api_base ?? null);
  } else if (openaiKey) {
    return new OpenAIProvider(openaiKey, config.providers.openai?.api_base ?? null);
  }

  return null;
}

function createWorkspaceTemplates(workspace: string) {
  const templates: Record<string, string> = {
    'AGENTS.md': `# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks
`,
    'SOUL.md': `# Soul

I am deadbot, a lightweight AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn

## Values

- Accuracy over speed
- User privacy and safety
- Transparency in actions
`,
    'USER.md': `# User

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
      console.log('  ' + chalk.dim(`Created ${filename}`));
    }
  }

  const memoryDir = join(workspace, 'memory');
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  const memoryFile = join(memoryDir, 'MEMORY.md');
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
    console.log('  ' + chalk.dim('Created memory/MEMORY.md'));
  }
}

function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question(question + ' (y/N) ', (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

function promptInput(question: string): Promise<string> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    readline.question(question, (answer: string) => {
      readline.close();
      resolve(answer);
    });
  });
}

export function runCLI(args: string[]) {
  program.parse(args);
}

if (require.main === module) {
  runCLI(process.argv);
}
