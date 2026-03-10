<!--
  ============================================================
  nanobot README 图片生成提示词 (供你到其他平台生成图片)
  ============================================================
  
  1. Logo 图片 (nanobot_logo.png)
  --------------------------------
  提示词: 
  "Create a minimalist, modern logo for an AI assistant called 'nanobot'. 
   The design should feature a cute robot face or symbol, using a color palette 
   of cyan/blue gradients on dark background. Tech-oriented, clean, vector style.
   The text 'nanobot' should be in a modern sans-serif font. 
   Overall aesthetic: futuristic, friendly, simple."
  
  尺寸建议: 500x200px
  
  2. 架构图 (nanobot_arch.jpeg)
  --------------------------------
  提示词:
  "Create a technical architecture diagram for an AI agent system called 'nanobot'.
   Show the following components in a clean, modern style:
   - CLI/Gateway at the top
   - Agent Loop in the center (connecting to LLM Providers: Anthropic, OpenAI)
   - Tools layer below (Shell, Web, Filesystem, Spawn, Message)
   - Channels on the right (Feishu)
   - Supporting services: Cron, Heartbeat, Session, Bus
   Use a dark theme with cyan/blue accent colors. 
   Flowing arrows showing data movement between components.
   Clean, professional technical illustration style."

  尺寸建议: 800x600px
-->

<div align="center">
  <img src="nanobot_logo.png" alt="nanobot" width="500">
  
  <h1>nanobot</h1>
  <p>Ultra-lightweight Personal AI Assistant (Bun/TypeScript Version)</p>
  
  <p>
    <a href="https://github.com/HKUDS/nanobot">
      <img src="https://img.shields.io/badge/GitHub-nanobot-blue?style=flat&logo=github" alt="GitHub">
    </a>
    <img src="https://img.shields.io/badge/Bun-≥1.0-blue?style=flat&logo=bun" alt="Bun">
    <img src="https://img.shields.io/badge/TypeScript-≥5.0-blue?style=flat&logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  </p>
</div>

> **nanobot** 是一个超轻量级的个人 AI 助手，使用 **Bun + TypeScript** 重写，拥有极小的代码体积和闪电般的启动速度。

## ✨ 特性

| 特性 | 说明 |
|------|------|
| 🪶 **超轻量** | 使用 Bun 运行，代码简洁，启动速度极快 |
| 🔧 **易于扩展** | 基于 TypeScript，代码清晰易读，方便二次开发 |
| ⚡ **闪电般的速度** | Bun 运行时带来原生级别的性能 |
| 🤖 **多 LLM 支持** | Anthropic (Claude) / OpenAI (GPT) / 通义千问等 |
| 🖼️ **图片理解** | 支持 Vision 模型理解图片内容 (Claude/GPT) |
| 🧠 **三层记忆系统** | 会话记忆 + 结构化记忆 + 向量语义检索 |
| 🎯 **MAPLE 个性化** | 自动学习用户偏好，注入个性化上下文 |
| 🛠️ **内置工具** | Shell 命令、网页搜索、文件系统操作、进程管理、截图等 |
| 📱 **多通道支持** | 支持飞书 (Feishu) 集成 |
| 📝 **日志文件输出** | 支持文件写入，自动体积轮转 |
| ⏰ **定时任务** | 内置 Cron 定时任务支持 |
| 💓 **心跳服务** | 定时主动唤醒执行任务 |
JR:

## 🏗️ 架构

<p align="center">
  <img src="nanobot_arch.jpeg" alt="nanobot architecture" width="800">
</p> 

### 核心组件

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            CLI / Gateway                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐  │
│  │  agent 命令     │  │  gateway 命令   │  │  cron / maple / status    │  │
│  └───────┬────────┘  └───────┬────────┘  └────────────────────────────┘  │
└──────────┼───────────────────┼────────────────────────────────────────────┘
           │                   │
           ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          AgentLoop (核心循环)                              │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  Providers  │  │  ContextBuilder │  │      ToolRegistry            │  │
│  │ ┌─────────┐ │  │ ┌─────────────┐ │  │ ┌──────┐ ┌──────┐ ┌───────┐ │  │
│  │ │Anthropic│ │  │ │MemorySearch │ │  │ │Shell │ │ Web  │ │  FS   │ │  │
│  │ │ (Vision)│ │  │ │ (向量检索)   │ │  │ └──────┘ └──────┘ └───────┘ │  │
│  │ └─────────┘ │  │ └─────────────┘ │  │ ┌──────┐ ┌──────┐ ┌───────┐ │  │
│  │ ┌─────────┐ │  │ ┌─────────────┐ │  │ │Spawn │ │Screen│ │Message│ │  │
│  │ │ OpenAI  │ │  │ │   Skills    │ │  │ └──────┘ └──────┘ └───────┘ │  │
│  │ │ (Vision)│ │  │ │  (技能包)    │ │  └──────────────────────────────┘  │
│  │ └─────────┘ │  │ └─────────────┘ │                                     │
│  └─────────────┘  └─────────────────┘                                     │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          MAPLE 个性化系统                                   │
│  ┌───────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │    Learning Agent     │  │       Personalization Agent             │  │
│  │  (会话后分析学习用户)  │  │  (从记忆中提取用户画像注入 system prompt) │  │
│  └───────────────────────┘  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          支撑服务层                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │MessageBus│  │  Cron    │  │Heartbeat │  │ Session  │  │  Logger  │   │
│  │ (消息队列)│  │(定时任务) │  │(心跳服务) │  │(会话管理) │  │(日志文件) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          通道集成 (Channels)                                │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │  FeishuChannel  │  │   CLI Channel   │                                  │
│  │  (飞书 WebSocket)│  │   (命令行交互)   │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 组件说明

| 组件 | 文件 | 职责 |
|------|------|------|
| **AgentLoop** | `src/agent/loop.ts` | 核心循环：接收消息 → 调用 LLM → 执行工具 → 返回响应 |
| **ContextBuilder** | `src/agent/context.ts` | 构建对话上下文，整合记忆、技能、图片理解 |
| **ToolRegistry** | `src/tools/registry.ts` | 工具注册与执行调度 |
| **Providers** | `src/providers/*.ts` | LLM API 封装，支持 Vision（图片理解） |
| **MAPLE** | `src/agent/maple/` | 个性化系统：Learning（学习用户偏好）+ Personalization（注入画像） |
| **MemorySearch** | `src/agent/memory/` | 三层记忆系统 + 向量语义检索 |
| **MessageBus** | `src/bus/queue.ts` | 消息队列，解耦通道与 Agent |
| **SessionManager** | `src/session/manager.ts` | 会话持久化（JSONL 格式） |
| **CronService** | `src/cron/service.ts` | 定时任务调度 |
| **HeartbeatService** | `src/heartbeat/service.ts` | 定时主动唤醒执行任务 |
| **Logger** | `src/utils/logger.ts` | 统一日志，支持文件输出与体积轮转 |
| **FeishuChannel** | `src/channels/feishu.ts` | 飞书 WebSocket 消息收发，图片下载 |

### 数据流

```
用户消息 ──▶ Channel ──▶ MessageBus ──▶ AgentLoop
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              ContextBuilder              Provider                   Tools
              (记忆/技能/图片)             (LLM API)                (执行命令)
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              ▼
                                         响应消息
                                              │
                                              ▼
                           MessageBus ──▶ Channel ──▶ 用户
```

## 📦 安装

### 前置要求

- [Bun](https://bun.sh/) ≥ 1.0

```bash
# 安装 Bun (如果没有)
curl -fsSL https://bun.sh/install | bash
```

### 克隆项目

```bash
git clone https://github.com/HKUDS/nanobot.git
cd nanobot
bun install
```

### 编译为二进制 (可选)

```bash
# 本平台编译
make build-binary

# 跨平台编译
make build-linux-x64    # Linux x64
make build-linux-arm64  # Linux ARM64
make build-windows-x64  # Windows x64
make build-darwin-x64   # macOS x64
make build-darwin-arm64 # macOS ARM64

# 编译所有平台
make build-all
```

编译产物在 `bin/` 目录下。

## 🚀 快速开始

### 1. 初始化

```bash
# 使用 bun 运行
bun run src/cli/commands.ts onboard

# 或使用编译后的二进制
./bin/nanobot onboard
```

这会创建：
- `~/.nanobot/config.json` - 配置文件
- `~/.nanobot/AGENTS.md` - Agent 指令
- `~/.nanobot/SOUL.md` - 人格设定
- `~/.nanobot/USER.md` - 用户信息
- `~/.nanobot/memory/MEMORY.md` - 长期记忆

### 2. 配置 API Key

编辑 `~/.nanobot/config.json`：

<details>
<summary><b>Anthropic (Claude)</b></summary>

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-xxx"
    }
  },
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-20250514"
    }
  }
}
```

获取 API Key: [Anthropic Console](https://console.anthropic.com/settings/keys)

</details>

<details>
<summary><b>OpenAI (GPT-4)</b></summary>

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-proj-xxx"
    }
  },
  "agents": {
    "defaults": {
      "model": "gpt-4o"
    }
  }
}
```

获取 API Key: [OpenAI Platform](https://platform.openai.com/api-keys)

</details>

### 3. 开始对话

```bash
# 单次对话
bun run src/cli/commands.ts agent -m "你好"

# 交互模式
bun run src/cli/commands.ts agent

# 或使用二进制
./bin/nanobot agent -m "你好"
```

## 💬 使用 Makefile

```bash
# 开发
make install      # 安装依赖
make build        # 构建 TypeScript
make test         # 运行测试

# 运行
make agent        # 交互模式
make run MSG='Hello'  # 单次对话
make gateway      # 启动网关服务

# 定时任务
make cron-list              # 查看任务
make cron-add NAME='daily' MSG='Good morning' EVERY=3600  # 添加任务

# 编译二进制
make build-binary           # 本平台
make build-all             # 所有平台
```

完整命令请运行 `make help`。

## 💬 飞书集成

### 1. 创建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建新应用
3. 获取 `app_id` 和 `app_secret`
4. 订阅 `im.message.receive_v1` 事件
5. 启用 WebSocket 连接

### 2. 配置

编辑 `~/.nanobot/config.json`：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "YOUR_APP_ID",
      "app_secret": "YOUR_APP_SECRET",
      "allowFrom": []
    }
  }
}
```

### 3. 运行

```bash
bun run src/cli/commands.ts gateway
# 或
./bin/nanobot gateway
```

## 🖼️ 图片理解

飞书通道支持发送图片进行理解：

1. 在飞书中直接发送图片消息
2. nanobot 会自动下载图片并转换为 base64
3. 将图片发送给 Vision 模型进行分析
4. 返回图片内容的理解结果

**支持的模型：**
- Anthropic: Claude (所有 vision 模型)
- OpenAI: GPT-4o, GPT-4o-mini

## ⚙️ 配置说明

配置文件: `~/.nanobot/config.json`

### 完整配置示例

```json
{
  "agents": {
    "defaults": {
      "model": "gpt-4o",
      "max_tool_iterations": 100
    }
  },
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-xxx",
      "apiBase": "https://api.anthropic.com"
    },
    "openai": {
      "apiKey": "sk-proj-xxx",
      "apiBase": "https://api.openai.com/v1"
    }
  },
  "channels": {
    "feishu": {
      "enabled": true,
      "app_id": "YOUR_APP_ID",
      "app_secret": "YOUR_APP_SECRET",
      "allowFrom": []
    }
  }
}
```

## 🧩 内置工具

| 工具 | 说明 |
|------|------|
| `shell` | 执行 Shell 命令 |
| `web` | 网页搜索 (需要 Tavily API) |
| `filesystem` | 文件系统操作 (读/写/删除/编辑) |
| `spawn` | 启动子进程 |
| `message` | 发送消息到通道 |
| `screenshot` | 屏幕截图 |

## 🧠 记忆系统

nanobot 采用**三层架构**的记忆系统，支持从对话中自动提取、分类、检索和衰减管理长期记忆。

### 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                       记忆系统三层架构                            │
├─────────────────────────────────────────────────────────────────┤
│  第一层：会话记忆 (SessionManager)                                │
│  ├─ 位置：~/.nanobot/sessions/*.jsonl                           │
│  ├─ 格式：JSONL (第一行 metadata 头 + 后续消息行)                  │
│  └─ 作用：短期对话历史存储                                         │
├─────────────────────────────────────────────────────────────────┤
│  第二层：结构化记忆 (MemoryStore)                                 │
│  ├─ 位置：~/.nanobot/workspace/memory/structured/               │
│  ├─ 格式：JSON + JSONL 混合                                       │
│  │   ├─ identity.json    (身份信息)                              │
│  │   ├─ preferences.json  (偏好信息)                             │
│  │   ├─ habits.json      (习惯信息)                              │
│  │   └─ events.jsonl     (事件信息)                              │
│  └─ 作用：长期记忆分类存储                                         │
├─────────────────────────────────────────────────────────────────┤
│  第三层：向量检索 (VectorStore)                                   │
│  ├─ 位置：~/.nanobot/workspace/memory/sqlite-vectors.db         │
│  ├─ 格式：bun:sqlite + 内存向量缓存                               │
│  └─ 作用：语义检索 + 自动衰减清理                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 四种记忆类型

| 类型 | 说明 | 示例输入 | 提取结果 |
|------|------|----------|----------|
| `identity` | 身份信息 - 用户是谁 | "我叫张三" | "用户名字是 张三" |
| `preference` | 偏好信息 - 用户喜欢什么 | "我喜欢编程" | "用户喜欢: 编程" |
| `habit` | 习惯信息 - 用户经常做什么 | "我经常早上跑步" | "用户习惯: 早上跑步" |
| `event` | 事件信息 - 需要记住的事项 | "提醒我明天开会" | "提醒事项: 明天开会" |

### 记忆提取机制

采用**规则引擎**从用户消息中自动提取记忆，无需 LLM 参与：

```typescript
// 预定义正则规则 (src/agent/memory/rules.ts)
const MEMORY_PATTERNS = {
  identity: [
    { regex: /我叫(\w+)/, extract: m => `用户名字是 ${m[1]}`, confidence: 0.95 },
    { regex: /我的名字[叫|是]?(\w+)/, confidence: 0.95 }
  ],
  preference: [
    { regex: /我(?:喜欢|爱|偏好)(.+?)(?:\。|$)/, confidence: 0.9 },
    { regex: /(?:不|别)喜欢(.+?)(?:\。|$)/, confidence: 0.9 }
  ],
  habit: [
    { regex: /我(?:经常|通常|平时)(.+?)(?:\。|$)/, confidence: 0.8 }
  ],
  event: [
    { regex: /记得(.+?)(?:\。|$)/, confidence: 0.95 },
    { regex: /提醒我(.+?)(?:\。|$)/, confidence: 0.95 }
  ]
}
```

**优点**：
- 不依赖 LLM，成本低、速度快
- 置信度可预测、可控
- 规则可扩展、可调试

### 向量检索系统

使用 `bun:sqlite` 存储向量，支持语义检索：

```typescript
// 关键设计点：
// 1. bun:sqlite 替代 LanceDB，避免 Bun 兼容性问题
// 2. 向量预热到内存缓存，避免每次查询都从磁盘读取
// 3. SQLite WAL 模式提升并发性能
// 4. 余弦相似度计算在内存中进行

const memories = await vectorStore.search("用户喜欢什么", 5);
// 返回语义最相关的 5 条记忆
```

### 记忆衰减机制

自动清理低价值记忆，防止无限增长：

```typescript
// 衰减规则 (src/agent/memory/decay.ts)
shouldDecay(item: MemoryItem): boolean {
  // 规则 1：低重要性 + 长时间未访问
  if (item.importance < 0.3 && daysSinceAccess > 30) return true;
  
  // 规则 2：从未访问 + 创建时间久远
  if (item.access_count === 0 && daysSinceCreated > 90) return true;
  
  // 规则 3：极低置信度
  if (item.confidence < 0.3 && daysSinceCreated > 7) return true;
  
  return false;
}
```

**触发条件**：向量存储达到上限 2000 条时自动清理，每次最多清理 100 条。

### 数据持久化策略

| 层级 | 存储格式 | 特点 |
|------|---------|------|
| 会话层 | JSONL | 无索引，顺序读写，适合追加写入 |
| 结构化记忆 | JSON + JSONL | JSON 适合小文件随机读写，JSONL 适合追加 |
| 向量检索 | SQLite | 支持索引、事务、WAL 模式 |

### 目录结构

```
~/.nanobot/
├── config.json                          # 全局配置
├── sessions/                            # 会话记忆
│   ├── channel_chat-123.jsonl          # 每个会话一个文件
│   └── ...
└── workspace/
    └── memory/
        ├── structured/                  # 结构化记忆
        │   ├── identity.json           # 身份信息
        │   ├── preferences.json        # 偏好信息
        │   ├── habits.json             # 习惯信息
        │   └── events.jsonl            # 事件信息
        └── sqlite-vectors.db           # 向量检索数据库
```

## 🎯 MAPLE 个性化系统

**MAPLE** (Memory-Augmented Personalized LLM Engine) 是一个自动学习用户偏好并注入个性化上下文的系统。

### 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     MAPLE 个性化系统架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   会话结束                                                        │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ Learning Agent  │  ─── 分析对话 ───▶  提取用户特征             │
│  │  (异步 LLM)     │                                            │
│  └─────────────────┘                                            │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │   UserStore     │  ─── 存储用户画像 ───▶  ~/.nanobot/users/   │
│  └─────────────────┘                                            │
│      │                                                          │
│      ▼ (下次对话时)                                              │
│  ┌───────────────────────┐                                      │
│  │ Personalization Agent │  ─── 从记忆提取画像 ───▶ 注入 system   │
│  └───────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 配置

```json
{
  "maple": {
    "enabled": true,
    "learning": {
      "enabled": true,
      "use_llm": true,          // 使用 LLM 深度分析
      "min_messages": 3         // 至少 3 条消息才触发学习
    },
    "personalization": {
      "enabled": true,
      "max_tokens": 300         // 画像最大 token 数
    }
  }
}
```

### 命令

```bash
# 查看用户画像
bun run src/cli/commands.ts maple profile

# 清除用户画像
bun run src/cli/commands.ts maple clear
```

## 📝 日志系统

nanobot 支持统一的日志输出，可配置输出到 console、文件或两者。

### 配置

```json
{
  "logger": {
    "level": "debug",           // debug / info / warn / error
    "format": "pretty",         // pretty / json
    "output": "both",           // console / file / both
    "max_file_size": 10485760,  // 10 MB (字节)
    "max_files": 5              // 保留 5 份（含当前）
  }
}
```

### 日志文件

- 位置：`~/.nanobot/logs/nanobot.log`
- 格式：纯文本（ANSI 颜色码已剥离）
- 轮转：单文件超过 10 MB 时自动轮转，保留最近 5 份

```
~/.nanobot/logs/
├── nanobot.log      # 当前日志
├── nanobot.1.log    # 历史 1
├── nanobot.2.log    # 历史 2
├── nanobot.3.log    # 历史 3
└── nanobot.4.log    # 历史 4
```

## 📁 项目结构

```
nanobot/
├── src/
│   ├── agent/              # 🧠 核心 Agent 逻辑
│   │   ├── loop.ts         #    Agent 循环 (LLM ↔ 工具执行)
│   │   ├── context.ts      #    上下文构建，图片理解
│   │   ├── memory/         #    三层记忆系统
│   │   ├── maple/          #    MAPLE 个性化系统
│   │   ├── skills.ts       #    Skills 加载器
│   │   └── subagent.ts     #    子任务执行
│   ├── tools/              # 🛠️ 内置工具
│   │   ├── shell.ts        #    Shell 命令执行
│   │   ├── web.ts          #    网页搜索
│   │   ├── filesystem.ts   #    文件系统操作
│   │   ├── spawn.ts        #    进程管理
│   │   ├── screenshot.ts   #    屏幕截图
│   │   └── message.ts      #    消息发送
│   ├── providers/          # 🤖 LLM 提供商
│   │   ├── anthropic.ts    #    Claude (含 Vision)
│   │   └── openai.ts       #    GPT/通义 (含 Vision)
│   ├── channels/           # 📱 通道集成
│   │   └── feishu.ts       #    飞书 WebSocket
│   ├── bus/                # 🚌 消息路由
│   ├── session/            # 💬 会话管理
│   ├── config/             # ⚙️ 配置加载 (Zod)
│   ├── cron/               # ⏰ 定时任务
│   ├── heartbeat/          # 💓 心跳服务
│   ├── cli/                # 🖥️ 命令行入口
│   ├── skills/             # 🎯 技能包
│   └── utils/              # 🔧 工具函数
│       └── logger.ts       #    统一日志
├── tests/                  # 🧪 测试
├── bin/                    # 📦 编译产物
├── Makefile                # 🔨 构建脚本
├── VERSION                 # 📌 版本号
└── package.json
├── bin/                 # 编译后的二进制
├── Makefile            # 构建脚本
├── VERSION             # 版本号
└── package.json
```

## 🤝 贡献

欢迎提交 PR！代码简洁易读，非常适合学习和二次开发。

## 📄 许可证

MIT License

---

<p align="center">
  <em>感谢使用 nanobot! ✨</em>
</p>
