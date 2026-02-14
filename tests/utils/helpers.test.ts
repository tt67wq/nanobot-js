import { describe, it, expect } from "bun:test";
import {
  getDataPath,
  getWorkspacePath,
  getSessionsPath,
  getMemoryPath,
  getSkillsPath,
  todayDate,
  timestamp,
  truncateString,
  safeFilename,
  parseSessionKey,
} from "../../src/utils/helpers.ts";

describe("utils/helpers", () => {
  describe("getDataPath", () => {
    it("returns nanobot data directory", () => {
      const path = getDataPath();
      expect(path).toContain(".nanobot");
    });
  });

  describe("getWorkspacePath", () => {
    it("returns default workspace path", () => {
      const path = getWorkspacePath();
      expect(path).toContain(".nanobot/workspace");
    });

    it("expands ~ in path", () => {
      const path = getWorkspacePath("~/test");
      expect(path).toContain("test");
      expect(path).not.toContain("~");
    });

    it("returns custom path without modification", () => {
      // Custom paths starting with / are returned as-is (assumes caller manages directory)
      const path = getWorkspacePath("/tmp/test-workspace");
      expect(path).toBe("/tmp/test-workspace");
    });
  });

  describe("getSessionsPath", () => {
    it("returns sessions directory", () => {
      const path = getSessionsPath();
      expect(path).toContain(".nanobot/sessions");
    });
  });

  describe("getMemoryPath", () => {
    it("returns memory directory in workspace", () => {
      const path = getMemoryPath();
      expect(path).toContain("memory");
    });
  });

  describe("getSkillsPath", () => {
    it("returns skills directory in workspace", () => {
      const path = getSkillsPath();
      expect(path).toContain("skills");
    });
  });

  describe("todayDate", () => {
    it("returns date in YYYY-MM-DD format", () => {
      const date = todayDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("timestamp", () => {
    it("returns ISO format timestamp", () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("truncateString", () => {
    it("returns original string if under max length", () => {
      const result = truncateString("hello", 10);
      expect(result).toBe("hello");
    });

    it("truncates and adds suffix", () => {
      const result = truncateString("hello world", 5);
      expect(result).toBe("he...");
    });

    it("uses custom suffix", () => {
      // maxLen=8, suffix="___" (len=3) -> slice to 5 chars + suffix = 8 chars
      const result = truncateString("hello world", 8, "___");
      expect(result).toBe("hello___");
    });
  });

  describe("safeFilename", () => {
    it("removes unsafe characters", () => {
      const result = safeFilename("test<file>:name?.txt");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).not.toContain(":");
      expect(result).not.toContain("?");
    });

    it("trims whitespace", () => {
      const result = safeFilename("  filename  ");
      expect(result).toBe("filename");
    });
  });

  describe("parseSessionKey", () => {
    it("parses valid session key", () => {
      const [channel, id] = parseSessionKey("feishu:123456");
      expect(channel).toBe("feishu");
      expect(id).toBe("123456");
    });

    it("throws on invalid key", () => {
      expect(() => parseSessionKey("invalid")).toThrow();
    });
  });
});
