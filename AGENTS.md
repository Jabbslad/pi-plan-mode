# AGENTS.md

## Project Overview

This is **pi-plan-mode** — a plan mode extension for pi agent. It provides a structured workflow where the AI explores the codebase and designs a plan before implementing, giving the user control to approve/reject before any code changes happen.

## Architecture

### Extension Structure
```
pi-plan-mode/
├── extensions/
│   └── plan-mode/
│       └── index.ts          # Extension entry point (tools, commands, events)
├── lib/
│   └── plans.ts              # Plan file management (slug, I/O, safety, state)
├── tests/
│   └── plans.test.ts         # Unit tests for plan utilities (145 tests)
├── PRD.md                    # Product requirements document
├── package.json              # Pi package manifest
└── AGENTS.md                 # This file
```

### Key Concepts
- **Plan Mode**: A read-only exploration mode where the agent can only read files, run safe bash commands, and write to a plan file
- **Plan File**: A markdown file at `~/.config/pi/plans/{slug}.md` where the agent writes its plan
- **Enter Plan Mode**: Via `/plan` command, `Ctrl+Alt+P` shortcut, or `EnterPlanMode` tool (agent-initiated, user-approved)
- **Exit Plan Mode**: Agent calls `ExitPlanMode` → plan shown in terminal → user approves or rejects → optional feedback on rejection
- **Blacklist Enforcement**: All tools stay visible; destructive operations are blocked per-call by the `tool_call` handler (not by hiding tools)

### Tool Enforcement Model

Plan mode uses a **blacklist/per-call enforcement** model (inspired by Claude Code's permission system), NOT a whitelist:

1. **All tools remain visible** — `setActiveTools()` is never called in plan mode. Every registered tool (built-in, extension, future) appears in the system prompt.
2. **Enforcement is per-call** in the `tool_call` event handler:
   - `ALWAYS_ALLOWED` set: `read`, `bash`, `grep`, `find`, `ls`, `EnterPlanMode`, `ExitPlanMode` — pass through (bash still validates commands)
   - `WRITE_TOOLS` set: `write`, `edit` — allowed **only** for the plan file path, blocked for everything else
   - `BLOCKED_IN_PLAN_MODE` set: hard-blocked tools (currently empty — add future destructive tools here)
   - **Everything else**: allowed through (e.g., `AskUserQuestion`, any future read-only tool)
3. **Bash safety**: Even though bash is in `ALWAYS_ALLOWED`, each command is validated against `isSafeCommand()` which checks for destructive commands, redirects, and chaining

**Why blacklist over whitelist?** New tools (like `AskUserQuestion`) automatically work in plan mode without needing to update a whitelist. This was a real problem — the original whitelist model blocked `AskUserQuestion` until it was manually added.

### Extension API Usage

This extension uses pi's extension API:
- `pi.registerTool()` — `EnterPlanMode` and `ExitPlanMode` tools
- `pi.registerCommand()` — `/plan` command (with subcommands: `off`, `open`)
- `pi.registerShortcut()` — `Ctrl+Alt+P` toggle
- `pi.on("tool_call")` — per-call enforcement of plan mode restrictions
- `pi.on("before_agent_start")` — inject plan mode instructions into system prompt + context message
- `pi.on("context")` — filter stale plan-mode context messages when not in plan mode
- `pi.on("session_start")` — restore plan mode state on resume/reload
- `pi.on("session_shutdown")` — cleanup UI widgets
- `pi.appendEntry()` — persist plan mode state across sessions
- `ctx.ui.confirm` — plan approval dialog
- `ctx.ui.input` — rejection feedback
- `ctx.ui.notify` — plan display in terminal
- `ctx.ui.editor` — fallback plan editing (when `$EDITOR` not set)

### Plan Mode Behavior During Q&A

When the user asks questions during plan mode, the agent should:
- Answer directly using read-only tools — do NOT call `EnterPlanMode` or `ExitPlanMode`
- Use `AskUserQuestion` (if available via pi-ask-user package) for structured clarification questions
- Only call `ExitPlanMode` when the plan is complete and ready for review
- NOT use `AskUserQuestion` for plan approval — that's what `ExitPlanMode` is for

These rules are enforced via `promptGuidelines` on the tools and the `before_agent_start` context injection.

### Companion Package: pi-ask-user

The `AskUserQuestion` tool is provided by a separate package ([pi-ask-user](https://github.com/Jabbslad/pi-ask-user)). It is optional — plan mode works without it. When installed:
- The tool is automatically available in plan mode (no whitelist entry needed)
- Plan mode instructions mention it for clarifying requirements
- The companion skill (`skills/ask-user/SKILL.md`) provides detailed usage guidelines

### Key Files

| File | Purpose |
|------|---------|
| `extensions/plan-mode/index.ts` | Main extension: tools, commands, events, enforcement |
| `lib/plans.ts` | Pure functions: slug generation, plan I/O, bash safety, path validation, state recovery |
| `tests/plans.test.ts` | 145 unit tests for all `lib/plans.ts` functions |
| `PRD.md` | Product requirements document |

### Bash Safety (`lib/plans.ts`)

The `isSafeCommand()` function validates bash commands in plan mode:
- **Safe patterns**: `cat`, `grep`, `find`, `ls`, `git status/log/diff`, `npm list`, etc.
- **Destructive commands**: `rm`, `mv`, `chmod`, `sudo`, `git commit/push`, `npm install`, etc.
- **Chaining blocked**: `;`, `&&`, `||`, `$()`, backticks — prevents hiding destructive commands
- **Redirects blocked**: `>`, `>>` — prevents file writes via bash
- **Pipe-aware**: Each pipe segment is checked independently; first command must be a known safe command

### Session Persistence

Plan mode state survives restarts and compaction:
- `pi.appendEntry("plan-mode-state", {...})` — persists active/slug/path on every state change
- `session_start` handler — scans entries backwards to recover the latest state
- Plan file content lives on disk at `~/.config/pi/plans/{slug}.md` — survives compaction
- `recoverPlanSlug()` in `lib/plans.ts` — pure function for slug recovery from entries

### Reference
- Pi extension docs: see `pi` docs for `extensions.md`
- Pi TUI docs: see `pi` docs for `tui.md`
- Claude Code plan mode: see `PRD.md` for research notes
