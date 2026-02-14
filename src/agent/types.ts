/**
 * Memory store interface (for dependency injection)
 */
export interface IMemoryStore {
  get_memory_context(): string | null;
}

/**
 * Skills loader interface (for dependency injection)
 */
export interface ISkillsLoader {
  get_always_skills(): string[];
  load_skills_for_context(skills: string[]): string;
  build_skills_summary(): string;
}

/**
 * ContextBuilder options
 */
export interface ContextBuilderOptions {
  workspace: string;
  memory?: IMemoryStore | null;
  skills?: ISkillsLoader | null;
}

/**
 * Bootstrap file names
 */
export const BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];