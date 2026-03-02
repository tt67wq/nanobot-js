/**
 * 飞书通道配置
 */
export interface FeishuConfig {
  appId?: string;
  app_secret?: string;
  appSecret?: string;
  botUserId?: string;
  allowFrom?: string[];
  verbose?: boolean;
  [key: string]: unknown;
}

/**
 * 飞书消息事件
 */
export interface FeishuMessageEvent {
  message: {
    message_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    create_time?: string;
    mentions?: FeishuMention[];
  };
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
    };
  };
  event?: {
    mentions?: FeishuMention[];
  };
  event_type?: string;
}

/**
 * 飞书 @ 提及
 */
export interface FeishuMention {
  key: string;
  id: {
    user_id?: string;
    union_id?: string;
  };
  name: string;
}
