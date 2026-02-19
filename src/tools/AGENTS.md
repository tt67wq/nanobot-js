# src/tools

## OVERVIEW

内置工具集，提供 Shell 执行、网页搜索、文件系统操作、进程管理等能力。

## STRUCTURE

```
src/tools/
├── index.ts         # 导出 (Tool, ToolDefinition)
├── registry.ts      # ToolRegistry: 工具注册管理
├── shell.ts         # ExecTool: Shell 命令执行
├── web.ts           # WebSearchTool, WebFetchTool
├── filesystem.ts    # ReadFileTool, WriteFileTool, EditFileTool, ListDirTool
├── spawn.ts         # SpawnTool: 子进程启动
└── message.ts       # MessageTool: 消息发送
```

## WHERE TO LOOK

| 任务 | 文件 | 工具类 |
|------|------|--------|
| Shell 执行 | `shell.ts` | `ExecTool` |
| 网页搜索 | `web.ts` | `WebSearchTool` |
| 网页抓取 | `web.ts` | `WebFetchTool` |
| 读文件 | `filesystem.ts` | `ReadFileTool` |
| 写文件 | `filesystem.ts` | `WriteFileTool` |
| 编辑文件 | `filesystem.ts` | `EditFileTool` |
| 列表目录 | `filesystem.ts` | `ListDirTool` |
| 启动子进程 | `spawn.ts` | `SpawnTool` |
| 发送消息 | `message.ts` | `MessageTool` |

## CONVENTIONS

- 所有工具继承 `Tool` 基类 (定义在 `providers/base.ts`)
- 工具注册通过 `ToolRegistry`
- 工具定义需要: name, description, parameters (Zod schema)

## BASE CLASS

```typescript
// src/providers/base.ts
export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodType;
  abstract execute(input: unknown): Promise<unknown>;
}
```

## NOTES

- 工具参数使用 Zod 进行运行时验证
- ToolDefinition = Pick<Tool, "name" | "description" | "parameters">
