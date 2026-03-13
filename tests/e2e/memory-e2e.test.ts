/**
 * 记忆系统 E2E 测试
 *
 * 运行方式：
 *   bun test tests/e2e/memory-e2e.test.ts
 *
 * 前置条件：
 *   - 需要配置 ~/.nanobot/config.json 中的 API key
 *   - 需要网络连接（调用 LLM API 和 embedding API）
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// 生成唯一的测试目录
function createTmpWorkspace(): string {
  const testId = `nanobot-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpWorkspace = join(tmpdir(), testId);
  mkdirSync(tmpWorkspace, { recursive: true });
  // 创建 memory 子目录
  mkdirSync(join(tmpWorkspace, 'memory', 'structured'), { recursive: true });
  return tmpWorkspace;
}

// 使用 spawnSync 运行 CLI
function runCliSync(message: string, tmpWorkspace: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync(
    'bun',
    ['run', 'src/cli/commands.ts', 'agent', '-m', message],
    {
      cwd: '/Users/admin/Project/Javascript/nanobot',
      env: {
        ...process.env,
        NANOBOT_WORKSPACE: tmpWorkspace,
        NANOBOT_DISABLE_LEARNING: '1',
      },
      timeout: 120000, // 120 秒超时
    }
  );

  return {
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
    exitCode: result.status ?? -1,
  };
}

// 获取 structured 目录下的所有文件
function listMemoryFiles(tmpWorkspace: string): string[] {
  const structuredDir = join(tmpWorkspace, 'memory', 'structured');
  if (!existsSync(structuredDir)) return [];
  return readdirSync(structuredDir).filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
}

describe('Memory E2E', () => {
  let tmpWorkspace: string;

  beforeEach(() => {
    tmpWorkspace = createTmpWorkspace();
    console.log(`[测试] 使用临时 workspace: ${tmpWorkspace}`);
  });

  afterEach(() => {
    // 清理临时目录
    if (tmpWorkspace && existsSync(tmpWorkspace)) {
      rmSync(tmpWorkspace, { recursive: true, force: true });
      console.log(`[测试] 已清理: ${tmpWorkspace}`);
    }
  });

  it('应该提取 identity 记忆："我叫小明"', () => {
    const { stdout, stderr, exitCode } = runCliSync('我叫小明', tmpWorkspace);

    const output = `${stdout}\n${stderr}`;
    console.log('[输出片段]', output.slice(0, 1000));

    // 验证：CLI 运行成功
    expect(exitCode).toBe(0);

    // 验证：日志中包含记忆提取
    const hasMemoryExtract = output.includes('[记忆] 提取到');
    console.log(`[验证] 记忆提取: ${hasMemoryExtract}`);

    // 验证：检查文件
    const files = listMemoryFiles(tmpWorkspace);
    console.log(`[验证] 文件列表: ${files.join(', ')}`);
    
    expect(hasMemoryExtract || files.length > 0).toBe(true);
  }, 150000); // 150 秒超时

  it('应该提取 preference 记忆："我喜欢用 TypeScript"', () => {
    const { stdout, stderr, exitCode } = runCliSync('我喜欢用 TypeScript 开发', tmpWorkspace);

    const output = `${stdout}\n${stderr}`;
    console.log('[输出片段]', output.slice(0, 1000));

    expect(exitCode).toBe(0);

    const hasMemoryExtract = output.includes('[记忆] 提取到');
    expect(hasMemoryExtract).toBe(true);
  }, 150000);

  it('应该提取 event 记忆："记得明天要开会"', () => {
    const { stdout, stderr, exitCode } = runCliSync('记得明天要开会', tmpWorkspace);

    const output = `${stdout}\n${stderr}`;
    console.log('[输出片段]', output.slice(0, 1000));

    expect(exitCode).toBe(0);

    const hasMemoryExtract = output.includes('[记忆] 提取到');
    expect(hasMemoryExtract).toBe(true);
  }, 150000);

  it('正常处理一般消息："今天天气不错"', () => {
    const { stdout, stderr, exitCode } = runCliSync('今天天气不错', tmpWorkspace);

    const output = `${stdout}\n${stderr}`;
    console.log('[输出片段]', output.slice(0, 500));

    // 验证：CLI 运行成功
    expect(exitCode).toBe(0);
  }, 150000);
});
