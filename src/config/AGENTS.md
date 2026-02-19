# src/config

## OVERVIEW

配置加载和验证模块，使用 Zod 进行运行时验证。

## STRUCTURE

```
src/config/
├── index.ts       # 导出
├── schema.ts      # Zod schema 定义
└── loader.ts      # 配置加载/保存函数
```

## WHERE TO LOOK

| 任务 | 文件 | 说明 |
|------|------|------|
| Schema 定义 | `schema.ts` | Zod 验证规则 |
| 加载器 | `loader.ts` | loadConfig, saveConfig |

## KEY TYPES

- `ConfigType`: 主配置类型
- `FeishuConfig`: 飞书配置
- `ProviderConfig`: LLM 提供商配置
- `AgentDefaults`: Agent 默认配置

## CONVENTIONS

- 配置位置: `~/.nanobot/config.json`
- 使用 Zod 进行运行时验证
- 自动转换 camelCase ↔ snake_case

## FUNCTIONS

```typescript
loadConfig(configPath?: string): Config
saveConfig(config: Config, configPath?: string): void
getConfigPath(): string
getDataDir(): string
```

## NOTES

- 配置自动创建默认模板
- 命名转换: camelToSnake, snakeToCamel
