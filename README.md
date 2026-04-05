# pi-plan-mode

Think first, code second.

[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/Jabbslad/pi-plan-mode)
[![pi package](https://img.shields.io/badge/pi-package-8A2BE2)](https://github.com/badlogic/pi-mono)

`pi-plan-mode` is a [pi](https://github.com/badlogic/pi-mono) extension that adds a planning step before implementation. The agent explores the codebase, writes a plan, and waits for approval before it changes code.

## Why use it?

Agents often start coding too early. That works when the task is small and the codebase is familiar. It goes badly when requirements are fuzzy or the repo has a lot of local context.

Plan mode slows that down on purpose. It gives the agent a read-only planning phase, keeps notes in a plan file, and puts a clear approval step between research and implementation.

## How it works

```
/plan ──> explore ──> update plan ──> ask user ──> approve ──> implement
              ^                          │
              └──────────────────────────┘
```

The usual loop looks like this:

1. Explore the codebase and gather context
2. Update the plan file as findings come in
3. Ask questions when requirements or tradeoffs are unclear
4. Repeat until the plan is ready for review
5. Present the plan for approval before implementation starts

## Quick start

Add the package to your pi settings:

```json
{
  "packages": ["git:github.com/Jabbslad/pi-plan-mode"]
}
```

Then start plan mode with a task:

```
/plan add authentication with OAuth2 support
```

## Commands and shortcuts

| Command | Description |
|---------|-------------|
| `/plan` | Enter plan mode, or show the current plan if plan mode is already active |
| `/plan <task>` | Enter plan mode with a task description |
| `/plan off` | Cancel plan mode without approval |
| `/plan open` | Edit the plan file in `$EDITOR`, or use the TUI fallback |
| `/plan fresh` | Start a new session seeded from the approved plan |
| `/plan status` | Show current plan mode status and plan availability |
| `/plan review` | Show the current plan in review format without approval |
| `/plan clear` | Clear the current plan file contents |
| `/plan resume` | Re-enter plan mode using the existing plan file |
| `Ctrl+Alt+P` | Toggle plan mode |
| `--plan` | Start a session in plan mode from the CLI |

The agent can also request plan mode for more complex work. You still have to approve that transition.

## Approval flow

When the agent finishes planning and calls `ExitPlanMode`:

1. The plan is shown in the terminal
2. You approve it or reject it
3. If you reject it, you can leave feedback and the agent keeps refining the plan
4. You can use `/plan open` at any time to edit the plan directly
5. If you approve it, you can either keep working in the current session or run `/plan fresh` to start a new one with the approved plan preloaded

You can also use:

- `/plan status` to inspect the current planning state
- `/plan review` to read the current plan without approving it
- `/plan clear` to wipe the current plan file
- `/plan resume` to re-enter plan mode with the existing plan

## Safety model

All tools stay visible in plan mode. Restrictions are enforced per call.

| Allowed | Blocked |
|---------|---------|
| ✅ Read any file, grep, find, ls | ❌ Write or edit any file except the plan file |
| ✅ Read-only bash such as `git status`, `cat`, and `tree` | ❌ Destructive bash such as `git push`, `rm`, and `npm install` |
| ✅ Write to the plan file | ❌ Command chaining such as `;`, `&&`, and `\|\|` |
| ✅ `AskUserQuestion` and other read-only tools | ❌ Redirects such as `>` and `>>` |

This blacklist approach means new read-only tools work in plan mode without maintaining a separate whitelist.

## Works with pi-ask-user

If you install the optional [pi-ask-user](https://github.com/Jabbslad/pi-ask-user) package, the agent can ask structured multiple-choice questions during planning.

```json
{
  "packages": [
    "git:github.com/Jabbslad/pi-plan-mode",
    "git:github.com/Jabbslad/pi-ask-user"
  ]
}
```

That gives you proper UI prompts for clarifying requirements and choosing between approaches.

## Plan file persistence

- Plans are stored as markdown files in `~/.config/pi/plans/`
- Each session gets a unique slug such as `bold-tiger.md`
- State survives session restarts and compaction
- After approval, the plan content is re-injected on every turn so it survives conversation compaction
- Use `/plan open` to view or edit the plan whenever you want

## Development

```bash
npm install
npm test
```

## License

MIT
