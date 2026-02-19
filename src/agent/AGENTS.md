# src/agent

## OVERVIEW

Agent 核心模块，负责 LLM 与工具之间的主循环逻辑。

## STRUCTURE

```
src/agent/
├── loop.ts        # AgentLoop: 主循环
├── context.ts     # ContextBuilder: 上下文构建
├── memory.ts      # MemoryStore: 长期记忆
├── skills.ts      # SkillsLoader: 技能加载
├── subagent.ts    # SubagentManager: 子任务管理
├── types.ts       # 类型定义
└── index.ts       # 导出
```

## WHERE TO LOOK

| 任务 | 文件 | 说明 |
|------|------|------|
| 主循环 | `loop.ts` | AgentLoop 类，LLM ↔ 工具执行 |
| 上下文 | `context.ts` | 构建发送给 LLM 的消息 |
| 记忆 | `memory.ts` | 长期记忆存储 |
| 子代理 | `subagent.ts` | 子任务执行器 |

## KEY CLASSES

- `AgentLoop`: 核心循环，处理 LLM 响应和工具调用
- `ContextBuilder`: 构建系统提示和消息历史
- `MemoryStore`: 实现 IMemoryStore 接口
- `SkillsLoader`: 实现 ISkillsLoader 接口
- `SubagentManager`: 管理子任务执行

## CONVENTIONS

- 所有导出通过 `index.ts` barrel file
- 类型定义在 `types.ts`
- 依赖注入通过接口 (IMemoryStore, ISkillsLoader)

## NOTES

- BOOTSTRAP_FILES: `["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]`
- 消息类型: `InboundMessage`, `OutboundMessage` (定义在 bus/events)
