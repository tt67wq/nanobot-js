import type { InboundMessage, OutboundMessage } from '../bus/events';
import type { MessageBus } from '../bus/queue';
import { Logger } from '../utils/logger';

export abstract class BaseChannel {
  name: string = 'base';
  protected config: Record<string, unknown>;
  protected bus: MessageBus;
  protected running = false;
  protected logger: Logger;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    this.config = config;
    this.bus = bus;
    this.logger = new Logger({ module: this.name.toUpperCase() });
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
    this.logger.debug('Received message from %s in %s', senderId, chatId);
    this.logger.debug('Content: %s...', content.substring(0, 100));
    
    if (!this.isAllowed(senderId)) {
      this.logger.debug('Sender %s NOT allowed (allowList: %s)', senderId, JSON.stringify(this.config.allowFrom));
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

    this.logger.debug('Publishing to bus: %s', JSON.stringify(msg));
    await this.bus.publishInbound(msg);
    this.logger.debug('Published to bus successfully');
  }

  get isRunning(): boolean {
    return this.running;
  }
}
