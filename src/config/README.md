# Config 模块

配置管理，基于 Zod。

## 使用

```typescript
import { loadConfig, saveConfig, Config } from "./index.ts"

const config = loadConfig()
console.log(config.agents.defaults.model)
console.log(config.workspacePath)
console.log(config.getApiKey())

config.agents.defaults.model = "claude-sonnet-4-20250514"
saveConfig(config)
```

## 结构

```
Config
├── agents.defaults
│   ├── workspace
│   ├── model
│   ├── max_tokens
│   ├── temperature
│   └── max_tool_iterations
├── channels.feishu
│   ├── enabled
│   ├── app_id
│   ├── app_secret
│   └── allow_from
├── providers
│   ├── anthropic
│   │   ├── api_key
│   │   └── api_base
│   └── openai
│       ├── api_key
│       └── api_base
├── gateway
│   ├── host
│   └── port
├── tools.web.search
│   ├── api_key
│   └── max_results
└── mcp
    ├── enabled
    ├── servers[]
    └── default_server
```
