# PRD: Plan Mode Extension for Pi Agent

## 1. Overview

### What is Plan Mode?

Plan Mode is a structured workflow feature in Claude Code that forces the AI to **explore and design before implementing**. When activated, the agent enters a read-only mode where it can only explore the codebase and write to a single plan file. Once the plan is complete, the user reviews, approves (or edits/rejects) it, and the agent then proceeds with implementation.

### Why Build This?

- **Prevents premature implementation** — the agent won't start coding before understanding the codebase
- **User control** — users review and approve the plan before any changes are made
- **Better outcomes for complex tasks** — exploration + design → fewer mistakes, better architectural decisions
- **Transparency** — users can see exactly what the agent intends to do

### Key Concepts from Claude Code

| Concept | Description |
|---------|-------------|
| **Permission Modes** | `default`, `plan`, `auto`, `acceptEdits`, `bypassPermissions` — plan mode is one of these |
| **Plan File** | A markdown file stored on disk (e.g., `~/.config/pi/plans/{slug}.md`) |
| **Enter Plan Mode** | Triggered by user command (`/plan`) or by the agent proactively (via a tool) |
| **Exit Plan Mode** | Agent calls `ExitPlanMode` tool → user sees plan → approves/edits/rejects |
| **Plan Agent** | A read-only sub-agent optimized for exploration and architecture design |
| **Tool Restriction** | In plan mode, only read-only tools + writing to the plan file are allowed |

---

## 2. User Experience

### 2.1 Entering Plan Mode

**Three entry points:**

1. **User command: `/plan [description]`**
   - If not in plan mode → enables it
   - If given a description (e.g., `/plan add authentication`) → enables plan mode AND sends the description as a query
   - If already in plan mode → shows the current plan content
   - `/plan open` → opens the plan file in the user's external editor

2. **Agent-initiated (proactive)**
   - For non-trivial tasks, the agent autonomously decides to enter plan mode
   - Calls `EnterPlanMode` tool → requires user approval (a deferred tool call)
   - User sees a prompt: "Claude wants to enter plan mode" → Approve / Reject

3. **Default mode setting**
   - User can configure plan mode as their default mode (always plan before implementing)

### 2.2 In Plan Mode

While in plan mode, the agent:

- ✅ **Can read** any files (FileRead, Grep, Glob, Bash read-only commands)
- ✅ **Can write** to the session's plan file only (e.g., `~/.config/pi/plans/fuzzy-tiger.md`)
- ✅ **Can spawn** read-only exploration sub-agents
- ❌ **Cannot** edit/write/create any other files
- ❌ **Cannot** run destructive bash commands (git commit, npm install, rm, etc.)
- ❌ **Cannot** spawn implementation sub-agents

**Workflow phases (5-phase, default):**

1. **Initial Understanding** — Explore codebase with read-only tools, optionally spawn explore agents in parallel
2. **Design** — Optionally spawn plan agents to design the implementation approach
3. **Review** — Read critical files, ask user clarifying questions if needed
4. **Final Plan** — Write the completed plan to the plan file
5. **Exit** — Call `ExitPlanMode` to present plan for approval

**Workflow phases (interview mode, alternative):**

An iterative loop:
1. Explore → 2. Update plan file → 3. Ask user questions → Repeat until complete → Exit

### 2.3 Exiting Plan Mode (Plan Approval)

When the agent calls `ExitPlanMode`:

1. The plan content is read from the plan file (V2) or from tool input (V1)
2. Plan is displayed in a bordered markdown view titled "Ready to code?"
3. User can edit the plan via Ctrl+G (opens in external editor)
4. User is presented with approval options:

**Approval options (from Claude Code's `buildPlanApprovalOptions`):**

| Option | Effect |
|--------|--------|
| **"Yes, clear context and auto-accept edits"** | Clears conversation, starts fresh with plan as initial message, auto-accepts file edits |
| **"Yes, clear context and auto mode"** | Same clear-context but with full auto mode (feature-gated) |
| **"Yes, and auto-accept edits"** | Keeps context, elevates to auto-accept edits mode |
| **"Yes, manually approve edits"** | Keeps context, restores to default mode |
| **"No, keep planning"** | Stays in plan mode — shows input field for feedback ("Tell Claude what to change") |
| **Shift+Tab shortcut** | Quick-approve with auto-accept edits |

**Clear-context flow (key innovation):**
When a clear-context option is chosen:
1. The plan is packaged as an initial message: `"Implement the following plan:\n\n${plan}"`
2. The current conversation is abandoned
3. A fresh conversation starts with the plan as the first message
4. This maximizes context window for implementation

**After approval:**
- Permission mode transitions to the chosen mode (`default`, `acceptEdits`, `auto`, etc.)
- The plan file path is communicated to the agent for reference
- Session is auto-named from plan content (first 1000 chars → Haiku generates name)
- If the Agent/Team tool is available, the agent is hinted to consider parallelizing work

### 2.4 Plan Persistence

- Plans survive **session compaction** via a `plan_mode` attachment injected during both regular and partial compactions (checks `mode === 'plan'`, includes plan file path and existence status)
- Plans survive **session resume** by recovering the plan slug from message history (3 recovery paths: ExitPlanMode tool_use input, `planContent` field on user messages, `plan_file_reference` attachment)
- Plans can be **forked** when sessions are forked (new slug, copied content)
- Plan files are simple markdown — user can view/edit them outside the agent
- In remote sessions (CCR), plan content is periodically snapshotted to the transcript for durability

### 2.5 Ancillary UX Details

- **Prompt suggestions are suppressed** during plan mode (the agent should be exploring, not suggesting)
- **Tips system** nudges users who haven't tried plan mode (shown after 7+ days without use)
- **TUI indicator**: Plan mode shows a pause icon (⏸) with `planMode` color theme
- **Session naming**: On plan approval, session is auto-named from plan content using Haiku model

---

## 3. Technical Design for Pi Agent Extension

### 3.1 Extension Structure

```
pi-plan-mode/
├── extension.json          # Pi extension manifest
├── src/
│   ├── index.ts            # Extension entry point
│   ├── tools/
│   │   ├── enterPlanMode.ts    # EnterPlanMode tool
│   │   └── exitPlanMode.ts     # ExitPlanMode tool
│   ├── commands/
│   │   └── plan.ts             # /plan command
│   ├── plans.ts                # Plan file management (slug, read/write)
│   └── planMode.ts             # Plan mode state management
└── README.md
```

### 3.2 Core Components

#### 3.2.1 Plan Mode State

A session-level state that tracks:

```typescript
interface PlanModeState {
  /** Whether plan mode is currently active */
  active: boolean
  /** The permission mode before entering plan mode (to restore on exit) */
  previousMode: string | null
  /** The plan file slug for this session */
  planSlug: string | null
  /** Path to the plan file */
  planFilePath: string | null
}
```

**Key behaviors:**
- Entering plan mode saves the current permission mode as `previousMode`
- Exiting plan mode restores `previousMode`
- The plan slug is generated lazily on first access and cached per session

#### 3.2.2 Plan File Management (`plans.ts`)

```typescript
// Configuration
const DEFAULT_PLANS_DIR = '~/.config/pi/plans/'  // or project-local via settings

// Core functions
function getPlanSlug(sessionId: string): string       // Generate/cache unique word-slug
function getPlanFilePath(sessionId: string): string    // Full path to plan .md file
function getPlan(sessionId: string): string | null     // Read plan content from disk
function writePlan(sessionId: string, content: string): void  // Write plan to disk
function getPlansDirectory(): string                   // Resolve plans directory
```

**Slug generation:**
- Generate a two-word slug (e.g., `fuzzy-tiger`, `bold-river`)
- Check for filename conflicts, retry up to 10 times
- Cache slug per session ID

#### 3.2.3 EnterPlanMode Tool

```typescript
{
  name: 'EnterPlanMode',
  description: 'Enter plan mode to explore and design before implementing',
  inputSchema: {},  // No parameters
  requiresApproval: true,  // User must approve
  
  async execute(context) {
    // 1. Save current mode
    // 2. Switch to plan mode (restrict tools)
    // 3. Return instructions for the agent
  }
}
```

**Tool result message** instructs the agent to:
- Explore the codebase with read-only tools
- Design an implementation approach
- Write the plan to the plan file
- Call ExitPlanMode when ready

#### 3.2.4 ExitPlanMode Tool

```typescript
{
  name: 'ExitPlanMode',
  description: 'Present plan for user approval and exit plan mode',
  inputSchema: {
    allowedPrompts?: Array<{ tool: string, prompt: string }>  // Optional: semantic permissions to request
  },
  requiresApproval: true,  // User must approve/reject
  
  async execute(input, context) {
    // 1. Read plan from disk
    // 2. Present to user for approval
    // 3. On approve: restore previous mode, return plan content
    // 4. On reject: stay in plan mode, return feedback
  }
}
```

**Approval UI should show:**
- The full plan content (rendered markdown)
- Approve / Edit / Reject buttons
- The plan file path for reference

#### 3.2.5 /plan Command

```typescript
// /plan [description]  - Enter plan mode, optionally with a task description
// /plan                - Show current plan (if already in plan mode)
// /plan open           - Open plan file in external editor
```

#### 3.2.6 Tool Filtering in Plan Mode

When plan mode is active, the extension must enforce:

```typescript
function isToolAllowedInPlanMode(toolName: string, toolInput: any): boolean {
  // Always allowed: read-only tools
  const readOnlyTools = ['Read', 'Bash(read-only)', 'Grep', 'Glob', 'find', 'ls']
  
  // Conditionally allowed: file write/edit ONLY to the plan file
  if (toolName === 'Write' || toolName === 'Edit') {
    return isSessionPlanFile(toolInput.path)
  }
  
  // Bash: only read-only commands
  if (toolName === 'Bash') {
    return isReadOnlyBashCommand(toolInput.command)
  }
  
  // ExitPlanMode: always allowed (it's how you leave)
  if (toolName === 'ExitPlanMode') return true
  
  return readOnlyTools.includes(toolName)
}
```

### 3.3 Integration Points with Pi Agent

| Pi Agent Feature | Plan Mode Integration |
|-----------------|----------------------|
| **Tool permission system** | Plan mode acts as a permission mode that restricts write tools |
| **Session state** | Plan mode state stored in session, survives restarts |
| **Commands** | Register `/plan` command |
| **Tools** | Register `EnterPlanMode` and `ExitPlanMode` tools |
| **System prompt** | Inject plan mode instructions when active (what the agent can/cannot do) |
| **Context compaction** | Inject `plan_mode` attachment during compaction to preserve plan state |
| **Sub-agents** | Plan agents are read-only; implementation agents cannot be spawned in plan mode |
| **Prompt suggestions** | Suppress suggestions while in plan mode |
| **Session naming** | Auto-name session from plan content on approval |
| **Clear context** | Support clear-context approval flow (fresh conversation with plan as initial message) |

### 3.4 System Prompt Injection

When plan mode is active, inject into the system prompt:

```
You are currently in PLAN MODE. You MUST NOT make any edits (except the plan file), 
run any non-readonly tools, or make any changes to the codebase.

Your plan file is at: {planFilePath}

Workflow:
1. Explore the codebase using read-only tools
2. Design your implementation approach
3. Write your plan to the plan file
4. Call ExitPlanMode to present your plan for approval

DO NOT proceed with implementation until your plan is approved.
```

After plan approval, inject the approved plan content so the agent can reference it.

---

## 4. Scope & Phasing

### Phase 1: MVP (Core Plan Mode)

- [x] `/plan` command to enter plan mode
- [x] `EnterPlanMode` tool (agent-initiated, with user approval)
- [x] `ExitPlanMode` tool (plan approval flow: approve/reject)
- [x] Plan file management (slug generation, read/write, plans directory)
- [x] Tool restriction enforcement in plan mode
- [x] System prompt injection for plan mode instructions
- [x] Mode restoration on exit

### Phase 2: Enhanced UX

- [ ] `/plan open` — open plan in external editor
- [ ] Plan editing during approval (Ctrl+G to edit in external editor)
- [ ] Plan persistence across context compaction (inject plan_mode attachment)
- [ ] Plan recovery on session resume
- [ ] Visual indicator in TUI showing plan mode is active (pause icon + color)
- [ ] Clear-context approval flow (start fresh conversation with plan as initial message)
- [ ] Session auto-naming from plan content
- [ ] Suppress prompt suggestions during plan mode
- [ ] Multiple approval modes (manual, auto-accept-edits, auto)

### Phase 3: Advanced Features

- [ ] Plan agents (read-only sub-agents for exploration)
- [ ] Explore agents (parallel codebase exploration)
- [ ] Interview-style iterative planning workflow
- [ ] Configurable plans directory (project-local via settings)
- [ ] Plan forking for forked sessions
- [ ] Prompt-based permissions (agent requests semantic bash permissions like "run tests")

---

## 5. Key Design Decisions

### 5.1 Plan File vs In-Memory Plan

**Decision: File-based (like Claude Code)**

Rationale:
- Survives context compaction and session restarts
- User can view/edit outside the agent
- Natural integration with `/plan open` (external editor)
- Simple recovery mechanism (just read from disk)

### 5.2 Tool Restriction Approach

**Decision: Filter at the permission/tool-execution layer**

Rationale:
- Cleaner than modifying each tool
- Central enforcement point
- Easy to audit what's allowed/blocked
- Matches Pi's existing permission model

### 5.3 Approval UX

**Decision: Deferred tool pattern (like Claude Code's `shouldDefer`)**

Both `EnterPlanMode` and `ExitPlanMode` should pause execution and require explicit user input before proceeding. This maps to Pi's tool approval mechanism.

**Key UX insight from Claude Code:** The exit approval is the most complex UI in the entire plan mode system (768 lines in Claude Code). It supports:
- Multiple approval modes with different permission levels
- In-line plan editing before approval
- Clear-context vs keep-context paths
- Keyboard shortcuts (Shift+Tab to quick-approve)
- Rejection with typed feedback

For Pi's MVP, start with approve/reject and add the clear-context and elevated-permission flows in Phase 2.

### 5.5 Clear-Context on Approval

**Decision: Implement in Phase 2**

Claude Code's most valuable approval option is "clear context and implement" — it starts a fresh conversation with the plan as the initial message, maximizing context window for implementation. This is especially valuable after long exploration sessions that consume significant context. Pi should support this pattern.

### 5.4 Proactive Plan Mode Entry

**Decision: Include in system prompt but make it configurable**

The agent should be instructed to enter plan mode for complex tasks, but users should be able to:
- Disable proactive entry
- Set plan mode as the default mode
- Configure the complexity threshold

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Plan approval rate | >70% first-attempt approval |
| Implementation quality | Fewer errors in plan-mode sessions vs direct implementation |
| User satisfaction | Positive feedback on plan-mode workflow |
| Plan mode adoption | >30% of complex tasks use plan mode |

---

## 7. Open Questions

1. **How should plan mode interact with Pi's existing team/multi-agent features?** Claude Code has teammate plan approval via mailbox — should Pi support this?
2. **Should there be a plan template system?** Users could define plan structure templates for different task types.
3. **How aggressive should proactive plan mode entry be?** Claude Code varies this by user type (internal vs external) — Pi should probably default to less aggressive.
4. **Should plans be version-controlled?** Git-tracking plan files could enable plan history and diffing.

---

## Appendix A: Claude Code Plan Mode Architecture Reference

### File Locations in Claude Code

| File | Purpose |
|------|---------|
| `src/tools/EnterPlanModeTool/EnterPlanModeTool.ts` | Enter plan mode tool |
| `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` | Exit plan mode tool (V2, current) |
| `src/utils/plans.ts` | Plan file management (slug, paths, read/write, recovery) |
| `src/utils/planModeV2.ts` | V2 utilities (agent counts, feature gates) |
| `src/commands/plan/plan.tsx` | `/plan` command |
| `src/tools/AgentTool/built-in/planAgent.ts` | Plan sub-agent definition |
| `src/components/permissions/EnterPlanModePermissionRequest/` | Enter plan mode approval UI |
| `src/components/permissions/ExitPlanModePermissionRequest/` | Exit plan mode approval UI |
| `src/components/messages/PlanApprovalMessage.tsx` | Plan approval display |
| `src/services/compact/compact.ts` | Plan mode attachment for compaction |

### State Fields in Claude Code

| Field | Type | Purpose |
|-------|------|---------|
| `toolPermissionContext.mode` | `'default' \| 'plan' \| 'auto' \| ...` | Current permission mode |
| `toolPermissionContext.prePlanMode` | `PermissionMode` | Mode to restore on exit |
| `needsPlanModeExitAttachment` | `boolean` | Flag to send plan context after exit |
| `hasExitedPlanModeInSession` | `boolean` | Tracks if plan mode was exited |

### Plan File Naming

- Main session: `{plansDir}/{word-slug}.md` (e.g., `fuzzy-tiger.md`)
- Sub-agent: `{plansDir}/{word-slug}-agent-{agentId}.md`
- Default directory: `~/.claude/plans/`
- Configurable via `settings.plansDirectory` (relative to project root)
