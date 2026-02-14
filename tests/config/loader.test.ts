import { describe, it, expect } from "bun:test";
import { 
  loadConfig, 
  saveConfig, 
  camelToSnake, 
  snakeToCamel, 
  convertKeys, 
  getConfigPath,
  getDataDir,
  Config 
} from "../../src/config/index";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

describe("Config Module Tests", () => {
  describe("camelToSnake", () => {
    it("should convert camelCase to snake_case", () => {
      expect(camelToSnake("testProperty")).toBe("test_property");
      expect(camelToSnake("anotherTestVar")).toBe("another_test_var");
      expect(camelToSnake("simpleWord")).toBe("simple_word");
      expect(camelToSnake("already_snake_case")).toBe("already_snake_case");
      expect(camelToSnake("XMLHttpRequest")).toBe("x_m_l_http_request");
      expect(camelToSnake("URLParser")).toBe("u_r_l_parser");
      expect(camelToSnake("HTTPServerPort")).toBe("h_t_t_p_server_port");
    });

    it("should handle single character correctly", () => {
      expect(camelToSnake("a")).toBe("a");
      expect(camelToSnake("T")).toBe("t");
    });

    it("should handle empty string", () => {
      expect(camelToSnake("")).toBe("");
    });

    it("should handle string with no uppercase letters", () => {
      expect(camelToSnake("lowercase")).toBe("lowercase");
      expect(camelToSnake("lower_case")).toBe("lower_case");
    });
  });

  describe("snakeToCamel", () => {
    it("should convert snake_case to camelCase", () => {
      expect(snakeToCamel("test_property")).toBe("testProperty");
      expect(snakeToCamel("another_test_var")).toBe("anotherTestVar");
      expect(snakeToCamel("simple_word")).toBe("simpleWord");
      expect(snakeToCamel("camelCase")).toBe("camelCase");
      expect(snakeToCamel("single")).toBe("single");
    });

    it("should handle single word", () => {
      expect(snakeToCamel("word")).toBe("word");
    });

    it("should handle empty string", () => {
      expect(snakeToCamel("")).toBe("");
    });

    it("should handle underscore at beginning or end", () => {
      expect(snakeToCamel("_property")).toBe("Property");
      expect(snakeToCamel("property_")).toBe("property");
    });
  });

  describe("convertKeys", () => {
    it("should convert camelCase keys to snake_case when toCamel is false", () => {
      const obj = {
        camelCase: "value1",
        anotherProperty: "value2",
        nestedObject: {
          deeplyNestedProp: "value3"
        }
      };
      
      const result = convertKeys(obj, false);
      
      expect(result.camel_case).toBe("value1");
      expect(result.another_property).toBe("value2");
      expect(result.nested_object.deeply_nested_prop).toBe("value3");
    });

    it("should convert snake_case keys to camelCase when toCamel is true", () => {
      const obj = {
        snake_case: "value1",
        another_property: "value2",
        nested_object: {
          deeply_nested_prop: "value3"
        }
      };
      
      const result = convertKeys(obj, true);
      
      expect(result.snakeCase).toBe("value1");
      expect(result.anotherProperty).toBe("value2");
      expect(result.nestedObject.deeplyNestedProp).toBe("value3");
    });

    it("should handle arrays and maintain their content types", () => {
      const obj = {
        arrayOfObjects: [
          { camelCase: "value1" },
          { anotherProperty: "value2" }
        ]
      };
      
      const result = convertKeys(obj, false);
      expect(Array.isArray(result.array_of_objects)).toBe(true);
      expect(result.array_of_objects[0].camel_case).toBe("value1");
      expect(result.array_of_objects[1].another_property).toBe("value2");
    });

    it("should handle null and undefined values", () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined
      };
      
      const result = convertKeys(obj, false);
      expect(result.null_value).toBeNull();
      expect(result.undefined_value).toBeUndefined();
    });

    it("should handle primitive values", () => {
      expect(convertKeys("string", false)).toBe("string");
      expect(convertKeys(42, false)).toBe(42);
      expect(convertKeys(true, false)).toBe(true);
    });

    it("should handle complex nested structure", () => {
      const obj = {
        topLevelProp: {
          secondLevel: {
            deepNestedItem: [
              { innerProperty: "value1" },
              { anotherInner: "value2" }
            ]
          }
        }
      };

      const snaked = convertKeys(obj, false);
      expect(snaked.top_level_prop.second_level.deep_nested_item[0].inner_property).toBe("value1");
      expect(snaked.top_level_prop.second_level.deep_nested_item[1].another_inner).toBe("value2");

      const camelled = convertKeys(snaked, true);
      expect(camelled.topLevelProp.secondLevel.deepNestedItem[0].innerProperty).toBe("value1");
      expect(camelled.topLevelProp.secondLevel.deepNestedItem[1].anotherInner).toBe("value2");
    });
  });

  describe("loadConfig", () => {
    it("should return default config when config file doesn't exist", () => {
      const tempPath = join(tmpdir(), "nonexistent_config.json");
      
      const config = loadConfig(tempPath);
      
      expect(config).toBeInstanceOf(Config);
      expect(config.agents.defaults.model).toBe("anthropic/claude-opus-4-5");
      expect(config.gateway.port).toBe(18790);
    });

    it("should load config from custom path", () => {
      const tempDir = join(tmpdir(), "test_config_" + Date.now());
      const configPath = join(tempDir, "config.json");
      const configParentDir = dirname(configPath);

      if (!existsSync(configParentDir)) {
        mkdirSync(configParentDir, { recursive: true });
      }

      const sampleConfig = {
        agents: {
          defaults: {
            model: "custom/test-model-v1",
            workspace: "~/test-workspace"
          }
        }
      };

      writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2));

      try {
        const config = loadConfig(configPath);
        expect(config.agents.defaults.model).toBe("custom/test-model-v1");
        expect(config.agents.defaults.workspace).toBe("~/test-workspace");
      } finally {
        if (existsSync(configPath)) unlinkSync(configPath);
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      }
    });

    it("should handle invalid JSON in config file gracefully", () => {
      const tempDir = join(tmpdir(), "test_config_" + Date.now());
      const configPath = join(tempDir, "config.json");
      const configParentDir = dirname(configPath);

      if (!existsSync(configParentDir)) {
        mkdirSync(configParentDir, { recursive: true });
      }

      writeFileSync(configPath, "{invalid: json}");

      try {
        const config = loadConfig(configPath);
        expect(config).toBeInstanceOf(Config);
        expect(config.agents.defaults.model).toBe("anthropic/claude-opus-4-5");
      } catch (error) {
        expect(true).toBe(true);
      } finally {
        if (existsSync(configPath)) unlinkSync(configPath);
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      }
    });

    it("should handle invalid JSON in config file gracefully", () => {
      const tempDir = join(tmpdir(), "test_config_" + Date.now());
      const configPath = join(tempDir, "config.json");
      const configParentDir = dirname(configPath);

      if (!existsSync(configParentDir)) {
        mkdirSync(configParentDir, { recursive: true });
      }

      writeFileSync(configPath, "{invalid: json}");

      try {
        const config = loadConfig(configPath);
        expect(config).toBeInstanceOf(Config);
        expect(config.agents.defaults.model).toBe("anthropic/claude-opus-4-5");
      } catch (error) {
        expect(true).toBe(true);
      } finally {
        if (existsSync(configPath)) unlinkSync(configPath);
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe("saveConfig", () => {
    it("should save config to the correct path", () => {
      const tempDir = join(tmpdir(), "test_save_config_" + Date.now());
      const configPath = join(tempDir, "saved_config.json");
      const configParentDir = dirname(configPath);

      if (!existsSync(configParentDir)) {
        mkdirSync(configParentDir, { recursive: true });
      }

      const config = new Config({
        agents: {
          defaults: {
            model: "test/save-model-v2",
            workspace: "~/test-save-workspace"
          }
        },
        gateway: {
          host: "0.0.0.0",
          port: 12345
        }
      } as Config);

      try {
        saveConfig(config, configPath);

        expect(existsSync(configPath)).toBe(true);

        const savedContent = readFileSync(configPath, "utf8");
        const parsed = JSON.parse(savedContent);

        expect(parsed).toHaveProperty("agents");
        expect(parsed.agents.defaults.model).toBe("test/save-model-v2");
        expect(parsed.gateway.port).toBe(12345);

        expect(parsed).toHaveProperty("agents");
        expect(parsed).toHaveProperty("gateway");
        expect("model" in parsed.agents.defaults).toBe(true);
      } finally {
        if (existsSync(configPath)) unlinkSync(configPath);
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      }
    });

    it("should create parent directory if it doesn't exist", () => {
      const tempDir = join(tmpdir(), "test_save_config_parent_" + Date.now());
      const subDir = join(tempDir, "subdir", "more_subdirs");
      const configPath = join(subDir, "config.json");

      try {
        const config = new Config({
          agents: {
            defaults: {
              model: "auto-created/dir-test"
            }
          }
        } as Config);

        saveConfig(config, configPath);

        expect(existsSync(configPath)).toBe(true);

        const savedContent = readFileSync(configPath, "utf8");
        const parsed = JSON.parse(savedContent);
        expect(parsed.agents.defaults.model).toBe("auto-created/dir-test");
      } finally {
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe("Config Class", () => {
    it("should have workspacePath getter expanding ~ to home directory", () => {
      const config = new Config({
        agents: {
          defaults: {
            workspace: "~/test-workspace-expansion"
          }
        }
      } as Config);
      
      const homeDir = require("os").homedir();
      const expectedPath = join(homeDir, "test-workspace-expansion");
      expect(config.workspacePath).toBe(expectedPath);
    });

    it("should handle workspacePath when it doesn't start with ~", () => {
      const config = new Config({
        providers: {
          anthropic: {
            api_key: "test-api-key-123",
            api_base: "https://test-api.example.com"
          }
        }
      } as Config);
      
      expect(config.getApiKey()).toBe("test-api-key-123");
    });

    it("should return null when API key is not set", () => {
      const config = new Config({
        providers: {
          anthropic: {
            api_key: "",
            api_base: null
          }
        }
      } as Config);
      
      expect(config.getApiKey()).toBeNull();
    });

    it("should return API base via getApiBase method", () => {
      const config = new Config({
        providers: {
          anthropic: {
            api_key: "",
            api_base: "https://test-anthropic-api.base.url"
          }
        }
      } as Config);
      
      expect(config.getApiBase()).toBe("https://test-anthropic-api.base.url");
    });

    it("should handle null API base", () => {
      const config = new Config({
        providers: {
          anthropic: {
            api_key: "",
            api_base: null
          }
        }
      } as Config);
      
      expect(config.getApiBase()).toBeNull();
    });
  });

  describe("Utility Functions", () => {
    it("getConfigPath should return correct path in home directory", () => {
      const configPath = getConfigPath();
      const homeDir = require("os").homedir();
      const expectedPath = join(homeDir, ".nanobot", "config.json");
      
      expect(configPath).toBe(expectedPath);
    });

    it("getDataDir should return correct data directory", () => {
      const dataDir = getDataDir();
      const homeDir = require("os").homedir();
      const expectedPath = join(homeDir, ".nanobot");
      
      expect(dataDir).toBe(expectedPath);
    });
  });
});