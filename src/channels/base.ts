import type { InboundMessage, OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';

export abstract class BaseChannel {
  name: string = 'base';
  protected config: Record<string, unknown>;
  protected bus: MessageBus;
  protected running = false;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    this.config = config;
    this.bus = bus;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  isAllowed(senderId: string): boolean {
    const allowList = (this.config.allowFrom as string[]) ?? [];

    if (!allowList.length) {
      return true;
    }

    const senderStr = String(senderId);
    if (allowList.includes(senderStr)) {
      return true;
    }

    if (senderStr.includes('|')) {
      for (const part of senderStr.split('|')) {
        if (part && allowList.includes(part)) {
          return true;
        }
      }
    }

    return false;
  }

  protected async handleMessage(
    senderId: string,
    chatId: string,
    content: string,
    media?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.isAllowed(senderId)) {
      return;
    }

    const msg: InboundMessage = {
      channel: this.name,
      senderId: String(senderId),
      chatId: String(chatId),
      content,
      media: media ?? [],
      metadata: metadata ?? {},
    };

    await this.bus.publishInbound(msg);
  }

  get isRunning(): boolean {
    return this.running;
  }
}
