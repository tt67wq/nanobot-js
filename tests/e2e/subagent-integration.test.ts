/**
 * Subagent e2e 集成测试
 * 
 * 运行方式：
 *   bun test tests/e2e/subagent-integration.test.ts
 * 
 * 前置条件：
 *   - 需要配置 ~/.nanobot/config.json 中的 API key
 *   - 需要网络连接（调用 LLM API）
 * 
 * 测试覆盖：
 *   1. Subagent spawn 基本流程
 *   2. 结果通知正确路由（gateway vs feishu）
 *   3. 错误处理
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { SubagentManager, type SubagentManagerOptions } from '../../src/agent/subagent';
import { MessageBus } from '../../src/bus/queue';
import { createProvider } from '../../src/providers';
import { loadConfig } from '../../src/config/loader';

describe('Subagent Integration', () => {
  let bus: MessageBus;
  let manager: SubagentManager;
  let provider: ReturnType<typeof createProvider>;

  beforeAll(() => {
    const config = loadConfig();
    provider = createProvider(config);
    
    if (!provider) {
      console.warn('Skipping e2e tests: No provider configured');
      return;
    }

    bus = new MessageBus();
    manager = new SubagentManager({
      provider,
      workspace: config.workspacePath,
      bus,
      model: config.agents.defaults.model,
      braveApiKey: config.tools?.web?.search?.api_key,
    });
  });

  afterAll(async () => {
    // 等待所有异步操作完成
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  it('should spawn subagent and complete a simple task', async () => {
    if (!provider) {
      console.warn('Skipping: No provider configured');
      return;
    }

    // 简单任务：让 subagent 回答一个问题
    const result = await manager.spawn(
      'Tell me what 2+2 equals. Just answer the number.',
      { 
        label: '简单数学测试',
        originChannel: 'gateway',
        originChatId: 'test-session',
      }
    );

    expect(result).toContain('started');
    expect(result).toContain('简单数学测试');

    // 等待 subagent 完成（最多 30 秒）
    const startTime = Date.now();
    let inboundMsg = null;
    
    while (Date.now() - startTime < 30000) {
      if (bus.inboundSize > 0) {
        inboundMsg = await bus.consumeInbound();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    expect(inboundMsg).not.toBeNull();
    expect(inboundMsg.senderId).toBe('subagent');
    expect(inboundMsg.chatId).toBe('gateway:test-session');
    expect(inboundMsg.content).toContain('简单数学测试');
  }, 35000);

  it('should route feishu origin correctly', async () => {
    if (!provider) {
      console.warn('Skipping: No provider configured');
      return;
    }

    await manager.spawn(
      'Say hello',
      {
        label: '飞书路由测试',
        originChannel: 'feishu',
        originChatId: 'ou_test123',
      }
    );

    // 等待完成
    const startTime = Date.now();
    let inboundMsg = null;
    
    while (Date.now() - startTime < 30000) {
      if (bus.inboundSize > 0) {
        inboundMsg = await bus.consumeInbound();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    expect(inboundMsg).not.toBeNull();
    expect(inboundMsg.chatId).toBe('feishu:ou_test123');
  }, 35000);

  it('should handle task with tool usage', async () => {
    if (!provider) {
      console.warn('Skipping: No provider configured');
      return;
    }

    // 需要 tool 使用的任务
    await manager.spawn(
      'Read the file /tmp/test-subagent.txt and tell me its contents. If it does not exist, say "file not found".',
      {
        label: '工具调用测试',
        originChannel: 'gateway',
        originChatId: 'tool-test',
      }
    );

    // 等待完成（可能需要更长时间）
    const startTime = Date.now();
    let inboundMsg = null;
    
    while (Date.now() - startTime < 60000) {
      if (bus.inboundSize > 0) {
        inboundMsg = await bus.consumeInbound();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    expect(inboundMsg).not.toBeNull();
    expect(inboundMsg.senderId).toBe('subagent');
  }, 65000);
});

/**
 * 手动测试脚本
 * 
 * 如果想手动测试 subagent 功能，运行：
 * 
 *   bun run src/cli/commands.ts agent -m "使用 subagent 帮我查询一下当前目录下有哪些文件"
 * 
 * 或者在交互模式中发送类似消息触发 subagent。
 */
