/**
 * Session manager for conversation history persistence.
 * 
 * Based on Python nanobot session/manager.py structure.
 * Uses JSONL format with metadata header line.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Session } from "./session";
import type { SessionInfo, SessionMessage } from "./types";
import { ensureDir, safeFilename, getSessionsPath } from "../utils/index";

interface JsonlMetadata {
  _type: "metadata";
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export class SessionManager {
  private readonly workspace: string;
  private readonly sessionsDir: string;
  private readonly cache: Map<string, Session>;

  /**
   * Create a new SessionManager.
   * 
   * @param workspace - Workspace directory path
   */
  constructor(workspace: string) {
    this.workspace = workspace;
    this.sessionsDir = getSessionsPath();
    ensureDir(this.sessionsDir);
    this.cache = new Map();
  }

  /**
   * Get the file path for a session.
   * 
   * @param key - Session key
   * @returns Safe file path
   */
  private _getSessionPath(key: string): string {
    const safeKey = safeFilename(key.replace(/:/g, "_"));
    return join(this.sessionsDir, `${safeKey}.jsonl`);
  }

  /**
   * Get an existing session or create a new one.
   * 
   * @param key - Session key (usually channel:chat_id)
   * @returns The session
   */
  getOrCreate(key: string): Session {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Try to load from disk
    const session = this._load(key) ?? new Session(key);

    this.cache.set(key, session);
    return session;
  }

  /**
   * Load a session from disk.
   * 
   * @param key - Session key
   * @returns Session or null if not found
   */
  private _load(key: string): Session | null {
    const path = this._getSessionPath(key);

    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      let messages: SessionMessage[] = [];
      let metadata: Record<string, unknown> = {};
      let createdAt: Date | null = null;

      for (const line of lines) {
        const data = JSON.parse(line) as JsonlMetadata | SessionMessage;

        if ("_type" in data && (data as JsonlMetadata)._type === "metadata") {
          const meta = data as JsonlMetadata;
          metadata = meta.metadata;
          createdAt = meta.created_at ? new Date(meta.created_at) : null;
        } else {
          messages.push(data as SessionMessage);
        }
      }

      return new Session(key, {
        messages,
        created_at: createdAt?.toISOString() ?? new Date().toISOString(),
        metadata,
      });
    } catch (e) {
      console.warn(`Failed to load session ${key}: ${e}`);
      return null;
    }
  }

  /**
   * Save a session to disk.
   * 
   * @param session - Session to save
   */
  save(session: Session): void {
    const path = this._getSessionPath(session.key);

    try {
      const lines: string[] = [];

      // Write metadata first
      const metadataLine: JsonlMetadata = {
        _type: "metadata",
        created_at: session.created_at.toISOString(),
        updated_at: session.updated_at.toISOString(),
        metadata: session.metadata,
      };
      lines.push(JSON.stringify(metadataLine));

      // Write messages
      for (const msg of session.messages) {
        lines.push(JSON.stringify(msg));
      }

      writeFileSync(path, lines.join("\n") + "\n", "utf-8");
      this.cache.set(session.key, session);
    } catch (e) {
      console.warn(`Failed to save session ${session.key}: ${e}`);
    }
  }

  /**
   * Delete a session.
   * 
   * @param key - Session key
   * @returns True if deleted, False if not found
   */
  delete(key: string): boolean {
    // Remove from cache
    this.cache.delete(key);

    // Remove file
    const path = this._getSessionPath(key);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
        return true;
      } catch (e) {
        console.warn(`Failed to delete session ${key}: ${e}`);
      }
    }
    return false;
  }

  /**
   * List all sessions.
   * 
   * @returns Array of session info
   */
  list(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    const files = readdirSync(this.sessionsDir).filter((f: string) => f.endsWith(".jsonl"));

    for (const file of files) {
      try {
        const path = join(this.sessionsDir, file);
        const content = readFileSync(path, "utf-8");
        const firstLine = content.split("\n")[0].trim();

        if (firstLine) {
          const data = JSON.parse(firstLine) as JsonlMetadata;
          if (data._type === "metadata") {
            sessions.push({
              key: file.replace(".jsonl", "").replace(/_/g, ":"),
              created_at: data.created_at,
              updated_at: data.updated_at,
              path,
            });
          }
        }
      } catch {
        continue;
      }
    }

    return sessions.sort((a, b) => {
      const aTime = a.updated_at ?? "";
      const bTime = b.updated_at ?? "";
      return bTime.localeCompare(aTime);
    });
  }
}
