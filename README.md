# 🗺️ pi-plan-mode

**Think first, code second.**

[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/Jabbslad/pi-plan-mode)
[![pi package](https://img.shields.io/badge/pi-package-8A2BE2)](https://github.com/badlogic/pi-mono)

A plan mode extension for [pi](https://github.com/badlogic/pi-mono) that forces the AI to explore and design before writing a single line of code.

> 💡 **Why plan mode?** Without it, agents jump straight into implementation — often misunderstanding the codebase and making costly mistakes. Plan mode gives you a structured checkpoint: the AI reads everything first, writes a plan, and *you* approve it before any code changes happen.

## How It Works

```
┌─────────┐     ┌───────────┐     ┌─────────┐     ┌───────────┐     ┌─────────────┐
│  Enter   │ ──▶ │  Explore   │ ──▶ │  Plan   │ ──▶ │  Approve  │ ──▶ │  Implement  │
│          │     │  (read-    │     │  (write │     │  (review  │     │  (full tool │
│  /plan   │     │   only)    │     │  .md)   │     │  & edit)  │     │   access)   │
└─────────┘     └───────────┘     └─────────┘     └───────────┘     └─────────────┘
```

## Quick Start

```bash
pi install pi-plan-mode
```

Then just tell the agent what you want:

```
/plan add authentication with OAuth2 support
```

The agent enters read-only mode, explores your codebase, writes a plan, and asks you to approve before implementing.

## Commands & Shortcuts

| Command | Description |
|---------|-------------|
| `/plan` | Enter plan mode (or show current plan if active) |
| `/plan <task>` | Enter plan mode with a task description |
| `/plan off` | Cancel plan mode without approval |
| `/plan open` | Edit the current plan in your editor |
| `Ctrl+Alt+P` | Toggle plan mode (keyboard shortcut) |

The agent can also enter plan mode on its own for complex tasks — you'll be asked to approve first.

## Approval Flow

When the agent finishes planning and calls `ExitPlanMode`, you choose:

| Option | What happens |
|--------|-------------|
| ✅ **Approve** | Exit plan mode, start implementing |
| ✏️ **Edit first** | Open the plan in your editor, then approve |
| 🔄 **Keep planning** | Give feedback, agent continues refining |

## Safety

In plan mode, the agent is sandboxed to read-only operations:

| | Action |
|---|--------|
| ✅ | Read any file, grep, find, ls |
| ✅ | Run read-only bash (`git status`, `cat`, `tree`…) |
| ✅ | Write to the plan file only |
| ❌ | Edit or create any other files |
| ❌ | Destructive bash (`git push`, `rm`, `npm install`…) |

## Under the Hood

- Plans are stored as markdown in `~/.config/pi/plans/`
- Each session gets a unique slug (e.g. `bold-tiger.md`)
- State persists across session restarts and compaction
- The agent is prompted to enter plan mode proactively for complex tasks
- `--plan` flag starts a session directly in plan mode
