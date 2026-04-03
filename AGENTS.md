# AGENTS.md

## Project Overview

This is **pi-plan-mode** — a plan mode extension for pi agent. It provides a structured workflow where the AI explores the codebase and designs a plan before implementing, giving the user control to approve/edit/reject before any code changes happen.

## Architecture

### Extension Structure
```
pi-plan-mode/
├── extensions/
│   └── plan-mode/
│       └── index.ts          # Extension entry point
├── lib/
│   └── plans.ts              # Plan file management (slug, read/write)
├── tests/
│   └── plans.test.ts         # Unit tests for plan utilities
├── PRD.md                    # Product requirements document
├── package.json              # Pi package manifest
└── AGENTS.md                 # This file
```

### Key Concepts
- **Plan Mode**: A permission mode that restricts tools to read-only + plan file writing
- **Plan File**: A markdown file at `~/.config/pi/plans/{slug}.md` where the agent writes its plan
- **Enter Plan Mode**: Via `/plan` command or `EnterPlanMode` tool (agent-initiated, user-approved)
- **Exit Plan Mode**: Agent calls `ExitPlanMode` → user reviews plan → approve/edit/reject

### Extension API
This extension uses pi's extension API:
- `pi.registerTool()` — EnterPlanMode and ExitPlanMode tools
- `pi.registerCommand()` — /plan command
- `pi.registerShortcut()` — Ctrl+Alt+P toggle
- `pi.setActiveTools()` — restrict to read-only tools in plan mode
- `pi.on("tool_call")` — block destructive bash commands in plan mode
- `pi.on("before_agent_start")` — inject plan mode instructions
- `pi.on("session_start")` — restore plan mode state on resume
- `pi.on("session_before_compact")` — preserve plan state across compaction
- `pi.appendEntry()` — persist plan mode state
- `ctx.ui.select/confirm/editor` — plan approval UI

### Reference
- Pi extension docs: see `pi` docs for extensions.md
- Existing plan mode example: `~/.nvm/versions/node/v25.2.1/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/plan-mode/`
- Claude Code plan mode research: see PRD.md
