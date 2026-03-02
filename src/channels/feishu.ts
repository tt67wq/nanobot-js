import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';
import { writeFileSync, readFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { markdownToFeishu } from '../utils/markdownToFeishu';
import { tmpdir } from 'os';

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
        logLevel: lark.LoggerLevel.WARN,
      });

      this.log('debug', 'Creating WSClient...');
      this.wsClient = new lark.WSClient({
        appId,
        appSecret,
        loggerLevel: lark.LoggerLevel.WARN,
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
      // ===== 步骤 1: 添加最开始的调试日志 =====
      this.log('debug', '=== handleIncomingMessage called ===');
      this.log('debug', 'data keys: %s', Object.keys(data));
      this.log('debug', 'Raw event data:', JSON.stringify(data).substring(0, 500));

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
      const chatType = message?.chat_type;
      const mentions = data?.event?.mentions || message?.mentions || [];
      
      // ===== 步骤 2: 调试 chatType 值 =====
      this.log('debug', 'chatType raw value: %s', chatType);
      this.log('debug', "chatType === 'group': %s", chatType === 'group');
      this.log('debug', "chatType === 'topic_group': %s", chatType === 'topic_group');
      // ===== 调试结束 =====
      
      // 群聊时检查是否 @ 了机器人
      // 放宽判断：包含 'group' 的都视为群聊
      const isGroupChat = chatType?.includes('group');
      this.log('debug', 'isGroupChat: %s', isGroupChat);
      
      if (isGroupChat) {
        if (mentions.length === 0) {
          this.log('debug', 'Group message without @, skipping');
          return;
        }

        // ===== 调试日志：诊断 bot_id 和 mentions =====
        const botId = data?.bot_id || data?.event?.bot_id;
        const currentAppId = this.config.appId || this.config.app_id;
        const eventAppId = data?.header?.app_id || data?.event?.header?.app_id;
        this.log('debug', '=== DEBUG: Group @ check ===');
        this.log('debug', 'bot_id from event: %s', botId);
        this.log('debug', 'current appId: %s', currentAppId);
        this.log('debug', 'event app_id: %s', eventAppId);
        this.log('debug', 'mentions: %s', JSON.stringify(mentions));
        // ===== 调试结束 =====

      // 修复：使用 event 中的 app_id 判断消息是否发给当前机器人
      // bot_id 是消息中被 @ 的机器人 ID，但我们需要验证这是否是当前机器人
      // 如果 eventAppId 不存在（兼容旧版 API），则不跳过
      const isTargetApp = !eventAppId || eventAppId === currentAppId;

      if (!isTargetApp) {
        this.log('debug', 'Group message @ other bot, skipping (app_id mismatch)');
        return;
      }

      this.log('info', 'Group message @ bot, processing');
      }
      // 私聊 (p2p) 不需要检查
      
      this.log('info', 'Received message: type=%s, from=%s, chat=%s', messageType, senderId, chatId);
      this.log('info', 'Received message: type=%s, from=%s, chat=%s', messageType, senderId, chatId);

      // Handle image messages
      if (messageType === 'image') {
        await this.handleImageMessage(message, senderId, chatId, data);
        return;
      }

      // Handle post messages (rich text with potential images)
      if (messageType === 'post') {
        await this.handlePostMessage(message, senderId, chatId, data);
        return;
      }

      // Skip other non-text messages
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

      // 使用 mentions 数组替换 @_user_X 占位符
      // 飞书 text 字段中的 @_user_X 是占位符，mentions 数组包含实际被 @ 的用户信息
      // mentions 结构: [{ user_id, key: "@_user_X", name: "用户名" }]
      for (const mention of mentions) {
        if (mention?.key && mention?.name) {
          // 替换 @_user_X 为实际用户名
          content = content.replace(new RegExp(mention.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), mention.name);
        }
      }

      // 清理可能残留的 @_user_X 格式占位符
      content = content.replace(/@_user_\d+\s*/g, '').trim();

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
        elements: [{ tag: 'markdown', content: markdownToFeishu(msg.content) }],
      });

      if (msg.replyTo) {
        const response = await this.apiClient.im.message.reply({
          path: { message_id: msg.replyTo },
          data: { msg_type: 'interactive', content: cardContent },
        });

        const respCode = (response as any).code;
        
        if (respCode === 0) {
          this.log('info', '✓ Reply sent to %s', msg.replyTo);
        } else {
          this.log('error', 'Failed to reply: code=%s, msg=%s', respCode, (response as any).msg);
        }
        return;
      }

      const response = await this.apiClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
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

  async updateMessage(chatId: string, messageId: string, content: string): Promise<void> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return;
    }

    try {
      const cardContent = JSON.stringify({
        config: { wide_screen_mode: true },
        elements: [{ tag: 'markdown', content: markdownToFeishu(content) }],
      });

      const response = await this.apiClient.im.message.patch({
        path: { message_id: messageId },
        params: { msg_type: 'interactive' },
        data: { content: cardContent },
      });

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

  /**
   * Handle incoming image message from Feishu
   */
  private async handleImageMessage(
    message: any,
    senderId: string,
    chatId: string,
    data: any
  ): Promise<void> {
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
      this.log('info', 'Downloading image: %s, message_id: %s', imageKey, messageId);

      const imagePath = await this.downloadImage(imageKey, messageId);

      if (!imagePath) {
        this.log('error', 'Failed to download image');
        return;
      }

      this.log('info', 'Image downloaded to: %s', imagePath);
      this.log('info', 'Using local path for vision: %s', imagePath);
      
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

      this.log('debug', 'Image message forwarded to bus successfully');

    } catch (e: any) {
      this.log('error', 'Error handling image message:', e?.message || e);
    }
  }

  /**
   * Handle incoming post message from Feishu (rich text with potential images)
   * Handles multiple structures: body.elements, content.elements, or direct elements
   */
  private async handlePostMessage(
    message: any,
    senderId: string,
    chatId: string,
    data: any
  ): Promise<void> {
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

      this.log('info', 'Post message keys: %s', Object.keys(contentData));
      this.log('info', 'Post message content: %s', JSON.stringify(contentData).substring(0, 1000));
      this.log('debug', 'content field type: %s', typeof contentData?.content);
      this.log('debug', 'content field value: %s', typeof contentData?.content === 'string' ? contentData?.content : 'not a string');

      // Try different possible structures
      // Structure 1: { body: { elements: [...] } }
      // Structure 2: { title: "...", content: { elements: [...] } } (飞书卡片消息)
      // Structure 3: { title: "...", content: "text string" } (简单文本)
      // Structure 4: { i18n_title_key: {...}, content: { i18n_elements: [...] } } (国际化卡片)
      
      let elements: unknown[] | undefined = undefined;

      // Try body.elements
      const body = contentData?.body as Record<string, unknown> | undefined;
      if (body?.elements) {
        elements = body.elements as unknown[];
        this.log('debug', 'Found elements in body');
      }

      // Try content (飞书富文本消息结构)
      if (!elements && contentData?.content) {
        const contentField = contentData.content;

        // 富文本消息 content 是二维数组: content: [[{tag, ...}, {tag, ...}], [{tag, ...}]]
        // 例如: [
        //   [{"tag": "text", "text": "第一行"}, {"tag": "img", "image_key": "xxx"}]
        //   [{"tag": "text", "text": "第二行"}]
        // ]
        if (typeof contentField === 'object' && contentField !== null) {
          const contentObj = contentField as Record<string, unknown>;

          // 检查是否是二维数组 (富文本消息)
          if (Array.isArray(contentObj)) {
            // content 是二维数组，遍历每一行
            for (const row of contentObj) {
              if (!Array.isArray(row)) continue;
              for (const el of row) {
                if (!el || typeof el !== 'object') continue;
                const element = el as Record<string, unknown>;
                const tag = element.tag as string;

                // 处理图片元素
                if (tag === 'img') {
                  const imageKey = element.image_key as string;
                  if (imageKey) {
                    const messageId = message?.message_id;
                    this.log('info', 'Downloading image from post: %s', imageKey);
                    const imagePath = await this.downloadImage(imageKey, messageId);
                    if (imagePath) {
                      mediaFiles.push(imagePath);
                      this.log('info', 'Image downloaded: %s', imagePath);
                    }
                  }
                }
                // 处理文本元素
                else if (tag === 'text' || tag === 'plain_text') {
                  const text = element.text as string || element.content as string;
                  if (text) textParts.push(text);
                }
                // 处理 markdown 元素
                else if (tag === 'markdown') {
                  const text = element.text as string || element.content as string;
                  if (text) textParts.push(text);
                }
                // 处理链接元素
                else if (tag === 'a') {
                  const text = element.text as string;
                  const href = element.href as string;
                  if (text) textParts.push(`${text} (${href})`);
                }
                // 处理 @ 提及
                else if (tag === 'at') {
                  const userName = element.user_name as string;
                  if (userName) textParts.push(`@${userName}`);
                }
              }
            }
            this.log('debug', 'Processed content as 2D array');
          }
          // Try elements (卡片消息结构)
          else if (contentObj?.elements) {
            elements = contentObj.elements as unknown[];
            this.log('debug', 'Found elements in content.elements');
          }
          // Try i18n_elements (国际化)
          else if (contentObj?.i18n_elements) {
            elements = contentObj.i18n_elements as unknown[];
            this.log('debug', 'Found elements in content.i18n_elements');
          }
          // Try extracting text from content object
          else if (!textParts.length && contentObj?.text) {
            textParts.push(contentObj.text as string);
          }
        } else if (typeof contentField === 'string') {
          // Content is a string, use as text
          textParts.push(contentField);
          this.log('debug', 'Using content as text string');
      }
      }

      // Try direct elements array
      if (!elements && contentData?.elements) {
        elements = contentData.elements as unknown[];
        this.log('debug', 'Found elements at root level');
      }

      // Try i18n_elements at root level (国际化卡片)
      if (!elements && contentData?.i18n_elements) {
        elements = contentData.i18n_elements as unknown[];
        this.log('debug', 'Found i18n_elements at root level');
      }

      // Extract title
      if (contentData?.title) {
        textParts.push(`[${contentData.title}]`);
      }

      // Try i18n_title
      if (!textParts.length && contentData?.i18n_title) {
        const i18nTitle = contentData.i18n_title as Record<string, unknown>;
        if (i18nTitle?.zh_cn) {
          textParts.push(`[${i18nTitle.zh_cn}]`);
        }
      }

      // Process elements if found
      if (elements && Array.isArray(elements)) {
        for (const element of elements) {
          if (!element || typeof element !== 'object') continue;

          const el = element as Record<string, unknown>;
          const tag = el.tag as string;

          // Handle image element
          if (tag === 'img') {
            const imageKey = el?.image_key as string;
            if (imageKey) {
              const messageId = message?.message_id;
              this.log('info', 'Downloading image from post: %s', imageKey);
              const imagePath = await this.downloadImage(imageKey, messageId);
              if (imagePath) {
                mediaFiles.push(imagePath);
                this.log('info', 'Image downloaded: %s', imagePath);
              }
            }
          }
          // Handle text element
          else if (tag === 'text' || tag === 'plain_text') {
            const text = el?.text as string || el?.content as string;
            if (text) textParts.push(text);
          }
          // Handle markdown element
          else if (tag === 'markdown') {
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

      this.log('info', 'Post message: text=%s, images=%s', content.substring(0, 50), mediaFiles.length);

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

      this.log('debug', 'Post message forwarded to bus successfully');

    } catch (e: any) {
      this.log('error', 'Error handling post message:', e?.message || e);
    }
  }

  /**
   * Download image from Feishu API and save to temp directory
   */
  private async downloadImage(imageKey: string, messageId?: string): Promise<string | null> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return null;
    }

    try {
      const tempDir = join(tmpdir(), 'nanobot_feishu_images');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      let response: any;

      if (messageId) {
        this.log('debug', 'Using im.messageResource.get API with message_id: %s', messageId);
        response = await this.apiClient.im.messageResource.get({
          path: { message_id: messageId, file_key: imageKey },
          params: { type: 'image' },
        });
      } else {
        this.log('debug', 'Using im.image.get API with image_key: %s', imageKey);
        response = await this.apiClient.im.image.get({
          path: { image_key: imageKey },
        });
      }

      this.log('debug', 'Response keys: %s', Object.keys(response));
      
      if (response.code !== undefined && response.code !== 0) {
        this.log('error', 'Feishu API error: code=%s, msg=%s', response.code, response.msg);
        return null;
      }

      let ext = 'png';
      if (response.headers && response.headers['content-type']) {
        const contentType = response.headers['content-type'];
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('webp')) ext = 'webp';
      }

      const imagePath = join(tempDir, `feishu_${imageKey}_${Date.now()}.${ext}`);
      
      if (response.data && Buffer.isBuffer(response.data)) {
        writeFileSync(imagePath, response.data);
      } else if (typeof response.writeFile === 'function') {
        await response.writeFile(imagePath);
      } else if (typeof response.getReadableStream === 'function') {
        const stream = response.getReadableStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        writeFileSync(imagePath, Buffer.concat(chunks));
      } else {
        this.log('error', 'Unexpected image response format, keys: %s', Object.keys(response));
        return null;
      }

      return imagePath;

    } catch (e: any) {
      this.log('error', 'Failed to download image: %s', e?.message || e);
      return null;
    }
  }

  /**
   * Upload image to Feishu and return accessible URL for vision models
   */
  private async uploadImageForVision(imagePath: string): Promise<string | null> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return null;
    }

    try {
      this.log('debug', 'Uploading image to Feishu for vision: %s', imagePath);

      const response = await this.apiClient.im.image.create({
        data: {
          image_type: 'message',
          image: createReadStream(imagePath) as any,
        },
      }) as any;

      this.log('debug', 'Upload response: %s', JSON.stringify(response));
      
      if (response.code !== undefined && response.code !== 0) {
        this.log('error', 'Failed to upload image to Feishu: code=%s, msg=%s', response.code, response.msg);
        return null;
      }

      const imageKey = response.data?.image_key || response.image_key;
      if (!imageKey) {
        this.log('error', 'No image_key returned from Feishu upload, response: %s', JSON.stringify(response));
        return null;
      }

      const imageUrl = `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`;
      this.log('debug', 'Image uploaded, URL: %s', imageUrl);

      return imageUrl;

    } catch (e: any) {
      this.log('error', 'Failed to upload image for vision: %s', e?.message || e);
      return null;
    }
  }
}
