# 🗺️ pi-plan-mode

**Think first, code second.**

[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/Jabbslad/pi-plan-mode)
[![pi package](https://img.shields.io/badge/pi-package-8A2BE2)](https://github.com/badlogic/pi-mono)

A plan mode extension for [pi](https://github.com/badlogic/pi-mono) that forces the AI to explore and design before writing a single line of code.

> 💡 **Why plan mode?** Without it, agents jump straight into implementation — often misunderstanding the codebase and making costly mistakes. Plan mode gives you a structured checkpoint: the AI reads everything first, writes a plan, and *you* approve it before any code changes happen.

## How It Works

```
/plan ──> explore ──> update plan ──> ask user ──> approve ──> implement
              ^                          │
              └──────────────────────────┘
```

The agent pair-plans with you iteratively:
1. **Explore** — reads code to build context
2. **Update the plan file** — writes findings incrementally (not all at the end)
3. **Ask you questions** — clarifies requirements, preferences, and tradeoffs
4. **Repeat** until the plan is ready, then presents it for your approval

## Quick Start

Add to your pi settings:

```json
{
  "packages": ["git:github.com/Jabbslad/pi-plan-mode"]
}
```

Then tell the agent what you want:

```
/plan add authentication with OAuth2 support
```

## Commands & Shortcuts

| Command | Description |
|---------|-------------|
| `/plan` | Enter plan mode (or show current plan if active) |
| `/plan <task>` | Enter plan mode with a task description |
| `/plan off` | Cancel plan mode without approval |
| `/plan open` | Edit the plan file in `$EDITOR` (or TUI fallback) |
| `Ctrl+Alt+P` | Toggle plan mode |
| `--plan` | CLI flag to start a session in plan mode |

The agent can also enter plan mode on its own for complex tasks — you'll be asked to approve first.

## Approval Flow

When the agent finishes planning and calls `ExitPlanMode`:

1. The plan is displayed in your terminal
2. You approve or reject
3. If rejected, you can provide feedback and the agent continues refining
4. Use `/plan open` at any time to edit the plan file directly in your editor

## Safety — Blacklist Enforcement

All tools remain visible in plan mode. Enforcement is **per-call** — destructive operations are blocked, everything else passes through:

| Allowed | Blocked |
|---------|---------|
| ✅ Read any file, grep, find, ls | ❌ Write/edit any file (except the plan file) |
| ✅ Read-only bash (`git status`, `cat`, `tree`…) | ❌ Destructive bash (`git push`, `rm`, `npm install`…) |
| ✅ Write to the plan file | ❌ Command chaining (`;`, `&&`, `\|\|`) |
| ✅ AskUserQuestion and other read-only tools | ❌ Redirects (`>`, `>>`) |

New tools automatically work in plan mode — no whitelist to maintain.

## Works with pi-ask-user

Install the optional [pi-ask-user](https://github.com/Jabbslad/pi-ask-user) companion package for structured multiple-choice questions during planning:

```json
{
  "packages": [
    "git:github.com/Jabbslad/pi-plan-mode",
    "git:github.com/Jabbslad/pi-ask-user"
  ]
}
```

The agent will use `AskUserQuestion` to clarify requirements and choose between approaches — with proper UI dialogs instead of freeform text.

## Plan File Persistence

- Plans are stored as markdown in `~/.config/pi/plans/`
- Each session gets a unique slug (e.g. `bold-tiger.md`)
- State persists across session restarts and compaction
- After a plan is approved, the plan content is re-injected on every turn so it survives conversation compaction
- Use `/plan open` to view or edit the plan at any time

## Development

```bash
npm install
npm test    # 145 tests
```

## License

MIT
