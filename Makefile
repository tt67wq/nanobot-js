.PHONY: help install build test clean run agent gateway onboard status cron-list cron-add cron-run version

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
