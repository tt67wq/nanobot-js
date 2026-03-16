#!/usr/bin/env bun
/**
 * 画像清理功能 E2E 验证
 * 
 * 运行方式：
 *   bun run scripts/verify-cleaner-e2e.ts
 * 
 * 验证内容：
 * 1. 创建包含 150 条洞察的用户画像
 * 2. 执行清理
 * 3. 验证结果：不超过 100 条
 */

import { UserStore } from "../src/agent/maple/user-store.js";
import { ProfileCleaner } from "../src/agent/maple/cleaner.js";
import { createDefaultProfile, generateInsightId, type Insight } from "../src/agent/maple/types.js";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// 测试用户 ID
const TEST_USER_ID = "e2e-test-user";

// 清理测试数据
function cleanup() {
  const workspace = "/tmp/nanobot-test-cleaner";
  const userStore = new UserStore(workspace);
  const filePath = userStore.filePath(TEST_USER_ID);
  if (existsSync(filePath)) {
    rmSync(filePath);
  }
  return workspace;
}

// 创建测试洞察
function createTestInsight(index: number, daysAgo: number = 0, confidence: number = 0.8): Insight {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);
  
  return {
    id: generateInsightId(),
    content: `测试洞察 ${index}：用户偏好代码示例 ${index}`,
    source: "llm",
    confidence,
    createdAt: createdAt.toISOString(),
    evidence: `这是第 ${index} 条测试洞察的证据`,
  };
}

async function main() {
  console.log("=== 画像清理功能 E2E 验证 ===\n");

  const workspace = cleanup();
  const userStore = new UserStore(workspace);

  // 1. 创建包含 150 条洞察的用户画像
  console.log("1. 创建测试用户画像（150 条洞察）...");
  
  const profile = createDefaultProfile(TEST_USER_ID);
  
  // 添加 50 条过期洞察（91天前）
  for (let i = 0; i < 50; i++) {
    profile.insights.push(createTestInsight(i, 91, 0.9));
  }
  
  // 添加 50 条低置信度洞察
  for (let i = 50; i < 100; i++) {
    profile.insights.push(createTestInsight(i, 0, 0.5));
  }
  
  // 添加 50 条正常洞察
  for (let i = 100; i < 150; i++) {
    profile.insights.push(createTestInsight(i, 0, 0.8));
  }
  
  userStore.save(profile);
  console.log(`   已保存 ${profile.insights.length} 条洞察\n`);

  // 2. 执行清理（使用默认配置）
  console.log("2. 执行清理（默认配置：maxInsights=100, maxAgeDays=90, minConfidence=0.6）...");
  
  const cleaner = new ProfileCleaner();
  const cleanedProfile = cleaner.clean(profile);
  
  userStore.save(cleanedProfile);
  console.log(`   清理后剩余 ${cleanedProfile.insights.length} 条洞察\n`);

  // 3. 验证结果
  console.log("3. 验证结果：");
  
  let passed = true;
  
  // 验证数量限制
  if (cleanedProfile.insights.length <= 100) {
    console.log("   ✓ 数量限制：符合预期 (<=100)");
  } else {
    console.log(`   ✗ 数量限制：超过 100 条 (${cleanedProfile.insights.length})`);
    passed = false;
  }
  
  // 验证过期清理
  const hasOld = cleanedProfile.insights.some(i => {
    const created = new Date(i.createdAt).getTime();
    const now = Date.now();
    const ageDays = (now - created) / (24 * 60 * 60 * 1000);
    return ageDays > 90;
  });
  
  if (!hasOld) {
    console.log("   ✓ 过期清理：无超过 90 天的洞察");
  } else {
    console.log("   ✗ 过期清理：仍存在超过 90 天的洞察");
    passed = false;
  }
  
  // 验证置信度过滤
  const hasLowConfidence = cleanedProfile.insights.some(i => i.confidence < 0.6);
  if (!hasLowConfidence) {
    console.log("   ✓ 置信度过滤：无低于 0.6 的洞察");
  } else {
    console.log("   ✗ 置信度过滤：仍存在低于 0.6 的洞察");
    passed = false;
  }

  // 清理测试数据
  cleanup();
  
  console.log("\n=== 验证 " + (passed ? "通过 ✓" : "失败 ✗") + " ===");
  process.exit(passed ? 0 : 1);
}

main().catch(console.error);
