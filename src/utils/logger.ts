/**
 * Unified Logger for nanobot
 * 
 * Features:
 * - Log levels: debug, info, warn, error
 * - Output formats: pretty (dev), json (prod)
 * - Child loggers for module namespacing
 * - Error serialization with stack trace
 * - Environment variable override
 */

import { homedir } from "os";
import { join } from "path";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "node:fs";

/** Log level enum */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/** Log format type */
export type LogFormat = 'pretty' | 'json';

/** Logger options */
export interface LoggerOptions {
  level?: LogLevel | string;
  format?: LogFormat;
  module?: string;
  output?: 'console' | 'file' | 'both';
  filePath?: string;
}

/** JSON log entry */
export interface LogEntry {
  level: string;
  module: string;
  message: string;
  timestamp: string;
  pid: number;
  error?: {
    message: string;
    stack: string;
  };
  [key: string]: unknown;
}

/** Default log directory */
const LOG_DIR = join(homedir(), '.nanobot', 'logs');

// ============================================================
// 全局 Logger 配置 — 通过 configureGlobalLogger() 一次性设置
// 未调用时保持默认行为（只输出 console，零副作用）
// ============================================================
let _globalLevel: LogLevel | null = null;
let _globalFormat: LogFormat | null = null;
let _globalOutput: 'console' | 'file' | 'both' | null = null;
let _globalMaxFileSize: number = 10 * 1024 * 1024; // 10 MB（字节）
let _globalMaxFiles: number = 5;

// ============================================================
// 文件写入 & 体积轮转辅助函数
// ============================================================

/** 确保日志目录存在 */
function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

/** 当前日志文件路径 */
function currentLogPath(): string {
  return join(LOG_DIR, 'nanobot.log');
}

/** 历史日志路径，index 从 1 开始（nanobot.1.log, nanobot.2.log, …） */
function rotatedLogPath(index: number): string {
  return join(LOG_DIR, `nanobot.${index}.log`);
}

/**
 * 体积轮转：当 nanobot.log 超过 _globalMaxFileSize 时触发。
 * 轮转顺序：nanobot.(N-1).log → 删除，…，nanobot.1.log → nanobot.2.log，
 * nanobot.log → nanobot.1.log，再新建 nanobot.log。
 */
function rotateIfNeeded(): void {
  const current = currentLogPath();
  if (!existsSync(current)) return;

  try {
    const { size } = statSync(current);
    if (size < _globalMaxFileSize) return;

    // 删除最旧的（index = maxFiles - 1）
    const oldest = rotatedLogPath(_globalMaxFiles - 1);
    if (existsSync(oldest)) unlinkSync(oldest);

    // 依次向后移：nanobot.3.log → nanobot.4.log, …, nanobot.1.log → nanobot.2.log
    for (let i = _globalMaxFiles - 2; i >= 1; i--) {
      const from = rotatedLogPath(i);
      if (existsSync(from)) renameSync(from, rotatedLogPath(i + 1));
    }

    // nanobot.log → nanobot.1.log
    renameSync(current, rotatedLogPath(1));
  } catch {
    // 轮转失败不影响写入，下次触发时重试
  }
}

/** 剥离 ANSI 颜色转义码 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * 写入一行到日志文件（同步追加）。
 * 写入前检查大小并在需要时轮转。写入失败静默忽略，不让 Logger 崩溃。
 */
function writeToFile(line: string): void {
  try {
    ensureLogDir();
    rotateIfNeeded();
    appendFileSync(currentLogPath(), line + '\n', 'utf-8');
  } catch {
    // 磁盘满/权限问题时静默 fallback，不崩溃
  }
}

/**
 * Logger class with level filtering and format options
 */
export class Logger {
  private level: LogLevel;
  private format: LogFormat;
  private module: string;
  private output: 'console' | 'file' | 'both';
  private filePath?: string;

  constructor(options: LoggerOptions = {}) {
    // Level: env override > options > default
    const envLevel = process.env.NANOBOT_LOG_LEVEL?.toLowerCase();
    if (envLevel) {
      this.level = Logger.parseLevel(envLevel);
    } else if (options.level !== undefined) {
      this.level = typeof options.level === 'string' 
        ? Logger.parseLevel(options.level) 
        : options.level;
    } else {
      this.level = LogLevel.INFO;
    }

    // Format: env override > options > default
    const envFormat = process.env.NANOBOT_LOG_FORMAT?.toLowerCase();
    if (envFormat === 'json' || envFormat === 'pretty') {
      this.format = envFormat;
    } else {
      this.format = options.format || 'pretty';
    }

    // Output
    this.output = options.output || 'console';
    this.filePath = options.filePath;
    this.module = options.module || 'APP';
  }

  /** Parse level string to LogLevel */
  public static parseLevel(level: string): LogLevel {
    const m: Record<string, LogLevel> = {
      'debug': LogLevel.DEBUG,
      'info': LogLevel.INFO,
      'warn': LogLevel.WARN,
      'warning': LogLevel.WARN,
      'error': LogLevel.ERROR,
    };
    return m[level] ?? LogLevel.INFO;
  }

  /** Get level name string */
  private static levelName(level: LogLevel): string {
    const names = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return names[level] || 'INFO';
  }

  /** Create child logger with module prefix */
  child(module: string): Logger {
    const childModule = this.module 
      ? `${this.module}:${module.toUpperCase()}`
      : module.toUpperCase();
    
    return new Logger({
      level: this.level,
      format: this.format,
      module: childModule,
      output: this.output,
      filePath: this.filePath,
    });
  }

  /** Check if level should be logged */
  private shouldLog(level: LogLevel): boolean {
    return level >= (_globalLevel ?? this.level);
  }

  /** Safe stringify for objects */
  private safeStringify(obj: unknown): string {
    try {
      if (obj instanceof Error) {
        return JSON.stringify(this.serializeError(obj));
      }
      return typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  /** Serialize error object */
  serializeError(error: unknown): { message: string; stack: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack || '',
      };
    }
    return {
      message: String(error),
      stack: '',
    };
  }

  /** Format message with placeholders (%s, %d, %f, %.Nf, %%) */
  private formatMessage(msg: string, args: unknown[]): string {
    // 无占位符时快速返回，但 %% 仍需转义
    if (!msg.includes('%')) return msg;

    let argIndex = 0;

    // 单次遍历，按出现顺序消耗 args，避免多次 replace 导致的 argIndex 错位。
    // 支持：%% → literal %, %s → String, %d → truncated int, %f → float, %.Nf → N 位小数
    return msg.replace(/%(%|(\.(\d+))?[sdif])/g, (match, _tail, decimalSpec, precision) => {
      if (match === '%%') return '%';
      if (argIndex >= args.length) return match;

      const arg = args[argIndex++];

      if (match === '%s') return String(arg);

      if (match === '%d') {
        const num = typeof arg === 'number' ? arg : parseFloat(String(arg));
        return isNaN(num) ? String(arg) : String(Math.trunc(num));
      }

      // %f 或 %.Nf
      const num = typeof arg === 'number' ? arg : parseFloat(String(arg));
      if (isNaN(num)) return String(arg);
      const decimals = precision !== undefined ? parseInt(precision, 10) : 6;
      return num.toFixed(decimals);
    });
  }

  /** Build log entry object */
  private buildEntry(level: LogLevel, message: string, args: unknown[]): LogEntry {
    const entry: LogEntry = {
      level: Logger.levelName(level),
      module: this.module,
      message: this.formatMessage(message, args),
      timestamp: new Date().toISOString(),
      pid: process.pid,
    };

    // Check for Error in args
    for (const arg of args) {
      if (arg instanceof Error) {
        entry.error = this.serializeError(arg);
      }
    }

    return entry;
  }

  /** Output to console and/or file */
  private outputLog(entry: LogEntry): void {
    // 自我保护：防止无限递归
    if (entry.module === 'APP:UTILS' && entry.message.includes('Logger')) {
      console.error('[Logger] Error in Logger itself:', entry.error?.message);
      return;
    }

    // 优先使用全局配置，未设置时退回到实例配置
    const output = _globalOutput ?? this.output;
    const format = _globalFormat ?? this.format;

    let consoleLine: string;
    let fileLine: string;

    if (format === 'json') {
      consoleLine = JSON.stringify(entry);
      fileLine = consoleLine; // JSON 本身无 ANSI 颜色
    } else {
      // Pretty format
      const levelMap: Record<string, LogLevel> = {
        DEBUG: LogLevel.DEBUG,
        INFO: LogLevel.INFO,
        WARN: LogLevel.WARN,
        ERROR: LogLevel.ERROR,
      };
      const color = this.getColor(levelMap[entry.level] ?? LogLevel.INFO);
      const message = entry.error
        ? `${entry.message}\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}`
        : entry.message;

      consoleLine = `${color}[${entry.module}:${entry.level}]${this.resetColor()} ${message}`;
      // 文件中去掉 ANSI 颜色码，保留纯文本
      fileLine = stripAnsi(consoleLine);
    }

    // Console 输出
    if (output === 'console' || output === 'both') {
      if (entry.level === 'ERROR') {
        console.error(consoleLine);
      } else if (entry.level === 'WARN') {
        console.warn(consoleLine);
      } else {
        console.log(consoleLine);
      }
    }

    // 文件输出（同步追加，含体积轮转）
    if (output === 'file' || output === 'both') {
      writeToFile(fileLine);
    }
  }

  /** Get ANSI color code */
  private getColor(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[90m',   // Gray
      [LogLevel.INFO]: '\x1b[36m',    // Cyan
      [LogLevel.WARN]: '\x1b[33m',    // Yellow
      [LogLevel.ERROR]: '\x1b[31m',  // Red
    };
    return colors[level] || '';
  }

  /** Reset ANSI color */
  private resetColor(): string {
    return '\x1b[0m';
  }

  /** Main log method */
  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    try {
      const entry = this.buildEntry(level, message, args);
      this.outputLog(entry);
    } catch (e) {
      // Fallback: Logger should never crash
      console.error('[Logger] Internal error:', e);
    }
  }

  /** Debug level */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, args);
  }

  /** Info level */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, args);
  }

  /** Warn level */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, args);
  }

  /** Error level */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, args);
  }

  /** Get current level */
  getLevel(): LogLevel {
    return this.level;
  }

  /** Get current format */
  getFormat(): LogFormat {
    return this.format;
  }
}

/**
 * Create root logger instance
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}

/**
 * Default root logger (singleton)
 */
export const logger = new Logger();

// Console compatibility layer (for gradual migration)
// Warning: This affects global console behavior
/*
console.debug = (...args: unknown[]) => logger.debug(...args);
console.info = (...args: unknown[]) => logger.info(...args);
console.warn = (...args: unknown[]) => logger.warn(...args);
console.error = (...args: unknown[]) => logger.error(...args);
*/

/**
 * 全局配置所有 Logger 实例的输出行为。
 * 应在应用启动时调用一次（例如 CLI 命令 action 开头）。
 * 调用后，所有通过 `new Logger()` 或 `createLogger()` 创建的实例
 * 都会共享此配置，无需单独传参。
 *
 * @param config - 来自配置文件的 logger 配置
 */
export function configureGlobalLogger(config: {
  level: string;
  format: LogFormat;
  output: 'console' | 'file' | 'both';
  max_file_size?: number;
  max_files?: number;
}): void {
  _globalLevel = Logger.parseLevel(config.level);
  _globalFormat = config.format;
  _globalOutput = config.output;
  if (config.max_file_size != null) _globalMaxFileSize = config.max_file_size;
  if (config.max_files != null) _globalMaxFiles = config.max_files;
}
