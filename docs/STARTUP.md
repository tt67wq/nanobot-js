# nanobot 启动指南

## 1. 初始化配置

首次使用时，需要先初始化配置和工作空间：

```bash
cd /Users/admin/Project/Javascript/nanobot

# 初始化 (会创建 ~/.nanobot/config.json)
bun run src/cli/commands.ts onboard
```

这会创建：
- `~/.nanobot/config.json` - 配置文件
- `~/.nanobot/AGENTS.md` - Agent 指令
- `~/.nanobot/SOUL.md` - 人格设定
- `~/.nanobot/USER.md` - 用户信息
- `~/.nanobot/memory/MEMORY.md` - 长期记忆

---

## 2. 配置 API Key

编辑 `~/.nanobot/config.json`，添加你的 API Key：

```json
{
  "providers": {
    "anthropic": {
      "api_key": "sk-ant-..."
    },
    "openai": {
      "api_key": "sk-..."
    }
  }
}
```

---

## 3. 启动方式

### 方式一：单次对话

```bash
bun run src/cli/commands.ts agent -m "你好"
```

### 方式二：交互模式

```bash
bun run src/cli/commands.ts agent
# 输入你的消息，按回车发送
# Ctrl+C 退出
```

### 方式三：启动网关服务

```bash
bun run src/cli/commands.ts gateway
# 会启动飞书、cron、heartbeat 等服务
```

---

## 4. 其他命令

```bash
# 查看状态
bun run src/cli/commands.ts status

# 定时任务管理
bun run src/cli/commands.ts cron list
bun run src/cli/commands.ts cron add -n "test" -m "Hello" --every 60

# 查看帮助
bun run src/cli/commands.ts --help
```

---

## 5. 环境变量 (可选)

如果使用 Brave Search：

```bash
export TAVILY_API_KEY="your-api-key"
```
