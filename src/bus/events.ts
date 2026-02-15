/**
 * 消息事件类型定义
 * 
 * 对应 Python: nanobot/bus/events.py
 * 
 * 定义入站消息和出站消息的类型，用于消息总线系统
 */

// ============================================
// 入站消息 (从聊天渠道收到)
// ============================================

/**
 * 入站消息接口
 * 
 * 当用户通过任何渠道（飞书、CLI 等）发送消息时，
 * 消息会被包装成 InboundMessage 推送到消息队列
 */
export interface InboundMessage {
  /** 消息来源渠道: feishu, cli, system 等 */
  channel: string;
  /** 发送者用户 ID */
  senderId: string;
  /** 聊天/会话 ID */
  chatId: string;
  /** 消息文本内容 */
  content: string;
  /** 媒体文件 URL 列表 (可选) */
  media?: string[];
  /** 渠道特定的其他数据 (可选) */
  metadata?: Record<string, unknown>;
}

/**
 * 获取入站消息的会话唯一标识键
 * 
 * 用于在会话管理器中查找对应的会话
 * 
 * @param msg - 入站消息
 * @returns 格式: "channel:chatId"
 */
export function getSessionKey(msg: InboundMessage): string {
  return `${msg.channel}:${msg.chatId}`;
}

// ============================================
// 出站消息 (发送到聊天渠道)
// ============================================

/**
 * 出站消息接口
 * 
 * Agent 处理完请求后，将响应封装成 OutboundMessage
 * 推送到出站队列，由各渠道的实现负责发送
 */
export interface OutboundMessage {
  /** 目标渠道: feishu, cli 等 */
  channel: string;
  /** 目标聊天/会话 ID */
  chatId: string;
  /** 消息文本内容 */
  content: string;
  /** 需要回复的消息 ID (可选，用于回复特定消息) */
  replyTo?: string;
  /** 媒体文件 URL 列表 (可选) */
  media?: string[];
  /** 渠道特定的其他数据 (可选) */
  metadata?: Record<string, unknown>;
}

// ============================================
// 消息类型守卫
// ============================================

/**
 * 检查对象是否为有效的 InboundMessage
 */
export function isInboundMessage(obj: unknown): obj is InboundMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.channel === 'string' &&
    typeof msg.senderId === 'string' &&
    typeof msg.chatId === 'string' &&
    typeof msg.content === 'string'
  );
}

/**
 * 检查对象是否为有效的 OutboundMessage
 */
export function isOutboundMessage(obj: unknown): obj is OutboundMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.channel === 'string' &&
    typeof msg.chatId === 'string' &&
    typeof msg.content === 'string'
  );
}
