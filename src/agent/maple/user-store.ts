/**
 * 用户画像持久化存储
 * 
 * 将 UserProfile 存储为 JSON 文件：
 * ~/.nanobot/workspace/users/{safeUserId}.json
 * 
 * 文件名规则：userId 中的 `:` 替换为 `_`，再通过 safeFilename() 处理特殊字符
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type UserProfile, createDefaultProfile } from "./types.js";
import { type CleanerConfig, ProfileCleaner } from "./cleaner.js";
import { safeFilename } from "../../utils/helpers.js";
import { Logger } from "../../utils/logger.js";

const logger = new Logger({ module: "UserStore" });

export class UserStore {
  /** 用户画像文件存放目录：{workspace}/users/ */
  private readonly usersDir: string;

  /**
   * @param workspace 工作空间根路径（由外部传入，不在此处解析 ~）
   */
  constructor(workspace: string) {
    this.usersDir = join(workspace, "users");
    // 确保目录存在
    if (!existsSync(this.usersDir)) {
      mkdirSync(this.usersDir, { recursive: true });
    }
  }

  /**
   * 返回用户画像目录路径（调试用）
   */
  getUsersDir(): string {
    return this.usersDir;
  }

  /**
   * 将 userId 转换为安全的文件名（不含路径分隔符等特殊字符）
   * 例："feishu:ou_abc123" → "feishu_ou_abc123"
   */
  private toFilename(userId: string): string {
    return safeFilename(userId.replace(/:/g, "_")) + ".json";
  }

  private filePath(userId: string): string {
    return join(this.usersDir, this.toFilename(userId));
  }

  /**
   * 加载用户画像；如果文件不存在，返回默认画像（不写盘）
   */
  load(userId: string): UserProfile {
    const path = this.filePath(userId);
    if (!existsSync(path)) {
      logger.debug("[MAPLE] 用户 %s 无画像文件，返回默认画像", userId);
      return createDefaultProfile(userId);
    }
    try {
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as UserProfile;
      return parsed;
    } catch (e) {
      logger.warn("[MAPLE] 读取用户画像失败 %s: %s", userId, String(e));
      return createDefaultProfile(userId);
    }
  }

  /**
   * 保存用户画像到磁盘（会覆盖现有文件）
   */
  save(profile: UserProfile): void {
    const path = this.filePath(profile.userId);
    try {
      writeFileSync(path, JSON.stringify(profile, null, 2), "utf-8");
      logger.debug("[MAPLE] 用户画像已保存: %s", profile.userId);
    } catch (e) {
      logger.warn("[MAPLE] 保存用户画像失败 %s: %s", profile.userId, String(e));
    }
  }

  /**
   * 局部更新用户画像并写回磁盘
   * 使用浅合并（Object.assign），嵌套字段需在 patch 中包含完整子对象
   * 
   * @param userId 用户 ID
   * @param patch 要覆盖的字段（浅合并到顶层）
   * @returns 更新后的 UserProfile
   */
  update(userId: string, patch: Partial<UserProfile>): UserProfile {
    const existing = this.load(userId);
    const updated: UserProfile = {
      ...existing,
      ...patch,
      // updatedAt 强制更新，不允许外部覆盖为旧值
      updatedAt: new Date().toISOString(),
    };
    this.save(updated);
    return updated;
  }

  /**
   * 清理用户画像的洞察数据
   *
   * @param userId 用户 ID
   * @param config 清理配置（可选，默认值）
   * @returns 清理后的 UserProfile
   */
  clean(userId: string, config?: Partial<CleanerConfig>): UserProfile {
    const profile = this.load(userId);
    const cleaner = new ProfileCleaner(config);
    const cleaned = cleaner.clean(profile);

    // 如果有变化，保存到磁盘
    if (cleaned !== profile) {
      this.save(cleaned);
    }

    return cleaned;
  }
}
