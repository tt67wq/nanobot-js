import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';
import type { FeishuConfig, FeishuMessageEvent, FeishuMention } from './feishu/types';
import { FeishuImageHandler } from './feishu/image';
import { FeishuClient } from './feishu/client';
import { extractTextFromCard, parseTextContent, processMentions, isGroupChat } from './feishu/parser';
import { markdownToFeishu } from '../utils/markdownToFeishu';

/**
 * 飞书通道实现
 */
export class FeishuChannel extends BaseChannel {
  name = 'feishu';
  private verbose: boolean = true;
  private client: FeishuClient | null = null;
  private imageHandler: FeishuImageHandler | null = null;

  constructor(config: FeishuConfig, bus: MessageBus) {
    super(config, bus);
    this.verbose = config.verbose ?? true;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (!this.verbose && level === 'debug') return;
    
    let formattedMsg = message;
    for (const arg of args) {
      formattedMsg = formattedMsg.replace('%s', typeof arg === 'string' ? arg : JSON.stringify(arg));
    }
    
    const msg = `[FEISHU:${level.toUpperCase()}] ${formattedMsg}`;
    
    if (level === 'debug') this.logger.debug(msg);
    else if (level === 'info') this.logger.info(msg);
    else if (level === 'warn') this.logger.warn(msg);
    else this.logger.error(msg);
  }

  async start(): Promise<void> {
    const appId = this.config.appId || (this.config as any).app_id;
    const appSecret = this.config.appSecret || (this.config as any).app_secret;

    this.log('info', '=== Feishu Channel Starting (WebSocket Mode) ===');

    if (!appId || !appSecret) {
      this.log('error', 'MISSING appId or appSecret!');
      this.log('error', 'Available config:', JSON.stringify(this.config));
      return;
    }

    this.log('info', 'App ID: %s', appId.substring(0, 8) + '...');

    try {
      this.client = new FeishuClient(this.config);
      await this.client.init();
      
      this.imageHandler = new FeishuImageHandler(this.client.apiClient);

      this.client.startListening((data) => {
        this.handleIncomingMessage(data);
      });
      
      this.running = true;
      this.log('info', '✓ WebSocket connected and listening for messages!');

    } catch (e: any) {
      this.log('error', 'Failed to start WebSocket:', e?.message || e);
      this.log('error', 'Full error:', JSON.stringify(e));
      this.running = false;
    }
  }

  /**
   * 检查消息中的 @ 提及是否是针对当前机器人的
   * 只依赖 open_id 精确匹配
   */
  private checkBotMentioned(mentions: FeishuMention[]): boolean {
    const botUserId = this.config.botUserId || (this.config as any).bot_user_id;

    // 调试日志
    this.log('info', '>>> DEBUG: botUserId=%s', botUserId);

    for (const mention of mentions) {
      const mentionKey = mention?.key || '';
      const mentionId = mention?.id || {};
      const mentionOpenId = (mentionId as any).open_id || '';
      const mentionName = mention?.name || '';
      
      this.log('info', '>>> Checking: key=%s, open_id=%s, name=%s', 
        mentionKey, mentionOpenId, mentionName);

      // 精确匹配 open_id
      if (botUserId && mentionOpenId === botUserId) {
        this.log('info', '>>> MATCHED: is @ bot (open_id)');
        return true;
      }

      // 回退: 只有未配置 botUserId 时才匹配任何 @
      if (!botUserId && mentionKey.startsWith('@_user_')) {
        this.log('info', '>>> MATCHED: fallback (no botUserId configured)');
        return true;
      }
    }

    this.log('info', '>>> NOT matched - message is for another user');
    return false;
  }

  private async handleIncomingMessage(data: FeishuMessageEvent): Promise<void> {
    try {
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
        this.log('warn', 'No sender ID found');
        return;
      }

      const chatId = message?.chat_id;
      if (!chatId) {
        this.log('warn', 'No chat ID found');
        return;
      }

      const messageType = message?.message_type;
      const chatType = message?.chat_type;
      const mentions = data?.event?.mentions || message?.mentions || [];

      // 群聊时检查是否 @ 了机器人
      if (isGroupChat(chatType)) {
        if (mentions.length === 0) {
          return;
        }

        this.log('info', '>>> Group message - mentions: %s', JSON.stringify(mentions));

        const isMentioned = this.checkBotMentioned(mentions);

        if (!isMentioned) {
          this.log('info', '>>> Skipping: not @ this bot');
          return;
        }

        this.log('info', '>>> Processing: group message @ this bot');
      }
      
      this.log('info', 'Received message: type=%s, from=%s, chat=%s', messageType, senderId, chatId);

      if (messageType === 'image') {
        await this.handleImageMessage(message, senderId, chatId, data);
        return;
      }

      if (messageType === 'post') {
        await this.handlePostMessage(message, senderId, chatId, data);
        return;
      }

      if (messageType !== 'text') {
        return;
      }

      let content = parseTextContent(message?.content);
      content = processMentions(content, mentions);

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
          event_type: (data as any).event_type,
          msg_type: messageType,
        }
      );

    } catch (e) {
      this.log('error', 'Error handling incoming message:', e);
    }
  }

  private async handleImageMessage(message: any, senderId: string, chatId: string, data: any): Promise<void> {
    if (!this.imageHandler) return;

    try {
      const contentJson = message?.content;
      if (!contentJson) {
        this.log('warn', 'No content in image message');
        return;
      }

      let contentData: Record<string, unknown>;
      try {
        contentData = JSON.parse(contentJson);
      } catch {
        this.log('warn', 'Failed to parse image message content');
        return;
      }

      const imageKey = contentData.image_key as string;
      if (!imageKey) {
        this.log('warn', 'No image_key in image message');
        return;
      }

      const messageId = message?.message_id;
      const imagePath = await this.imageHandler.downloadImage(imageKey, messageId);

      if (!imagePath) {
        this.log('error', 'Failed to download image');
        return;
      }

      this.log('info', 'Image downloaded to: %s', imagePath);
      
      await this.handleMessage(
        senderId,
        chatId,
        '[图片消息]',
        [imagePath],
        {
          message_id: message?.message_id,
          create_time: message?.create_time,
          event_type: data?.event_type,
          msg_type: 'image',
          image_key: imageKey,
        }
      );

    } catch (e: any) {
      this.log('error', 'Error handling image message:', e?.message || e);
    }
  }

  private async handlePostMessage(message: any, senderId: string, chatId: string, data: any): Promise<void> {
    if (!this.imageHandler) return;

    const mediaFiles: string[] = [];
    const textParts: string[] = [];

    try {
      const contentJson = message?.content;
      if (!contentJson) {
        this.log('warn', 'No content in post message');
        return;
      }

      let contentData: Record<string, unknown>;
      try {
        contentData = JSON.parse(contentJson);
      } catch {
        this.log('warn', 'Failed to parse post message content');
        return;
      }

      let elements: unknown[] | undefined = undefined;
      const body = contentData?.body as Record<string, unknown> | undefined;
      if (body?.elements) {
        elements = body.elements as unknown[];
      }

      if (!elements && contentData?.content) {
        const contentField = contentData.content;
        if (typeof contentField === 'object' && contentField !== null) {
          const contentObj = contentField as Record<string, unknown>;
          if (Array.isArray(contentObj)) {
            for (const row of contentObj) {
              if (!Array.isArray(row)) continue;
              for (const el of row) {
                if (!el || typeof el !== 'object') continue;
                const element = el as Record<string, unknown>;
                const tag = element.tag as string;

                if (tag === 'img') {
                  const imageKey = element.image_key as string;
                  if (imageKey) {
                    const imagePath = await this.imageHandler.downloadImage(imageKey, message?.message_id);
                    if (imagePath) mediaFiles.push(imagePath);
                  }
                } else if (tag === 'text' || tag === 'plain_text') {
                  const text = element.text as string || element.content as string;
                  if (text) textParts.push(text);
                } else if (tag === 'markdown') {
                  const text = element.text as string || element.content as string;
                  if (text) textParts.push(text);
                } else if (tag === 'a') {
                  const text = element.text as string;
                  const href = element.href as string;
                  if (text) textParts.push(`${text} (${href})`);
                } else if (tag === 'at') {
                  const userName = element.user_name as string;
                  if (userName) textParts.push(`@${userName}`);
                }
              }
            }
          }
        }
      }

      if (!elements && contentData?.elements) {
        elements = contentData.elements as unknown[];
      }

      if (contentData?.title) {
        textParts.unshift(`[${contentData.title}]`);
      }

      if (elements && Array.isArray(elements)) {
        for (const element of elements) {
          if (!element || typeof element !== 'object') continue;
          const el = element as Record<string, unknown>;
          const tag = el.tag as string;

          if (tag === 'img') {
            const imageKey = el?.image_key as string;
            if (imageKey) {
              const imagePath = await this.imageHandler.downloadImage(imageKey, message?.message_id);
              if (imagePath) mediaFiles.push(imagePath);
            }
          } else if (tag === 'text' || tag === 'plain_text') {
            const text = el?.text as string || el?.content as string;
            if (text) textParts.push(text);
          } else if (tag === 'markdown') {
            const text = el?.text as string || el?.content as string;
            if (text) textParts.push(text);
          }
        }
      }

      const content = textParts.join('\n') || '[富文本消息]';

      if (!content && mediaFiles.length === 0) {
        this.log('warn', 'Empty post message');
        return;
      }

      await this.handleMessage(
        senderId,
        chatId,
        content,
        mediaFiles,
        {
          message_id: message?.message_id,
          create_time: message?.create_time,
          event_type: data?.event_type,
          msg_type: 'post',
        }
      );

    } catch (e: any) {
      this.log('error', 'Error handling post message:', e?.message || e);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.log('info', 'Channel stopped');
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.client) {
      this.log('error', 'Client not initialized');
      return;
    }

    try {
      const content = markdownToFeishu(msg.content);

      if (msg.replyTo) {
        const response = await this.client.replyMessage(msg.replyTo, content);
        const respCode = (response as any).code;
        
        if (respCode === 0) {
          this.log('info', '✓ Reply sent to %s', msg.replyTo);
        } else {
          this.log('error', 'Failed to reply: code=%s, msg=%s', respCode, (response as any).msg);
        }
        return;
      }

      const response = await this.client.sendMessage(msg.chatId, content);
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

  async updateMessage(chatId: string, messageId: string, content: string): Promise<void> {
    if (!this.client) {
      this.log('error', 'Client not initialized');
      return;
    }

    try {
      const cardContent = markdownToFeishu(content);
      const response = await this.client.updateMessage(messageId, cardContent);
      const respCode = (response as any).code;
      
      if (respCode === 0) {
        this.log('debug', '✓ Message updated: %s', messageId);
      } else {
        this.log('error', 'Failed to update message: code=%s, msg=%s', respCode, (response as any).msg);
      }
    } catch (e: any) {
      this.log('error', 'Error updating message: %s', e?.message || e);
    }
  }
}
