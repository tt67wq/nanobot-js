import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';
import type { BaseChannel } from './base';
import type { Config } from '../config/schema';

export class ChannelManager {
  private channels: Map<string, BaseChannel> = new Map();
  private dispatchTask: Promise<void> | null = null;
  private shouldStop = false;

  constructor(
    private config: Config,
    private bus: MessageBus
  ) {
    this.initChannels();
  }

  private initChannels(): void {
    if (this.config.channels?.feishu?.enabled) {
      try {
        const { FeishuChannel } = require('./feishu');
        this.channels.set('feishu', new FeishuChannel(
          this.config.channels.feishu as Record<string, unknown>,
          this.bus
        ));
        console.log('Feishu channel enabled');
      } catch (e) {
        console.warn(`Feishu channel not available: ${e}`);
      }
    }
  }

  async startAll(): Promise<void> {
    if (!this.channels.size) {
      console.warn('No channels enabled');
      return;
    }

    this.shouldStop = false;
    this.dispatchTask = this.dispatchOutbound();

    const tasks: Promise<void>[] = [];
    for (const [name, channel] of this.channels.entries()) {
      console.log(`Starting ${name} channel...`);
      tasks.push(channel.start());
    }

    await Promise.all(tasks);
  }

  async stopAll(): Promise<void> {
    console.log('Stopping all channels...');

    this.shouldStop = true;

    if (this.dispatchTask) {
      try {
        await this.dispatchTask;
      } catch {
        // ignore
      }
      this.dispatchTask = null;
    }

    for (const [name, channel] of this.channels.entries()) {
      try {
        await channel.stop();
        console.log(`Stopped ${name} channel`);
      } catch (e) {
        console.error(`Error stopping ${name}: ${e}`);
      }
    }
  }

  private async dispatchOutbound(): Promise<void> {
    console.log('Outbound dispatcher started');

    while (!this.shouldStop) {
      try {
        const msg = await this.getNextOutbound(1000);

        if (msg) {
          const channel = this.channels.get(msg.channel);
          if (channel) {
            try {
              await channel.send(msg);
            } catch (e) {
              console.error(`Error sending to ${msg.channel}: ${e}`);
            }
          } else {
            console.warn(`Unknown channel: ${msg.channel}`);
          }
        }
      } catch {
        // Timeout - continue
      }
    }
  }

  private async getNextOutbound(timeoutMs: number): Promise<OutboundMessage | null> {
    const start = Date.now();
    while (!this.shouldStop) {
      if (this.bus.outboundSize > 0) {
        // Simple approach - we'd need a better queue in production
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      if (Date.now() - start > timeoutMs) {
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  getChannel(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }

  getStatus(): Record<string, { enabled: boolean; running: boolean }> {
    const status: Record<string, { enabled: boolean; running: boolean }> = {};
    for (const [name, channel] of this.channels.entries()) {
      status[name] = { enabled: true, running: channel.isRunning };
    }
    return status;
  }

  get enabledChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}
