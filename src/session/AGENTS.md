# src/session

## OVERVIEW

会话管理模块，负责对话历史存储和检索。

## STRUCTURE

```
src/session/
├── index.ts       # 导出
├── types.ts       # SessionMessage, ToolCall, SessionData, SessionInfo
├── session.ts    # Session 类
├── manager.ts    # SessionManager: 会话管理器
└── session.ts    # (重复，已废弃)
```

## WHERE TO LOOK

| 任务 | 文件 | 说明 |
|------|------|------|
| 会话类 | `session.ts` | Session: 单会话历史管理 |
| 管理器 | `manager.ts` | SessionManager: 多会话管理 |
| 类型 | `types.ts` | SessionMessage, SessionInfo 等 |

## KEY CLASSES

- `Session`: 单个会话的历史管理
- `SessionManager`: 会话管理器，支持 JSONL 格式存储

## CONVENTIONS

- 会话数据存储为 JSONL 格式 (每行一个 JSON)
- 元数据存储在 session 头部
- 使用 session key 区分不同会话

## NOTES

- 会话路径: `~/.nanobot/workspace/sessions/`
- SessionInfo 包含: id, key, created, updated, messageCount
