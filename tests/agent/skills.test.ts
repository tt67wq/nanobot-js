import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SkillsLoader } from "../../src/agent/skills";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("SkillsLoader", () => {
  let tmpDir: string;
  let loader: SkillsLoader;

  beforeEach(() => {
    tmpDir = join("/tmp", "test-skills-" + Date.now());
    mkdirSync(join(tmpDir, "skills", "test-skill"), { recursive: true });
    writeFileSync(
      join(tmpDir, "skills", "test-skill", "SKILL.md"),
      "---\ndescription: Test skill\n---\n# Test Skill\nThis is a test skill.",
      "utf-8"
    );
    loader = new SkillsLoader(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("list_skills", () => {
    it("should list workspace skills", async () => {
      const skills = await loader.list_skills();
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].name).toBe("test-skill");
    });
  });

  describe("load_skill", () => {
    it("should load skill content", async () => {
      const content = await loader.load_skill("test-skill");
      expect(content).toContain("Test Skill");
    });

    it("should return null for non-existent skill", async () => {
      const content = await loader.load_skill("non-existent");
      expect(content).toBeNull();
    });
  });

  describe("get_skill_metadata", () => {
    it("should parse frontmatter metadata", async () => {
      const meta = await loader.get_skill_metadata("test-skill");
      expect(meta?.description).toBe("Test skill");
    });
  });
});