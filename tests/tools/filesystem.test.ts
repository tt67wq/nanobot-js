import { describe, it, expect, beforeEach } from "bun:test";
import { WriteFileTool, ReadFileTool, ListDirTool } from "../../src/tools/filesystem";
import { writeFileSync, mkdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";

describe("Filesystem Tools", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join("/tmp", "test-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  describe("WriteFileTool", () => {
    it("should write file successfully", async () => {
      const tool = new WriteFileTool();
      const filePath = join(tmpDir, "test.txt");
      const result = await tool.execute({ path: filePath, content: "Hello World" });
      expect(result).toContain("Successfully wrote");
    });

    it("should return error for missing path", async () => {
      const tool = new WriteFileTool();
      const result = await tool.execute({ content: "test" });
      expect(result).toContain("Error");
    });
  });

  describe("ReadFileTool", () => {
    it("should read existing file", async () => {
      const tool = new ReadFileTool();
      const filePath = join(tmpDir, "test.txt");
      writeFileSync(filePath, "Test Content");
      const result = await tool.execute({ path: filePath });
      expect(result).toBe("Test Content");
    });

    it("should return error for missing file", async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: join(tmpDir, "nonexistent.txt") });
      expect(result).toContain("Error");
    });
  });

  describe("ListDirTool", () => {
    it("should list directory contents", async () => {
      const tool = new ListDirTool();
      writeFileSync(join(tmpDir, "file1.txt"), "content");
      mkdirSync(join(tmpDir, "subdir"));
      const result = await tool.execute({ path: tmpDir });
      expect(result).toContain("file1.txt");
      expect(result).toContain("subdir");
    });
  });
});