import type { FeishuConfig } from './types';

/**
 * 飞书 API 客户端封装
 */
export class FeishuClient {
  public wsClient: any = null;
  public apiClient: any = null;
  private config: FeishuConfig;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  /**
   * 初始化飞书客户端
   */
  async init(): Promise<void> {
    const appId = this.config.appId || (this.config as any).app_id;
    const appSecret = this.config.appSecret || (this.config as any).app_secret;

    if (!appId || !appSecret) {
      throw new Error('Missing appId or appSecret');
    }

    const lark: any = await import('@larksuiteoapi/node-sdk');

    this.apiClient = new lark.Client({
      appId,
      appSecret,
      logLevel: lark.LoggerLevel.WARN,
    });

    this.wsClient = new lark.WSClient({
      appId,
      appSecret,
      loggerLevel: lark.LoggerLevel.WARN,
    });
  }

  /**
   * 启动 WebSocket 监听
   */
  startListening(onMessage: (data: any) => void): void {
    const lark = require('@larksuiteoapi/node-sdk');
    const eventDispatcher = new lark.EventDispatcher({});

    eventDispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        await onMessage(data);
      }
    });

    this.wsClient.start({
      eventDispatcher,
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(chatId: string, content: string): Promise<any> {
    const cardContent = JSON.stringify({
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content }],
    });

    return await this.apiClient.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: cardContent,
      },
    });
  }

  /**
   * 回复消息
   */
  async replyMessage(messageId: string, content: string): Promise<any> {
    const cardContent = JSON.stringify({
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content }],
    });

    return await this.apiClient.im.message.reply({
      path: { message_id: messageId },
      data: { msg_type: 'interactive', content: cardContent },
    });
  }

  /**
   * 更新消息
   */
  async updateMessage(messageId: string, content: string): Promise<any> {
    const cardContent = JSON.stringify({
      config: { wide_screen_mode: true },
      elements: [{ tag: 'markdown', content }],
    });

    return await this.apiClient.im.message.patch({
      path: { message_id: messageId },
      params: { msg_type: 'interactive' },
      data: { content: cardContent },
    });
  }

  /**
   * 获取群聊信息
   * @param chatId 群聊 ID
   * @returns 群聊信息（包含名称）
   */
  async getChatInfo(chatId: string): Promise<{ name: string; avatar: string; ownerId: string } | null> {
    try {
      const response = await this.apiClient.im.chat.get({
        path: { chat_id: chatId },
      });
      
      if (response.data && response.data.chat) {
        return {
          name: response.data.chat.name || '未命名群聊',
          avatar: response.data.chat.avatar || '',
          ownerId: response.data.chat.owner_id || '',
        };
      }
      return null;
    } catch (e) {
      console.error('[FeishuClient] Failed to get chat info:', e);
      return null;
    }
  }
}
