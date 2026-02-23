import { BaseChannel } from './base';
import type { MessageBus } from '../bus/queue';
import type { OutboundMessage } from '../bus/events';
import { writeFileSync, readFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
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
    
    // Replace %s placeholders with args
    let formattedMsg = message;
    for (const arg of args) {
      formattedMsg = formattedMsg.replace('%s', typeof arg === 'string' ? arg : JSON.stringify(arg));
    }
    
    const msg = `[FEISHU:${level.toUpperCase()}] ${formattedMsg}`;
    
    // Output to logger
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

      // Handle image messages
      if (messageType === 'image') {
        await this.handleImageMessage(message, senderId, chatId, data);
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

      // Download image from Feishu - use messageResource API for message images
      const imagePath = await this.downloadImage(imageKey, messageId);

      if (!imagePath) {
        this.log('error', 'Failed to download image');
        return;
      }

      this.log('info', 'Image downloaded to: %s', imagePath);

      // Upload image back to Feishu to get a accessible URL for the model
      const imageUrl = await this.uploadImageForVision(imagePath);
      
      if (!imageUrl) {
        this.log('error', 'Failed to upload image for vision, falling back to local path');
        // Fallback to local path if upload fails
        await this.handleMessage(
          senderId,
          chatId,
          '[图片消息]',  // Brief text prompt
          [imagePath],   // Media: image file path
          {
            message_id: message?.message_id,
            create_time: message?.create_time,
            event_type: data?.event_type,
            msg_type: 'image',
            image_key: imageKey,
          }
        );
      } else {
        this.log('info', 'Image uploaded for vision: %s', imageUrl);
        // Use Feishu URL instead of local path
        await this.handleMessage(
          senderId,
          chatId,
          '[图片消息]',  // Brief text prompt
          [imageUrl],   // Media: Feishu image URL
          {
            message_id: message?.message_id,
            create_time: message?.create_time,
            event_type: data?.event_type,
            msg_type: 'image',
            image_key: imageKey,
          }
        );
      }

      this.log('debug', 'Image message forwarded to bus successfully');

    } catch (e: any) {
      this.log('error', 'Error handling image message:', e);
    }
  }

  /**
   * Download image from Feishu API and save to temp directory
   * For message images, use messageResource API with message_id
   */
  private async downloadImage(imageKey: string, messageId?: string): Promise<string | null> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return null;
    }

    try {
      // Create temp directory if not exists
      const tempDir = join(tmpdir(), 'nanobot_feishu_images');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      let response: any;

      // Use messageResource API if we have message_id (for message images)
      if (messageId) {
        this.log('debug', 'Using im.messageResource.get API with message_id: %s', messageId);
        response = await this.apiClient.im.messageResource.get({
          path: {
            message_id: messageId,
            file_key: imageKey,
          },
          params: {
            type: 'image',
          },
        });
      } else {
        // Fallback to image API for uploaded images
        this.log('debug', 'Using im.image.get API with image_key: %s', imageKey);
        response = await this.apiClient.im.image.get({
          path: {
            image_key: imageKey,
          },
        });
      }

      // Check for API error response
      this.log('debug', 'Response keys: %s', Object.keys(response));
      
      // If response has code field, check if it's an error
      if (response.code !== undefined && response.code !== 0) {
        this.log('error', 'Feishu API error: code=%s, msg=%s', response.code, response.msg);
        return null;
      }

      // Determine file extension from content type
      let ext = 'png';
      if (response.headers && response.headers['content-type']) {
        const contentType = response.headers['content-type'];
        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          ext = 'jpg';
        } else if (contentType.includes('gif')) {
          ext = 'gif';
        } else if (contentType.includes('webp')) {
          ext = 'webp';
        }
      }

      // Save to temp file using SDK's writeFile method
      const imagePath = join(tempDir, `feishu_${imageKey}_${Date.now()}.${ext}`);
      
      // Handle different response formats
      if (response.data && Buffer.isBuffer(response.data)) {
        // Data is in response.data as Buffer
        writeFileSync(imagePath, response.data);
      } else if (typeof response.writeFile === 'function') {
        // Use SDK's writeFile method
        await response.writeFile(imagePath);
      } else if (typeof response.getReadableStream === 'function') {
        // Use readable stream
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
   * DashScope doesn't support base64, so we upload to Feishu and use their URL
   */
  private async uploadImageForVision(imagePath: string): Promise<string | null> {
    if (!this.apiClient) {
      this.log('error', 'API client not initialized');
      return null;
    }

    try {
      this.log('debug', 'Uploading image to Feishu for vision: %s', imagePath);

      // Upload to Feishu - SDK expects a Readable stream, not Buffer
      const response = await this.apiClient.im.image.create({
        data: {
          image_type: 'message',
          image: createReadStream(imagePath) as any,
        },
      }) as any;

      // Check for API error
      this.log('debug', 'Upload response: %s', JSON.stringify(response));
      
      if (response.code !== undefined && response.code !== 0) {
        this.log('error', 'Failed to upload image to Feishu: code=%s, msg=%s', response.code, response.msg);
        return null;
      }

      // Get image_key from response - SDK may return directly or wrapped in data
      const imageKey = response.data?.image_key || response.image_key;
      if (!imageKey) {
        this.log('error', 'No image_key returned from Feishu upload, response: %s', JSON.stringify(response));
        return null;
      }

      // Build Feishu image URL
      const imageUrl = `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`;
      this.log('debug', 'Image uploaded, URL: %s', imageUrl);

      return imageUrl;

    } catch (e: any) {
      this.log('error', 'Failed to upload image for vision: %s', e?.message || e);
      return null;
    }
  }
}
