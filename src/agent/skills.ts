import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { ISkillsLoader } from "./types";

interface SkillInfo {
  name: string;
  path: string;
  source: string;
}

interface SkillMetadata {
  description?: string;
  always?: string | boolean;
  requires?: {
    bins?: string[];
    env?: string[];
  };
}

export class SkillsLoader implements ISkillsLoader {
  private workspaceSkills: string;
  private builtinSkills: string | null;

  constructor(
    workspace: string,
    builtinSkillsDir?: string | null
  ) {
    this.workspaceSkills = join(workspace, "skills");
    this.builtinSkills = builtinSkillsDir || null;
  }

  list_skills(filterUnavailable: boolean = true): SkillInfo[] {
    const skills: SkillInfo[] = [];

    if (existsSync(this.workspaceSkills)) {
      const dirs = readdirSync(this.workspaceSkills);
      for (const name of dirs) {
        const skillPath = join(this.workspaceSkills, name, "SKILL.md");
        if (existsSync(skillPath)) {
          skills.push({ name, path: skillPath, source: "workspace" });
        }
      }
    }

    if (this.builtinSkills && existsSync(this.builtinSkills)) {
      const dirs = readdirSync(this.builtinSkills);
      for (const name of dirs) {
        const skillPath = join(this.builtinSkills, name, "SKILL.md");
        if (existsSync(skillPath) && !skills.find(s => s.name === name)) {
          skills.push({ name, path: skillPath, source: "builtin" });
        }
      }
    }

    if (filterUnavailable) {
      return skills.filter(s => this._checkRequirements(s.name));
    }
    return skills;
  }

  load_skill(name: string): string | null {
    const workspacePath = join(this.workspaceSkills, name, "SKILL.md");
    if (existsSync(workspacePath)) {
      return readFileSync(workspacePath, "utf-8");
    }

    if (this.builtinSkills) {
      const builtinPath = join(this.builtinSkills, name, "SKILL.md");
      if (existsSync(builtinPath)) {
        return readFileSync(builtinPath, "utf-8");
      }
    }

    return null;
  }

  load_skills_for_context(skillNames: string[]): string {
    const parts: string[] = [];
    for (const name of skillNames) {
      const content = this.load_skill(name);
      if (content) {
        parts.push(`### Skill: ${name}\n\n${this._stripFrontmatter(content)}`);
      }
    }
    return parts.join("\n\n---\n\n");
  }

  build_skills_summary(): string {
    const allSkills = this.list_skills(false);
    if (allSkills.length === 0) return "";

    const lines: string[] = ["<skills>"];
    for (const skill of allSkills) {
      const meta = this.get_skill_metadata(skill.name);
      const available = this._checkRequirements(skill.name);

      lines.push(`  <skill available="${available}">`);
      lines.push(`    <name>${this._escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${this._escapeXml(meta?.description || skill.name)}</description>`);
      lines.push(`    <location>${skill.path}</location>`);

      if (!available) {
        const missing = this._getMissingRequirements(skill.name);
        if (missing) {
          lines.push(`    <requires>${this._escapeXml(missing)}</requires>`);
        }
      }
      lines.push("  </skill>");
    }
    lines.push("</skills>");

    return lines.join("\n");
  }

  get_always_skills(): string[] {
    const skills = this.list_skills(true);
    const result: string[] = [];

    for (const skill of skills) {
      const meta = this.get_skill_metadata(skill.name);
      if (meta?.always === "true" || meta?.always === true) {
        result.push(skill.name);
      }
    }

    return result;
  }

  get_skill_metadata(name: string): SkillMetadata | null {
    const content = this.load_skill(name);
    if (!content) return null;

    if (content.startsWith("---")) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const metadata: SkillMetadata = {};
        for (const line of match[1].split("\n")) {
          if (line.includes(":")) {
            const [key, ...valueParts] = line.split(":");
            const value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");
            if (key.trim() === "description") metadata.description = value;
            if (key.trim() === "always") metadata.always = value;
          }
        }
        return metadata;
      }
    }

    return null;
  }

  private _stripFrontmatter(content: string): string {
    if (content.startsWith("---")) {
      const match = content.match(/^---\n[\s\S]*?\n---\n/);
      if (match) {
        return content.slice(match[0].length).trim();
      }
    }
    return content;
  }

  private _escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private _checkRequirements(name: string): boolean {
    const meta = this.get_skill_metadata(name);
    if (!meta || !meta.requires) return true;

    const requires = meta.requires;
    if (requires.bins) {
      for (const bin of requires.bins) {
        try {
          execSync(`which ${bin}`, { stdio: "ignore" });
        } catch {
          return false;
        }
      }
    }

    if (requires.env) {
      for (const env of requires.env) {
        if (!process.env[env]) return false;
      }
    }

    return true;
  }

  private _getMissingRequirements(name: string): string {
    const meta = this.get_skill_metadata(name);
    if (!meta || !meta.requires) return "";

    const missing: string[] = [];
    const requires = meta.requires;

    if (requires.bins) {
      for (const bin of requires.bins) {
        try {
          execSync(`which ${bin}`, { stdio: "ignore" });
        } catch {
          missing.push(`CLI: ${bin}`);
        }
      }
    }

    if (requires.env) {
      for (const env of requires.env) {
        if (!process.env[env]) {
          missing.push(`ENV: ${env}`);
        }
      }
    }

    return missing.join(", ");
  }
}