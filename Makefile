.PHONY: help install build test clean run agent gateway onboard status cron-list cron-add cron-run version build-binary build-linux-x64 build-linux-arm64 build-windows-x64 build-darwin-x64 build-darwin-arm64 build-all clean-binary

# 默认目标
help:
	@echo "nanobot Makefile"
	@echo ""
	@echo "Usage: make <command>"
	@echo ""
	@echo "Development:"
	@echo "  make install     Install dependencies"
	@echo "  make build       Build the project"
	@echo "  make test        Run tests"
	@echo "  make clean       Clean build artifacts"
	@echo ""
	@echo "Build Binary:"
	@echo "  make build-binary        Build binary for current platform"
	@echo "  make build-linux-x64    Build for Linux x64"
	@echo "  make build-linux-arm64  Build for Linux ARM64"
	@echo "  make build-windows-x64  Build for Windows x64"
	@echo "  make build-darwin-x64   Build for macOS x64"
	@echo "  make build-darwin-arm64 Build for macOS ARM64 (Apple Silicon)"
	@echo "  make build-all          Build for all platforms"
	@echo "  make clean-binary       Clean binary files"
	@echo ""
	@echo "Commands:"
	@echo "  make onboard     Initialize config and workspace"
	@echo "  make run         Run single message (use MSG='your message')"
	@echo "  make agent       Run in interactive mode"
	@echo "  make gateway     Start gateway service"
	@echo "  make status      Show status"
	@echo ""
	@echo "Cron:"
	@echo "  make cron-list   List scheduled jobs"
	@echo "  make cron-add    Add cron job (use NAME='name' MSG='message' EVERY=60)"
	@echo "  make cron-run    Run cron job (use JOB_ID='xxx')"
	@echo ""
	@echo "Examples:"
	@echo "  make run MSG='Hello world'"
	@echo "  make cron-add NAME='daily' MSG='Check weather' EVERY=3600"

# ===========================================
# Development
# ===========================================

install:
	bun install

build:
	bun run build

test:
	bun test

clean:
	rm -rf dist/
	rm -f ~/.nanobot/config.json

# ===========================================
# Build Binary
# ===========================================

# 读取 VERSION 文件
VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")

# 编译输出目录
BIN_DIR := bin

# 编译输出文件名
BINARY_NAME := nanobot

# 完整输出路径
OUTPUT := $(BIN_DIR)/$(BINARY_NAME)

# 入口文件（TypeScript 源文件）
ENTRYPOINT := src/cli/commands.ts

# 默认目标平台（交叉编译时指定）
TARGET ?= 

# 编译选项
COMPILE_OPTS := --compile --minify

# 如果指定了目标平台，添加 target 参数
ifdef TARGET
	COMPILE_OPTS += --target=$(TARGET)
endif

# 确保 bin 目录存在
$(BIN_DIR):
	mkdir -p $(BIN_DIR)

# 本平台编译
build-binary: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION)..."
	@echo "Target: $(if $(TARGET),$(TARGET),current platform)"
	bun build $(COMPILE_OPTS) $(ENTRYPOINT) --outfile $(OUTPUT)
	@echo "Done! Binary: ./$(OUTPUT)"
	@chmod +x $(OUTPUT)

# 跨平台编译 - Linux x64
build-linux-x64: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for Linux x64..."
	bun build --compile --minify --target=bun-linux-x64 $(ENTRYPOINT) --outfile $(BIN_DIR)/$(BINARY_NAME)-linux-x64
	@echo "Done! Binary: ./$(BIN_DIR)/$(BINARY_NAME)-linux-x64"

# 跨平台编译 - Linux ARM64
build-linux-arm64: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for Linux ARM64..."
	bun build --compile --minify --target=bun-linux-arm64 $(ENTRYPOINT) --outfile $(BIN_DIR)/$(BINARY_NAME)-linux-arm64
	@echo "Done! Binary: ./$(BIN_DIR)/$(BINARY_NAME)-linux-arm64"

# 跨平台编译 - Windows x64
build-windows-x64: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for Windows x64..."
	bun build --compile --minify --target=bun-windows-x64 $(ENTRYPOINT) --outfile $(BIN_DIR)/$(BINARY_NAME)-win-x64
	@echo "Done! Binary: ./$(BIN_DIR)/$(BINARY_NAME)-win-x64.exe"

# 跨平台编译 - macOS x64
build-darwin-x64: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for macOS x64..."
	bun build --compile --minify --target=bun-darwin-x64 $(ENTRYPOINT) --outfile $(BIN_DIR)/$(BINARY_NAME)-darwin-x64
	@echo "Done! Binary: ./$(BIN_DIR)/$(BINARY_NAME)-darwin-x64"

# 跨平台编译 - macOS ARM64 (Apple Silicon)
build-darwin-arm64: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for macOS ARM64..."
	bun build --compile --minify --target=bun-darwin-arm64 $(ENTRYPOINT) --outfile $(BIN_DIR)/$(BINARY_NAME)-darwin-arm64
	@echo "Done! Binary: ./$(BIN_DIR)/$(BINARY_NAME)-darwin-arm64"

# 编译所有平台（交叉编译）
build-all: $(BIN_DIR)
	@echo "Building $(BINARY_NAME) v$(VERSION) for all platforms..."
	$(MAKE) build-linux-x64
	$(MAKE) build-linux-arm64
	$(MAKE) build-windows-x64
	$(MAKE) build-darwin-x64
	$(MAKE) build-darwin-arm64
	@echo ""
	@echo "All binaries built:"
	@ls -lh $(BIN_DIR)/$(BINARY_NAME)-*

# 清理编译产物
clean-binary:
	rm -rf $(BIN_DIR)/$(BINARY_NAME) $(BIN_DIR)/$(BINARY_NAME)-*

# ===========================================
# Main Commands
# ===========================================

onboard:
	bun run src/cli/commands.ts onboard

agent:
	bun run src/cli/commands.ts agent

run:
ifndef MSG
	@echo "Usage: make run MSG='Your message'"
	@echo "Example: make run MSG='Hello'"
	@exit 1
endif
	bun run src/cli/commands.ts agent -m "$(MSG)"

gateway:
	bun run src/cli/commands.ts gateway

status:
	bun run src/cli/commands.ts status

version:
	bun run src/cli/commands.ts --version

# ===========================================
# Cron Commands
# ===========================================

cron-list:
	bun run src/cli/commands.ts cron list

cron-add:
ifndef NAME
	@echo "Usage: make cron-add NAME='job name' MSG='message' EVERY=seconds"
	@echo "Example: make cron-add NAME='daily' MSG='Check weather' EVERY=3600"
	@exit 1
endif
ifndef MSG
	@echo "Usage: make cron-add NAME='job name' MSG='message' EVERY=seconds"
	@exit 1
endif
ifndef EVERY
	@echo "Usage: make cron-add NAME='job name' MSG='message' EVERY=seconds"
	@exit 1
endif
	bun run src/cli/commands.ts cron add -n "$(NAME)" -m "$(MSG)" -e $(EVERY)

cron-remove:
ifndef JOB_ID
	@echo "Usage: make cron-remove JOB_ID='job-id'"
	@exit 1
endif
	bun run src/cli/commands.ts cron remove $(JOB_ID)

cron-run:
ifndef JOB_ID
	@echo "Usage: make cron-run JOB_ID='job-id'"
	@exit 1
endif
	bun run src/cli/commands.ts cron run $(JOB_ID)

cron-enable:
ifndef JOB_ID
	@echo "Usage: make cron-enable JOB_ID='job-id'"
	@exit 1
endif
	bun run src/cli/commands.ts cron enable $(JOB_ID)

cron-disable:
ifndef JOB_ID
	@echo "Usage: make cron-disable JOB_ID='job-id'"
	@exit 1
endif
	bun run src/cli/commands.ts cron enable $(JOB_ID) -d
