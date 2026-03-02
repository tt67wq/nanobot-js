import type { FeishuMention } from './types';

/**
 * 从卡片消息中提取文本
 */
export function extractTextFromCard(contentData: Record<string, unknown>): string {
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

/**
 * 解析飞书文本消息内容
 */
export function parseTextContent(contentJson: string): string {
  try {
    const contentData = JSON.parse(contentJson);
    return contentData.text || '';
  } catch {
    return contentJson;
  }
}

/**
 * 处理消息中的 @ 提及占位符
 */
export function processMentions(content: string, mentions: FeishuMention[]): string {
  // 使用 mentions 数组替换 @_user_X 占位符
  for (const mention of mentions) {
    if (mention?.key && mention?.name) {
      content = content.replace(
        new RegExp(mention.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        mention.name
      );
    }
  }

  // 清理可能残留的 @_user_X 格式占位符
  return content.replace(/@_user_\d+\s*/g, '').trim();
}

/**
 * 检查是否是群聊
 */
export function isGroupChat(chatType?: string): boolean {
  return chatType?.includes('group') ?? false;
}
