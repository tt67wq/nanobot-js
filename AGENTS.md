# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-23
**Commit:** latest
**Branch:** main

## OVERVIEW

超轻量级个人 AI 助手，使用 Bun + TypeScript 实现。支持多 LLM 提供商 (Anthropic/OpenAI)、多通道集成 (飞书)、定时任务和心跳服务。**支持图片理解 (Vision)**。

## STRUCTURE

```
nanobot/
├── src/
│   ├── agent/          # 核心 Agent 循环 (LLM ↔ 工具)
│   ├── tools/          # 内置工具 (Shell/Web/FS/Spawn/Screenshot)
│   ├── providers/      # LLM 提供商 (Anthropic/OpenAI)
│   ├── channels/       # 通道集成 (飞书)
│   ├── bus/            # 消息路由
│   ├── cron/           # 定时任务
│   ├── session/        # 会话管理
│   ├── config/         # 配置加载 (Zod)
│   ├── heartbeat/      # 心跳服务
│   ├── cli/            # 命令行入口
│   └── skills/         # 技能包
├── tests/              # 测试
├── bin/                # 编译产物
└── Makefile            # 构建脚本
```

## WHERE TO LOOK

| 任务 | 位置 | 说明 |
|------|------|------|
| Agent 核心逻辑 | `src/agent/loop.ts` | Agent 主循环 |
| 图片理解 | `src/agent/context.ts` | _buildUserContent() 图片转 base64 |
| 工具实现 | `src/tools/*.ts` | Shell/Web/FS/Message 等 |
| LLM 集成 | `src/providers/*.ts` | Anthropic/OpenAI，含 Vision 支持 |
| CLI 命令 | `src/cli/commands.ts` | 所有命令入口 |
| 配置系统 | `src/config/schema.ts` | Zod 验证规则 |
| 飞书集成 | `src/channels/feishu.ts` | WebSocket 消息，图片处理 |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `AgentLoop` | class | `src/agent/loop.ts` | Agent 主循环 |
| `ToolRegistry` | class | `src/tools/registry.ts` | 工具注册 |
| `MessageBus` | class | `src/bus/queue.ts` | 消息队列 |
| `CronService` | class | `src/cron/service.ts` | 定时任务 |
| `SessionManager` | class | `src/session/manager.ts` | 会话管理 |
| `AnthropicProvider` | class | `src/providers/anthropic.ts` | Claude 集成，Vision |
| `OpenAIProvider` | class | `src/providers/openai.ts` | GPT/通义集成，Vision |
| `FeishuChannel` | class | `src/channels/feishu.ts` | 飞书消息，图片下载 |

## CONVENTIONS

- **运行时**: 始终使用 `bun` (bun install/run/test/build)
- **TypeScript**: strict 模式，ESNext 模块
- **CLI**: commander 框架
- **配置**: Zod schema 验证，配置存 `~/.nanobot/config.json`
- **测试**: bun test (vitest 风格)
- **日志**: chalk 彩色输出
- **导出**: barrel pattern (index.ts 重导出)

## ANTI-PATTERNS (THIS PROJECT)

- **禁止**: 使用 `npm`/`yarn`/`pnpm`，只允许 `bun`
- **禁止**: 配置文件中使用下划线命名 (自动转换 camel ↔ snake)
- **禁止**: 直接导入 provider 实现，应通过 `createProvider()` 工厂

## UNIQUE STYLES

- 极简代码风格，单文件 <300 行
- 所有工具继承 `Tool` 基类
- 配置使用 Zod 进行运行时验证
- 会话数据存储为 JSONL 格式
- Bootstrap 文件: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`
- **图片理解**: 通过 base64 编码传递图片给 LLM

## IMAGE VISION (图片理解)

飞书通道支持图片理解：
1. 收到图片消息 → 下载到本地临时目录
2. 读取文件 → 转换为 base64 data URL
3. 传递给 `ContextBuilder._buildUserContent()`
4. Provider 转换为 API 兼容格式 (Anthropic/OpenAI)

支持的模型: Claude (所有 vision 模型), GPT-4o, 通义千问等

## COMMANDS

```bash
# 开发
bun install          # 安装依赖
bun run build       # 构建 TypeScript
bun test            # 运行测试

# 运行
bun run src/cli/commands.ts agent -m "你好"   # 单次对话
bun run src/cli/commands.ts agent            # 交互模式
bun run src/cli/commands.ts gateway          # 启动网关

# Makefile
make install   # bun install
make build    # bun run build
make test     # bun test
make run MSG='Hello'
make agent    # 交互模式
make gateway  # 网关服务
```

## NOTES

- 用户是 JS 小白，代码需要详细注释
- 所有新增代码禁止使用 `any` 类型
- 配置文件位置: `~/.nanobot/config.json`
- 工作空间: `~/.nanobot/workspace/`
