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
| 🛠️ **内置工具** | Shell 命令、网页搜索、文件系统操作、进程管理、截图等 |
| 📱 **多通道支持** | 支持飞书 (Feishu) 集成 |
| 🖼️ **图片理解** | 支持 Vision 模型理解图片内容 (Claude/GPT) |
SW:| ⏰ **定时任务** | 内置 Cron 定时任务支持 |
KZ:| 💓 **心跳服务** | 定时主动唤醒执行任务 |
JR:

## 🏗️ 架构

<p align="center">
  <img src="nanobot_arch.jpeg" alt="nanobot architecture" width="800">
</p> 

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI / Gateway                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      Agent Loop                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │  Anthropic  │    │   OpenAI    │    │   Others... │    │
│  │   (Vision)  │    │   (Vision)  │    │   (Vision)  │    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
└─────────┼───────────────────┼───────────────────┼───────────┘
          │                   │                   │
┌─────────▼───────────────────▼───────────────────▼───────────┐
│                        Tools                                │
│  ┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐        │
│  │ Shell  │  │  Web   │  │FileSystem│  │ Spawn  │  ...   │
│  └────────┘  └────────┘  └──────────┘  └────────┘        │
└────────────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Feishu  │          │  Cron   │          │Heartbeat│
│Channel  │          │ Tasks   │          │ Service │
│(Vision) │          └─────────┘          └─────────┘
└─────────┘
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

## 📁 项目结构

```
## 📁 项目结构

```
nanobot/
```
nanobot/
├── src/
│   ├── agent/          # 🧠 核心 Agent 逻辑
│   │   ├── loop.ts     #    Agent 循环 (LLM ↔ 工具执行)
│   │   ├── context.ts  #    上下文构建，图片理解
│   │   ├── memory.ts   #    长期记忆
│   │   ├── skills.ts   #    Skills 加载器
│   │   ├── subagent.ts #    子任务执行
│   │   └── tools/      #    内置工具
│   ├── channels/       # 📱 通道集成 (飞书)
│   ├── bus/            # 🚌 消息路由
│   ├── cron/           # ⏰ 定时任务
│   ├── heartbeat/      # 💓 心跳服务
│   ├── providers/      # 🤖 LLM 提供商 (支持 Vision)
│   ├── session/        # 💬 会话管理
│   ├── config/         # ⚙️ 配置加载
│   ├── cli/            # 🖥️ 命令行
│   └── skills/         # 🎯 技能包
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
