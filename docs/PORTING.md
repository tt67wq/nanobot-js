# nanobot-javascript 移植计划

> 将 Python nanobot 移植到 JavaScript + Bun 生态

## 目标

使用 JavaScript + Bun 复制 [nanobot](https://github.com/HKUDS/nanobot) (~4000 行代码的超轻量级 AI Agent 框架)

## 技术栈

| 类别 | 技术选择 |
|------|----------|
| 运行时 | Bun |
| 语言 | TypeScript |
| CLI | Commander.js / Citty |
| 验证 | Zod / Valibot |
| 飞书 SDK | @larksuiteoapi/node-sdk |
| MCP | @modelcontextprotocol/client |
| 日志 | Pino |
| 终端 UI | Chalk / Ora |

---

## 移植顺序

### 第一阶段：基础设施 (Foundation)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 1 | config/ | nanobot/config/ | ~150 行 | 无 |
| 2 | utils/ | nanobot/utils/ | ~100 行 | 无 |

### 第二阶段：核心依赖 (Core Dependencies)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 3 | providers/ | nanobot/providers/ | ~530 行 | config |
| 4 | session/ | nanobot/session/ | ~210 行 | config |

### 第三阶段：Agent 核心 (Agent Core)

#### 3A: 工具系统基础 (1h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 5 | agent/tools/base | nanobot/agent/tools/base.py | ~100 行 | - |
| 6 | agent/tools/registry | nanobot/agent/tools/registry.py | ~80 行 | 5 |

**目标**: 实现工具基类和注册表，支持基础工具定义

#### 3B: 上下文管理 (1h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 7 | agent/context | nanobot/agent/context.py | ~200 行 | providers, session |

**目标**: 管理对话上下文，构建消息历史

#### 3C: 核心循环 (2h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 8 | agent/loop | nanobot/agent/loop.py | ~300 行 | 6, 7, providers |

**目标**: 实现 Agent 主循环，处理 LLM 调用和工具执行

**验证**: 能跑通一个简单对话 + 工具调用

#### 3D: 内置工具集 (2h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 12 | agent/tools/* | nanobot/agent/tools/*.py | ~500 行 | 5, 6 |

**目标**: 实现 web, shell, filesystem, message, spawn 等内置工具

**验证**: 每个工具单独测试

#### 3E: 记忆系统 (1h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 9 | agent/memory | nanobot/agent/memory.py | ~150 行 | session |

**目标**: 短期/长期记忆管理

#### 3F: 技能系统 (1h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 10 | agent/skills | nanobot/agent/skills.py | ~100 行 | config |

**目标**: Skill 加载和执行

#### 3G: 子 Agent (1h)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 11 | agent/subagent | nanobot/agent/subagent.py | ~200 行 | 8 |

**目标**: 子任务委托和结果汇总

---

**阶段总结**: 3A-3G 共 7 个子阶段，每个 ~1h，总计 ~8h

### 第四阶段：扩展功能 (Extensions)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 13 | mcp/ | nanobot/mcp/ | ~310 行 | agent/tools |
| 14 | channels/ | nanobot/channels/ | ~350 行 | config, providers |
| 15 | cron/ | nanobot/cron/ | ~420 行 | config |
| 16 | heartbeat/ | nanobot/heartbeat/ | ~130 行 | config |
| 17 | bus/ | nanobot/bus/ | ~100 行 | - |

### 第五阶段：CLI 入口 (CLI Entry)

| 顺序 | 模块 | Python 源码 | 工作量 | 依赖 |
|------|------|-------------|--------|------|
| 18 | cli/ | nanobot/cli/ | ~350 行 | 以上所有 |

---

## 模块依赖关系图

```
                    ┌─────────────┐
                    │   config/   │  (1)
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐        ┌─────────┐
   │providers│       │ session │        │  bus/   │  (17)
   │  (3)    │       │  (4)    │        └─────────┘
   └────┬────┘       └────┬────┘
        │                  │
        └────────┬────────┘
                 ▼
        ┌────────────────┐
        │   agent/loop   │  (8)  ◄── 核心
        └───────┬────────┘
                │
   ┌────────────┼────────────┐
   ▼            ▼            ▼
┌──────┐   ┌─────────┐   ┌─────────┐
│memory│   │ skills/ │   │  tools/ │  (5,6,12)
│ (9)  │   │  (10)  │   └────┬────┘
└──┬───┘   └────┬────┘        │
   │            │             │
   └────────────┴──────┬──────┘
                       ▼
              ┌────────────────┐
              │   channels/    │  (14)  ◄── 飞书
              │      mcp/     │  (13)
              └───────┬────────┘
                      │
              ┌───────▼───────┐
              │  cron/        │  (15)  ◄── 后台服务
              │ heartbeat/    │  (16)
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │     cli/      │  (18)  ◄── 入口
              └───────────────┘
```

---

## MVP 范围

第一阶段只移植最小可运行版本：

### 必需模块 (MVP)

| 模块 | 顺序 | 原因 |
|------|------|------|
| config | 1 | 配置必需 |
| providers | 3 | LLM 调用必需 |
| session | 4 | 会话存储必需 |
| agent/loop | 8 | 核心循环 |
| agent/tools | 5,6,12 | 工具系统 |
| cli | 18 | 入口 |

### 可选模块 (后续)

| 模块 | 顺序 | 原因 |
|------|------|------|
| channels/飞书 | 14 | IM 集成 |
| mcp | 13 | MCP 工具 |
| cron | 15 | 定时任务 |
| heartbeat | 16 | 心跳服务 |
| bus | 17 | 消息路由 |
| memory | 9 | 长期记忆 |
| skills | 10 | Skill 加载 |
| subagent | 11 | 子任务 |

---

## 外部依赖

### NPM 包

```json
{
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.59.0",
    "@modelcontextprotocol/client": "^1.26.0",
    "zod": "^3.24.0",
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "chalk": "^5.4.0",
    "ora": "^8.0.0",
    "cron-parser": "^4.9.0"
  }
}
```

### Bun 内置

- `fetch` - HTTP 请求 (替代 httpx)
- `WebSocket` - WebSocket 连接 (替代 websockets)
- `Bun.serve` - HTTP 服务器
- `Bun.$` - Shell 命令执行
- `bun:sqlite` - SQLite 支持

---

## 文件结构

```
nanobot/
├── src/
│   ├── config/          # 配置加载
│   │   ├── loader.ts
│   │   └── schema.ts
│   ├── utils/           # 工具函数
│   │   └── helpers.ts
│   ├── providers/       # LLM 提供商
│   │   ├── base.ts
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── session/         # 会话管理
│   │   └── manager.ts
│   ├── agent/           # Agent 核心
│   │   ├── loop.ts
│   │   ├── context.ts
│   │   ├── memory.ts
│   │   ├── skills.ts
│   │   ├── subagent.ts
│   │   └── tools/
│   │       ├── base.ts
│   │       ├── registry.ts
│   │       ├── web.ts
│   │       ├── shell.ts
│   │       ├── filesystem.ts
│   │       ├── message.ts
│   │       └── spawn.ts
│   ├── mcp/             # MCP 客户端
│   │   ├── client.ts
│   │   └── tool_wrapper.ts
│   ├── channels/        # 消息通道
│   │   ├── base.ts
│   │   ├── manager.ts
│   │   └── feishu.ts
│   ├── cron/            # 定时任务
│   │   ├── service.ts
│   │   └── types.ts
│   ├── heartbeat/       # 心跳服务
│   │   └── service.ts
│   ├── bus/             # 消息总线
│   │   ├── events.ts
│   │   └── queue.ts
│   ├── cli/             # 命令行
│   │   └── commands.ts
│   └── index.ts         # 入口
├── docs/
│   └── lark-js/         # 飞书 SDK 文档
├── tests/               # 测试
├── package.json
└── tsconfig.json
```

---

## 开发建议

1. **先跑通 MVP**: 先实现前 6 个模块，验证 Agent 循环能跑通
2. **逐模块测试**: 每个模块完成后写简单测试验证
3. **参考原版**: 保持与 nanobot 相同的设计决策
4. **使用 Bun 内置**: 优先使用 Bun 原生能力，减少依赖

---

## 进度追踪

| 阶段 | 模块数 | 预计工时 |
|------|--------|----------|
| 第一阶段 | 2 | 0.5 天 |
| 第二阶段 | 2 | 1 天 |
| 第三阶段 3A | 2 | 1h |
| 第三阶段 3B | 1 | 1h |
| 第三阶段 3C | 1 | 2h |
| 第三阶段 3D | 1 | 2h |
| 第三阶段 3E | 1 | 1h |
| 第三阶段 3F | 1 | 1h |
| 第三阶段 3G | 1 | 1h |
| 第四阶段 | 5 | 2 天 |
| 第五阶段 | 1 | 0.5 天 |
| **总计** | **18** | **~9 天** |

### 第三阶段详细安排

| 子阶段 | 模块 | 验证方式 |
|--------|------|----------|
| 3A | tools/base + registry | 单元测试 |
| 3B | context | 单元测试 |
| 3C | loop | 集成测试（模拟 LLM） |
| 3D | tools/* | 每个工具单独测试 |
| 3E | memory | 单元测试 |
| 3F | skills | 加载测试 |
| 3G | subagent | 集成测试 |
