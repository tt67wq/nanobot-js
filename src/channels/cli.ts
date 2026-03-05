import * as readline from 'readline';
import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';

/**
 * CLI 通道实现 - 用于本地测试 Agent 功能
 */
export class CliChannel extends BaseChannel {
  name = 'cli';
  private rl: readline.Interface | null = null;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    this.running = true;
    this.logger.info('CLI channel started. Type your message and press Enter.');

    this.rl.prompt();

    this.rl.on('line', async (input: string) => {
      const content = input.trim();
      if (!content) {
        this.rl?.prompt();
        return;
      }

      // 发送消息到 Agent（不传 metadata，让 buildContextMessage 直接返回原内容）
      await this.handleMessage(
        'cli-user', // 固定的发送者 ID
        'cli-chat', // 固定的聊天 ID
        content,
        [] // 无媒体
      );

      this.rl?.prompt();
    });

    this.rl.on('close', () => {
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    this.rl = null;
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Agent 回复输出到 stdout
    console.log('\n[Agent]:', msg.content, '\n');
  }
}
