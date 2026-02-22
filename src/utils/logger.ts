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
  private static parseLevel(level: string): LogLevel {
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
    return level >= this.level;
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

  /** Format message with placeholders */
  private formatMessage(msg: string, args: unknown[]): string {
    let result = msg;
    for (const arg of args) {
      result = result.replace('%s', this.safeStringify(arg));
    }
    return result;
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

  /** Output to console or file */
  private outputLog(entry: LogEntry): void {
    // Logger self-protection: prevent infinite recursion
    if (entry.module === 'APP:UTILS' && entry.message.includes('Logger')) {
      console.error('[Logger] Error in Logger itself:', entry.error?.message);
      return;
    }

    if (this.format === 'json') {
      const line = JSON.stringify(entry);
      if (this.output === 'console' || this.output === 'both') {
        console.log(line);
      }
    } else {
      // Pretty format
      const prefix = `[${entry.module}:${entry.level}]`;
      const levelMap: Record<string, LogLevel> = { DEBUG: LogLevel.DEBUG, INFO: LogLevel.INFO, WARN: LogLevel.WARN, ERROR: LogLevel.ERROR };
      const color = this.getColor(levelMap[entry.level] ?? LogLevel.INFO);
      const message = entry.error 
        ? `${entry.message}\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}`
        : entry.message;
      
      const line = `${color}${prefix}${this.resetColor()} ${message}`;
      
      if (this.output === 'console' || this.output === 'both') {
        if (entry.level === 'ERROR') {
          console.error(line);
        } else if (entry.level === 'WARN') {
          console.warn(line);
        } else {
          console.log(line);
        }
      }
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
