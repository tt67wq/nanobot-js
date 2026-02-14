# Utils 模块

工具函数集合。

## 使用

```typescript
import { 
  getDataPath, getWorkspacePath, getSessionsPath,
  getMemoryPath, getSkillsPath,
  todayDate, timestamp,
  truncateString, safeFilename,
  parseSessionKey
} from "./index.ts"

// 路径
getDataPath()      // ~/.nanobot
getWorkspacePath()  // ~/.nanobot/workspace
getSessionsPath()   // ~/.nanobot/sessions
getMemoryPath()    // ~/.nanobot/workspace/memory
getSkillsPath()    // ~/.nanobot/workspace/skills

// 日期时间
todayDate()    // "2026-02-14"
timestamp()    // "2026-02-14T03:57:26.476Z"

// 字符串
truncateString("Hello World!", 5)  // "Hello..."
safeFilename("test<file>?name")    // "test_file_name"

// 解析
parseSessionKey("feishu:123456")   // ["feishu", "123456"]
```
