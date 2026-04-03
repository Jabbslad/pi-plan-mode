# pi-plan-mode

Plan mode extension for [pi](https://github.com/badlogic/pi-mono) — explore and design before implementing.

## What it does

Plan mode forces the AI to **read and think before writing code**. When activated:

1. **Tools are restricted** to read-only (read, bash read-only, grep, find, ls)
2. **The agent explores** the codebase and writes a plan to a markdown file
3. **You review** the plan and approve, edit, or reject it
4. **Then implementation begins** with the approved plan as a guide

## Install

```bash
pi install pi-plan-mode
# or
pi install git:github.com/jabbslad/pi-plan-mode
```

## Usage

### Enter plan mode

```
/plan                    # Toggle plan mode on
/plan add authentication # Enter plan mode with a task description
Ctrl+Alt+P               # Keyboard shortcut
```

### In plan mode

The agent will:
- Explore the codebase with read-only tools
- Write a plan to `~/.config/pi/plans/{slug}.md`
- Call `ExitPlanMode` when ready for your review

### Approve the plan

When the agent presents its plan, you can:
- **Approve** — start implementing
- **Edit** — modify the plan, then approve
- **Reject** — send feedback, agent keeps planning

### View current plan

```
/plan          # Show current plan (when already in plan mode)
/plan open     # Open plan file in your editor
/todos         # Show plan step progress during execution
```

## How it works

- Plans are stored as markdown files in `~/.config/pi/plans/`
- Each session gets a unique slug (e.g., `fuzzy-tiger.md`)
- Plan state persists across session restarts and compaction
- The agent is instructed to enter plan mode proactively for complex tasks
