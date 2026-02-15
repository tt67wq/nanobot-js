import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';

interface FeishuConfig {
  appId?: string;
  appSecret?: string;
  allowFrom?: string[];
  verbose?: boolean;
  [key: string]: unknown;
}

export class FeishuChannel extends BaseChannel {
  name = 'feishu';
  private verbose: boolean = true;
  private wsClient: any = null;
  private apiClient: any = null;

  constructor(config: FeishuConfig, bus: MessageBus) {
    super(config, bus);
    this.verbose = config.verbose ?? true;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (!this.verbose) return;
    
    const prefix = `[Feishu:${level.toUpperCase()}]`;
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
    
    if (level === 'debug') console.debug(prefix, message, formattedArgs);
    else if (level === 'info') console.log(prefix, message, formattedArgs);
    else if (level === 'warn') console.warn(prefix, message, formattedArgs);
    else console.error(prefix, message, formattedArgs);
  }

  async start(): Promise<void> {
    const appId = (this.config.appId as string) || (this.config.app_id as string);
    const appSecret = (this.config.appSecret as string) || (this.config.app_secret as string);

    this.log('info', '=== Feishu Channel Starting (WebSocket Mode) ===');
    this.log('debug', 'Config keys:', Object.keys(this.config));

    if (!appId || !appSecret) {
      this.log('error', 'MISSING appId or appSecret!');
      this.log('error', 'Available config:', JSON.stringify(this.config));
      return;
    }

    this.log('info', 'App ID:', appId.substring(0, 8) + '...');

    try {
      const lark: any = await import('@larksuiteoapi/node-sdk');
      
      this.log('debug', 'Lark SDK loaded, creating API client...');
      
      this.apiClient = new lark.Client({
        appId,
        appSecret,
        logLevel: lark.LoggerLevel.DEBUG,
      });

      this.log('debug', 'Creating WSClient...');
      this.wsClient = new lark.WSClient({
        appId,
        appSecret,
        loggerLevel: lark.LoggerLevel.DEBUG,
      });

      this.log('debug', 'Creating event dispatcher...');
      const eventDispatcher = new lark.EventDispatcher({});

      this.log('debug', 'Registering message handler...');
      eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          await this.handleIncomingMessage(data);
        }
      });

      this.log('info', 'Starting WebSocket connection...');
      
      this.wsClient.start({
        eventDispatcher,
      });
      
      this.running = true;
      this.log('info', '✓ WebSocket connected and listening for messages!');

    } catch (e: any) {
      this.log('error', 'Failed to start WebSocket:', e?.message || e);
      this.log('error', 'Full error:', JSON.stringify(e));
      this.running = false;
    }
  }

  private async handleIncomingMessage(data: any): Promise<void> {
    try {
      this.log('debug', 'Raw event data:', JSON.stringify(data).substring(0, 500));

      // The structure is: data.message, not data.event.message
      const message = data?.message;
      if (!message) {
        this.log('warn', 'No message in data, keys:', Object.keys(data));
        return;
      }

      const sender = data?.sender;
      if (!sender) {
        this.log('warn', 'No sender in data');
        return;
      }

      const senderId = sender?.sender_id?.open_id || sender?.sender_id?.user_id;
      if (!senderId) {
        this.log('warn', 'No sender ID found, sender:', JSON.stringify(sender));
        return;
      }

      const chatId = message?.chat_id;
      if (!chatId) {
        this.log('warn', 'No chat ID found');
        return;
      }

      const messageType = message?.message_type;
      this.log('info', 'Received message: type=%s, from=%s, chat=%s', messageType, senderId, chatId);

      if (messageType !== 'text') {
        this.log('debug', 'Skipping non-text message type:', messageType);
        return;
      }

      const contentJson = message?.content;
      if (!contentJson) {
        this.log('warn', 'No content in message');
        return;
      }

      let content: string;
      try {
        const contentData = JSON.parse(contentJson);
        content = contentData.text || '';
      } catch {
        content = contentJson;
      }

      if (!content) {
        this.log('warn', 'Empty message content');
        return;
      }

      this.log('info', 'Forwarding to bus: "%s"...', content.substring(0, 50));

      await this.handleMessage(
        senderId,
        chatId,
        content,
        [],
        {
          message_id: message?.message_id,
          create_time: message?.create_time,
          event_type: data?.event_type,
          msg_type: messageType,
        }
      );

      this.log('debug', 'Message forwarded to bus successfully');

    } catch (e) {
      this.log('error', 'Error handling incoming message:', e);
    }
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
    this.log('info', 'Channel stopped');
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return;
    }

    try {
      const cardContent = JSON.stringify({
        config: { wide_screen_mode: true },
        elements: [{ tag: 'markdown', content: msg.content }],
      });

      const response = await this.apiClient.im.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: msg.chatId,
          msg_type: 'interactive',
          content: cardContent,
        },
      });

      const respCode = (response as any).code;
      
      if (respCode === 0) {
        this.log('info', '✓ Message sent to %s', msg.chatId);
      } else {
        this.log('error', 'Failed to send: code=%s, msg=%s', respCode, (response as any).msg);
      }

    } catch (e: any) {
      this.log('error', 'Error sending message: %s', e?.message || e);
    }
  }
}
