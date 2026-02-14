import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { Config, ConfigSchema } from "./schema";

export function getConfigPath(): string {
  return join(homedir(), ".nanobot", "config.json");
}

export function getDataDir(): string {
  return join(homedir(), ".nanobot");
}

export function loadConfig(configPath?: string): Config {
  const path = configPath || getConfigPath();

  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const convertedData = convertKeys(data, true);
      return new Config(convertedData);
    } catch (e) {
      console.warn(`Warning: Failed to load config from ${path}:`, e);
      console.log("Using default configuration.");
    }
  }

  return new Config();
}

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath || getConfigPath();
  
  const parentDir = dirname(path);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Convert config to plain object, then convert keys to camelCase
  const configData = ConfigSchema.parse({
    agents: config.agents,
    channels: config.channels,
    providers: config.providers,
    gateway: config.gateway,
    tools: config.tools,
    mcp: config.mcp,
  });
  
  const data = convertKeys(configData, false);

  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export function camelToSnake(name: string): string {
  const result: string[] = [];
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    if (char >= 'A' && char <= 'Z' && i > 0) {
      result.push('_');
    }
    result.push(char.toLowerCase());
  }
  return result.join('');
}

export function snakeToCamel(name: string): string {
  const components = name.split('_');
  return components[0] + components.slice(1).map(component => 
    component.charAt(0).toUpperCase() + component.slice(1)
  ).join('');
}

export function convertKeys(data: any, toCamel: boolean): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => convertKeys(item, toCamel));
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const newKey = toCamel ? snakeToCamel(key) : camelToSnake(key);
      result[newKey] = convertKeys(value, toCamel);
    }
    return result;
  }

  return data;
}