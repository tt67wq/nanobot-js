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

    // 检查白名单，不通过时使用 fallback 消息替换
    if (!this.isAllowed(senderId)) {
      this.logger.debug('Sender %s NOT allowed (allowList: %s)', senderId, JSON.stringify(this.config.allowFrom));

      // 获取 fallback 消息（支持 channels 级别的配置）
      const fallbackMessage = (this.config.fallbackMessage as string)
        || (this.config.fallback_message as string)
        || "未授权用户访问，请委婉拒绝并说明原因。";

      // 用 fallback 替换原始内容，而不是丢弃
      content = fallbackMessage;
      media = undefined;  // 清除媒体文件
      this.logger.debug('Sender %s not in whitelist, using fallback message', senderId);
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
