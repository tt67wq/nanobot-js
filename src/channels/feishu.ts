import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';

interface FeishuConfig {
  appId?: string;
  appSecret?: string;
  allowFrom?: string[];
  [key: string]: unknown;
}

export class FeishuChannel extends BaseChannel {
  name = 'feishu';

  constructor(config: FeishuConfig, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    const appId = this.config.appId as string;
    const appSecret = this.config.appSecret as string;

    if (!appId || !appSecret) {
      console.error('Feishu app_id or app_secret not configured');
      return;
    }

    this.running = true;
    console.log('Starting Feishu channel (long connection mode)...');
  }

  private extractTextFromCard(contentData: Record<string, unknown>): string {
    const texts: string[] = [];

    const extractFromElement = (elem: unknown): void => {
      if (typeof elem !== 'object' || elem === null) return;

      const e = elem as Record<string, unknown>;
      const tag = e.tag as string;

      if (tag === 'text' || tag === 'plain_text') {
        if (e.text) texts.push(e.text as string);
      } else if (tag === 'markdown') {
        if (e.content) texts.push(e.content as string);
      } else if (tag === 'column_set' || tag === 'columns') {
        const elements = e.elements as unknown[];
        if (elements) {
          for (const child of elements) {
            extractFromElement(child);
          }
        }
      } else if (tag === 'column') {
        const elements = e.elements as unknown[];
        if (elements) {
          for (const child of elements) {
            extractFromElement(child);
          }
        }
      }
    };

    if (contentData.card) {
      const card = contentData.card as Record<string, unknown>;
      const elements = card.elements as unknown[];
      if (elements) {
        for (const elem of elements) {
          extractFromElement(elem);
        }
      }
    } else {
      const rawElements = contentData.elements as unknown[];
      if (rawElements) {
        for (const elemOrRow of rawElements) {
          if (Array.isArray(elemOrRow)) {
            for (const elem of elemOrRow) {
              extractFromElement(elem);
            }
          } else {
            extractFromElement(elemOrRow);
          }
        }
      }
    }

    if (contentData.title) {
      texts.unshift(`[${contentData.title}]`);
    }

    return texts.join('\n');
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('Feishu channel stopped');
  }

  async send(msg: OutboundMessage): Promise<void> {
    console.log(`[Feishu] Would send message to ${msg.chatId}: ${msg.content.substring(0, 50)}...`);
  }
}
