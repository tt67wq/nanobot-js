import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MemoryStore } from "../../src/agent/memory";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("MemoryStore", () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tmpDir = join("/tmp", "test-memory-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    store = new MemoryStore(tmpDir);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("readToday", () => {
    it("should return empty string when no file exists", async () => {
      const content = await store.readToday();
      expect(content).toBe("");
    });
  });

  describe("appendToday", () => {
    it("should create file with header when first writing", async () => {
      await store.appendToday("Test note");
      const content = await store.readToday();
      expect(content).toContain("Test note");
    });

    it("should append to existing content", async () => {
      await store.appendToday("First note");
      await store.appendToday("Second note");
      const content = await store.readToday();
      expect(content).toContain("First note");
      expect(content).toContain("Second note");
    });
  });

  describe("readLongTerm", () => {
    it("should return empty when no file exists", async () => {
      const content = await store.readLongTerm();
      expect(content).toBe("");
    });

    it("should read existing long-term memory", async () => {
      await store.writeLongTerm("Long term memory");
      const content = await store.readLongTerm();
      expect(content).toBe("Long term memory");
    });
  });

  describe("getMemoryContext", () => {
    it("should return empty when no memory exists", async () => {
      const context = await store.getMemoryContext();
      expect(context).toBe("");
    });

    it("should include long-term memory", async () => {
      await store.writeLongTerm("Important info");
      const context = await store.getMemoryContext();
      expect(context).toContain("## Long-term Memory");
      expect(context).toContain("Important info");
    });
  });
});