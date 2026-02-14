import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

export function ensureDir(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
  return path
}

export function getDataPath(): string {
  return ensureDir(join(homedir(), '.nanobot'))
}

export function getWorkspacePath(workspace?: string): string {
  let path: string
  if (workspace) {
    path = workspace.startsWith('~/')
      ? join(homedir(), workspace.slice(2))
      : workspace
  } else {
    path = join(homedir(), '.nanobot', 'workspace')
  }
  return ensureDir(path)
}

export function getSessionsPath(): string {
  return ensureDir(join(getDataPath(), 'sessions'))
}

export function getMemoryPath(workspace?: string): string {
  return ensureDir(join(getWorkspacePath(workspace), 'memory'))
}

export function getSkillsPath(workspace?: string): string {
  return ensureDir(join(getWorkspacePath(workspace), 'skills'))
}

export function todayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function timestamp(): string {
  return new Date().toISOString()
}

export function truncateString(s: string, maxLen: number = 100, suffix: string = '...'): string {
  if (s.length <= maxLen) {
    return s
  }
  return s.slice(0, maxLen - suffix.length) + suffix
}

export function safeFilename(name: string): string {
  const unsafe = '<>:"/\\|?*'
  let result = name
  for (const char of unsafe) {
    result = result.replaceAll(char, '_')
  }
  return result.trim()
}

export function parseSessionKey(key: string): [string, string] {
  const parts = key.split(':')
  if (parts.length !== 2) {
    throw new Error(`Invalid session key: ${key}`)
  }
  return [parts[0], parts[1]]
}
