# src/providers

## OVERVIEW

LLM 提供商集成模块，支持 Anthropic (Claude) 和 OpenAI (GPT)。

## STRUCTURE

```
src/providers/
├── index.ts       # createProvider 工厂函数
├── base.ts       # Tool, LLMProvider 基类
├── anthropic.ts  # AnthropicProvider
└── openai.ts     # OpenAIProvider
```

## WHERE TO LOOK

| 任务 | 文件 | 说明 |
|------|------|------|
| Provider 基类 | `base.ts` | Tool, LLMProvider 抽象类 |
| Claude 集成 | `anthropic.ts` | AnthropicProvider |
| GPT 集成 | `openai.ts` | OpenAIProvider |
| 工厂函数 | `index.ts` | createProvider() |

## KEY CLASSES

- `Tool`: 工具基类 (抽象)
- `LLMProvider`: LLM 提供商基类 (抽象)
- `AnthropicProvider`: Claude API 实现
- `OpenAIProvider`: OpenAI API 实现

## CONVENTIONS

- **禁止直接导入**: 使用 `createProvider(config)` 工厂函数
- 消息格式统一为 `Message` 接口
- 工具调用格式统一为 `ToolCallRequest`

## FACTORY

```typescript
// src/providers/index.ts
export function createProvider(config: Config): LLMProvider {
  // 自动检测并创建合适的 provider
}
```

## ANTI-PATTERNS

- **禁止**: 直接 `import { AnthropicProvider } from "./anthropic"`
- **必须**: `import { createProvider } from "./providers"`

## NOTES

- Anthropic 支持 tool_use 块
- OpenAI 支持 function calling
- API 密钥从 config 读取
