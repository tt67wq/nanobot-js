# src/channels

## OVERVIEW

通道集成模块，当前支持飞书 (Feishu) WebSocket 消息。

## STRUCTURE

```
src/channels/
├── index.ts      # 导出
├── base.ts      # BaseChannel 抽象类
├── manager.ts   # ChannelManager: 通道管理器
├── feishu.ts    # FeishuChannel: 飞书实现
└── manager.ts   # (重复)
```

## WHERE TO LOOK

| 任务 | 文件 | 说明 |
|------|------|------|
| 基类 | `base.ts` | BaseChannel 抽象类 |
| 飞书 | `feishu.ts` | FeishuChannel |
| 管理器 | `manager.ts` | ChannelManager |

## KEY CLASSES

- `BaseChannel`: 通道抽象基类
- `FeishuChannel`: 飞书 WebSocket 实现
- `ChannelManager`: 多通道管理

## CONVENTIONS

- 所有通道继承 `BaseChannel`
- 通道需要实现: connect, disconnect, send, onMessage

## FEISHU CONFIG

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "YOUR_APP_ID",
      "app_secret": "YOUR_APP_SECRET",
      "allowFrom": ["open_id_1", "open_id_2"]
    }
  }
}
```

## NOTES

- 使用 @larksuiteoapi/node-sdk
- 支持 WebSocket 长连接
- 支持消息白名单 (allowFrom)
