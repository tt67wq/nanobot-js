import { describe, it, expect } from "bun:test";

// 模拟飞书群聊 @ 机器人的消息事件
const mockGroupMentionData = {
  message: {
    message_id: "om_xxx",
    chat_id: "oc_xxx",
    chat_type: "group",
    message_type: "text",
    content: JSON.stringify({ text: "@nanobot 你好" }),
  },
  sender: {
    sender_id: { open_id: "ou_xxx" }
  },
  event: {
    mentions: [
      {
        key: "@_user_1",
        id: { user_id: "cli_xxx" },
        name: "nanobot"
      }
    ]
  }
};

// 模拟群聊没有 @ 机器人
const mockGroupNoMentionData = {
  message: {
    message_id: "om_xxx",
    chat_id: "oc_xxx",
    chat_type: "group",
    message_type: "text",
    content: JSON.stringify({ text: "大家好" }),
  },
  sender: {
    sender_id: { open_id: "ou_xxx" }
  },
  event: {
    mentions: []
  }
};

// 模拟私聊
const mockP2PData = {
  message: {
    message_id: "om_xxx",
    chat_id: "ou_xxx",
    chat_type: "p2p",
    message_type: "text",
    content: JSON.stringify({ text: "你好" }),
  },
  sender: {
    sender_id: { open_id: "ou_xxx" }
  },
  event: {
    mentions: []
  }
};

// 测试 mentions 检测逻辑
function isGroupChat(data: any): boolean {
  const chatType = data?.message?.chat_type;
  return chatType?.includes('group');
}

function checkMentioned(data: any, currentAppId: string): boolean {
  const mentions = data?.event?.mentions || data?.message?.mentions || [];
  const chatType = data?.message?.chat_type;
  const isGroupChat = chatType?.includes('group');

  if (!isGroupChat) return true; // 私聊直接通过
  if (mentions.length === 0) return false;

  for (const mention of mentions) {
    const mentionKey = mention?.key || '';
    if (mentionKey.startsWith('@_user_')) {
      return true;
    }
    const mentionUserId = mention?.id?.user_id;
    if (mentionUserId && mentionUserId === currentAppId) {
      return true;
    }
  }
  return false;
}

describe("飞书群聊 @ 检测逻辑", () => {
  const currentAppId = "cli_xxx";

  it("应该检测到群聊中 @ 了机器人", () => {
    const result = checkMentioned(mockGroupMentionData, currentAppId);
    expect(result).toBe(true);
  });

  it("应该拒绝群聊中未 @ 机器人的消息", () => {
    const result = checkMentioned(mockGroupNoMentionData, currentAppId);
    expect(result).toBe(false);
  });

  it("私聊应该直接通过", () => {
    const result = checkMentioned(mockP2PData, currentAppId);
    expect(result).toBe(true);
  });

  it("isGroupChat 应该正确识别群聊", () => {
    expect(isGroupChat(mockGroupMentionData)).toBe(true);
    expect(isGroupChat(mockGroupNoMentionData)).toBe(true);
    expect(isGroupChat(mockP2PData)).toBe(false);
  });
});
