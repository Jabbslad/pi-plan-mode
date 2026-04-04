/**
 * Plan Mode Extension
 *
 * Structured workflow: explore → plan → approve → implement.
 * When enabled, tools are restricted to read-only + plan file writing.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle
 * - EnterPlanMode tool (agent-initiated, requires user approval)
 * - ExitPlanMode tool (plan approval: approve/edit/reject)
 * - Bash restricted to read-only commands
 * - Plan file management (unique slug per session)
 * - Session persistence (state survives restart/compaction)
 * - System prompt injection with plan mode instructions
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Key } from "@mariozechner/pi-tui";
import {
	type PlanModeState,
	createInitialState,
	ensurePlansDir,
	generateUniqueSlug,
	getPlanFilePath,
	isPlanFilePath,
	isSafeCommand,
	extractSessionName,
	readPlan,
	recoverPlanSlug,
	writePlan,
	DEFAULT_PLANS_DIR,
} from "../../lib/plans.js";

// ── Constants ────────────────────────────────────────────────────────

/**
 * Tools that require per-call gating in plan mode.
 * write/edit are allowed only for the plan file.
 * bash is allowed only for safe (read-only) commands.
 * Everything else passes through — enforcement is in the tool_call handler.
 */
const WRITE_TOOLS = new Set(["write", "edit"]);

/** Tools that are always allowed in plan mode without any checks */
const ALWAYS_ALLOWED = new Set(["read", "bash", "grep", "find", "ls", "EnterPlanMode", "ExitPlanMode"]);

/**
 * Tools explicitly blocked in plan mode.
 * All other tools (including unknown/future tools) are allowed through.
 * This is a safety blacklist — if a new destructive tool is added, add it here.
 */
const BLOCKED_IN_PLAN_MODE = new Set<string>([
	// Currently empty — write/edit and bash are gated per-call, not blocked outright.
	// Add tool names here to hard-block them in plan mode.
]);

// ── Extension ────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
	let state: PlanModeState = createInitialState();


	// ── Helpers ──────────────────────────────────────────────────────

	function getPlansDir(): string {
		return DEFAULT_PLANS_DIR;
	}

	/** Ensure a plan slug exists for this session, creating one if needed */
	function ensurePlanSlug(): string {
		if (!state.planSlug) {
			const plansDir = getPlansDir();
			state.planSlug = generateUniqueSlug(plansDir);
			state.planFilePath = getPlanFilePath(state.planSlug, plansDir);
		}
		return state.planSlug;
	}

	/** Get the plan file path, ensuring slug exists */
	function ensurePlanFilePath(): string {
		ensurePlanSlug();
		return state.planFilePath!;
	}

	/** Activate plan mode: all tools stay visible, enforcement is per-call in tool_call handler */
	function activatePlanMode(ctx: ExtensionContext): void {
		if (state.active) return;

		state.active = true;

		// Ensure plan file infrastructure
		ensurePlanSlug();
		ensurePlansDir(getPlansDir());

		// No setActiveTools() call — all tools remain visible.
		// The tool_call handler enforces read-only restrictions per-call.

		updateUI(ctx);
		persistState();
	}

	/** Deactivate plan mode */
	function deactivatePlanMode(ctx: ExtensionContext): void {
		if (!state.active) return;

		state.active = false;

		// No tool restoration needed — we never restricted the tool list.

		updateUI(ctx);
		persistState();
	}

	/** Update footer status and widget */
	function updateUI(ctx: ExtensionContext): void {
		if (state.active) {
			ctx.ui.setWidget("plan-mode", [
				ctx.ui.theme.fg("warning", "⏸  Plan Mode") +
					ctx.ui.theme.fg("muted", ` — ${state.planFilePath ?? "no plan file"}`),
			]);
		} else {
			ctx.ui.setWidget("plan-mode", undefined);
		}
	}

	/** Persist state to session for recovery */
	function persistState(): void {
		pi.appendEntry("plan-mode-state", {
			active: state.active,
			planSlug: state.planSlug,
			planFilePath: state.planFilePath,
		});
	}

	/** Check if a path is the plan file for this session */
	function checkIsPlanFile(path: string): boolean {
		if (!state.planFilePath) return false;
		return isPlanFilePath(path, state.planFilePath);
	}

	// ── Register CLI flag ───────────────────────────────────────────

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration with plan file)",
		type: "boolean",
		default: false,
	});

	// ── Register /plan command ──────────────────────────────────────

	pi.registerCommand("plan", {
		description: "Toggle plan mode or show current plan",
		handler: async (args, ctx) => {
			const trimmed = args?.trim();

			// /plan off — cancel plan mode without approval
			if (trimmed === "off") {
				if (!state.active) {
					ctx.ui.notify("Not in plan mode.", "warning");
					return;
				}
				deactivatePlanMode(ctx);
				ctx.ui.notify("Plan mode cancelled.", "info");
				return;
			}

			// /plan open — open plan file in $EDITOR or fallback to TUI editor
			if (trimmed === "open") {
				if (!state.planFilePath) {
					ctx.ui.notify("No plan file yet. Enter plan mode first.", "warning");
					return;
				}
				const content = readPlan(state.planSlug!, getPlansDir());
				if (!content) {
					ctx.ui.notify("Plan file is empty.", "info");
					return;
				}

				// Try $EDITOR/$VISUAL for full-screen editing experience
				const externalEditor = process.env.EDITOR || process.env.VISUAL;
				if (externalEditor) {
					ensurePlansDir(getPlansDir());
					const { execSync } = await import("node:child_process");
					try {
						execSync(`${externalEditor} ${state.planFilePath}`, { stdio: "inherit" });
						ctx.ui.notify("Plan file saved.", "success");
					} catch {
						ctx.ui.notify("Editor closed or failed to open.", "warning");
					}
				} else {
					// Fallback to TUI editor
					const edited = await ctx.ui.editor("Edit Plan:", content);
					if (edited !== undefined && edited !== content) {
						writePlan(state.planSlug!, edited, getPlansDir());
						ctx.ui.notify("Plan updated.", "success");
					}
				}
				return;
			}

			// /plan (no args, in plan mode) — show current plan
			if (!trimmed && state.active) {
				const content = readPlan(state.planSlug!, getPlansDir());
				if (content) {
					ctx.ui.notify(`Plan (${state.planSlug}):\n${content}`, "info");
				} else {
					ctx.ui.notify("Plan file is empty. The agent hasn't written a plan yet.", "info");
				}
				return;
			}

			// /plan (no args, not in plan mode) — enter plan mode
			if (!trimmed) {
				activatePlanMode(ctx);
				ctx.ui.notify("Plan mode enabled. Agent is restricted to read-only tools.", "info");
				return;
			}

			// /plan <description> — enter plan mode and send task
			activatePlanMode(ctx);
			ctx.ui.notify("Plan mode enabled.", "info");
			pi.sendUserMessage(trimmed, { deliverAs: "followUp" });
		},
	});

	// ── Register Ctrl+Alt+P shortcut ────────────────────────────────

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => {
			if (state.active) {
				deactivatePlanMode(ctx);
				ctx.ui.notify("Plan mode disabled.", "info");
			} else {
				activatePlanMode(ctx);
				ctx.ui.notify("Plan mode enabled.", "info");
			}
		},
	});

	// ── Register EnterPlanMode tool ─────────────────────────────────

	pi.registerTool({
		name: "EnterPlanMode",
		label: "Enter Plan Mode",
		description:
			"Enter plan mode to explore the codebase and design a plan before implementing. " +
			"In plan mode, only read-only tools are available plus writing to the plan file. " +
			"Use this for complex tasks that benefit from exploration and planning before implementation.",
		promptSnippet: "Enter read-only plan mode for exploration and design",
		promptGuidelines: [
			"For non-trivial tasks, consider entering plan mode first to explore and design before implementing.",
			"In plan mode, explore the codebase, understand the architecture, then write a plan and call ExitPlanMode.",
			"Do NOT call EnterPlanMode if you are already in plan mode. If the system prompt says you are in plan mode, you are already there.",
			"If the user asks a question during plan mode, answer it directly — do not call EnterPlanMode or ExitPlanMode.",
		],
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (state.active) {
				return {
					content: [
						{
							type: "text",
							text: `Already in plan mode. Plan file: ${ensurePlanFilePath()}\nContinue exploring and write your plan, then call ExitPlanMode when ready.`,
						},
					],
					details: { alreadyActive: true },
				};
			}

			// Require user approval before entering plan mode (PRD §2.1, §5.3)
			if (ctx.hasUI) {
				const approved = await ctx.ui.confirm(
					"Enter Plan Mode?",
					"The agent wants to enter plan mode (read-only exploration). Approve?",
				);
				if (!approved) {
					return {
						content: [
							{
								type: "text",
								text: "User declined to enter plan mode. Continue with normal implementation.",
							},
						],
						details: { approved: false },
					};
				}
			}

			activatePlanMode(ctx);

			const planPath = ensurePlanFilePath();

			return {
				content: [
					{
						type: "text",
						text: `Plan mode activated. You are now in read-only mode.

Your plan file: ${planPath}

Workflow:
1. Explore the codebase using read-only tools (read, bash, grep, find, ls)
2. Understand the architecture and relevant code
3. Write your implementation plan to the plan file using the write tool: ${planPath}
4. Call ExitPlanMode to present your plan for user approval

IMPORTANT:
- You can ONLY write to the plan file: ${planPath}
- All other write/edit operations are blocked
- Bash is restricted to read-only commands
- Write a clear, actionable plan with numbered steps`,
					},
				],
				details: { planSlug: state.planSlug, planFilePath: planPath },
			};
		},
	});

	// ── Register ExitPlanMode tool ──────────────────────────────────

	pi.registerTool({
		name: "ExitPlanMode",
		label: "Exit Plan Mode",
		description:
			"Present the plan for user approval and exit plan mode. " +
			"The user will review the plan and can approve or reject it. " +
			"Do NOT use this tool just to answer a user question — only call it when the plan is ready for review.",
		promptSnippet: "Present plan for approval and exit plan mode",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!state.active) {
				return {
					content: [{ type: "text", text: "Not currently in plan mode." }],
					details: { wasActive: false },
				};
			}

			// Read the plan from disk
			const planContent = readPlan(state.planSlug!, getPlansDir());

			if (!planContent || planContent.trim().length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No plan found in ${ensurePlanFilePath()}. Write your plan to the plan file first, then call ExitPlanMode again.`,
						},
					],
					details: { empty: true },
				};
			}

			if (!ctx.hasUI) {
				// Non-interactive mode: auto-approve
				deactivatePlanMode(ctx);
				return {
					content: [
						{
							type: "text",
							text: `Plan approved (non-interactive mode). Implement the following plan:\n\n${planContent}`,
						},
					],
					details: { approved: true, planContent },
				};
			}

			// Show plan content in terminal for easy reading
			ctx.ui.notify(`\n📋 Plan (${state.planSlug}):\n\n${planContent}\n\n📁 Plan file: ${ensurePlanFilePath()}\n💡 Use /plan open to edit the plan file directly`, "info");

			// Simple approve/reject
			const approved = await ctx.ui.confirm(
				"Approve this plan?",
				"Yes to implement, No to keep refining. Use /plan open to edit the file directly.",
			);

			// Handle Escape / dialog dismissal
			if (approved === undefined) {
				return {
					content: [
						{
							type: "text",
							text: `Plan review cancelled. Still in plan mode. Plan file: ${ensurePlanFilePath()}`,
						},
					],
					details: { approved: false, cancelled: true },
				};
			}

			if (approved) {
				// Re-read the plan in case user edited it via /plan open between notify and confirm
				const finalContent = readPlan(state.planSlug!, getPlansDir()) ?? planContent;
				deactivatePlanMode(ctx);
				pi.setSessionName(extractSessionName(finalContent));

				return {
					content: [
						{
							type: "text",
							text: `Plan approved! Implement the following plan:\n\n${finalContent}\n\nPlan file for reference: ${state.planFilePath}`,
						},
					],
					details: { approved: true, planContent: finalContent, planFilePath: state.planFilePath },
				};
			}

			// Rejected — ask for feedback
			const feedback = await ctx.ui.input("What should be changed?", "Describe changes (or leave empty)...");

			return {
				content: [
					{
						type: "text",
						text: feedback
							? `Plan not approved. User feedback: ${feedback}\n\nRevise the plan in ${ensurePlanFilePath()} and call ExitPlanMode again.\nThe user can also edit the plan directly with /plan open.`
							: `Plan not approved. Continue refining the plan in ${ensurePlanFilePath()} and call ExitPlanMode when ready.\nThe user can also edit the plan directly with /plan open.`,
					},
				],
				details: { approved: false, feedback },
			};
		},
	});

	// ── Block destructive tools in plan mode ────────────────────────

	pi.on("tool_call", async (event, _ctx) => {
		if (!state.active) return;

		// Always allow known safe tools
		if (ALWAYS_ALLOWED.has(event.toolName)) {
			// Bash needs per-call command check even though it's "allowed"
			if (isToolCallEventType("bash", event)) {
				const command = event.input.command;
				if (!isSafeCommand(command)) {
					return {
						block: true,
						reason: `Plan mode: destructive bash command blocked. Only read-only commands are allowed.\nCommand: ${command}\nUse /plan or Ctrl+Alt+P to exit plan mode first.`,
					};
				}
			}
			return;
		}

		// Hard-block explicitly blacklisted tools
		if (BLOCKED_IN_PLAN_MODE.has(event.toolName)) {
			return {
				block: true,
				reason: `Plan mode: tool "${event.toolName}" is blocked. Use /plan off or Ctrl+Alt+P to exit plan mode first.`,
			};
		}

		// Gate write/edit to plan file only
		if (WRITE_TOOLS.has(event.toolName)) {
			if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
				const path = event.input.path;
				if (path && checkIsPlanFile(path)) {
					return; // Allow writing to plan file
				}
				return {
					block: true,
					reason: `Plan mode: cannot ${event.toolName} to "${path}". Only the plan file can be written: ${state.planFilePath}`,
				};
			}
		}

		// Everything else (AskUserQuestion, future read-only tools, etc.) — allow through
	});

	// ── Filter stale plan-mode context messages ─────────────────────

	pi.on("context", async (event) => {
		// Only filter when plan mode is off and there are messages to filter
		if (state.active) return;

		const hasStaleMessages = event.messages.some((m) => {
			const msg = m as Record<string, unknown>;
			return msg.customType === "plan-mode-context";
		});

		if (!hasStaleMessages) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as Record<string, unknown>;
				return msg.customType !== "plan-mode-context";
			}),
		};
	});

	// ── Inject plan mode instructions into system prompt ────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		// When plan mode is off but a plan file exists, inject plan content
		// as a reference so the model has it after compaction.
		if (!state.active) {
			if (state.planSlug && state.planFilePath) {
				const planContent = readPlan(state.planSlug, getPlansDir());
				if (planContent && planContent.trim().length > 0) {
					return {
						message: {
							customType: "plan-file-reference",
							content: `[APPROVED PLAN]\nA plan was approved from a previous planning session.\nPlan file: ${state.planFilePath}\n\n${planContent}\n\nIf this plan is relevant to your current work and not yet complete, continue implementing it.`,
							display: false,
						},
					};
				}
			}
			return;
		}

		const planPath = ensurePlanFilePath();

		return {
			message: {
				customType: "plan-mode-context",
				content: `[PLAN MODE ACTIVE]
You are currently in PLAN MODE — a read-only exploration mode.

Your plan file: ${planPath}

RESTRICTIONS — you MUST NOT violate these, no exceptions:
- You MUST NOT edit or write to any file except your plan file: ${planPath}
- You MUST NOT run destructive bash commands (no git commit, npm install, rm, etc.)
- You MUST NOT attempt implementation until your plan is approved via ExitPlanMode
- You MUST write your plan and call ExitPlanMode BEFORE making any code changes
- Even if the user says "implement" or "do it", you MUST present the plan for approval first

IMPORTANT RULES:
- Do NOT call EnterPlanMode — you are ALREADY in plan mode
- If the user asks a question, answer it directly using read-only tools. Do NOT call ExitPlanMode just to answer a question.
- You can have normal conversations and answer questions while in plan mode
- Only call ExitPlanMode when your plan is complete and ready for user review
- If you need to clarify requirements or choose between approaches, use AskUserQuestion (if available) — do NOT use it for plan approval

## Iterative Planning Workflow

You are pair-planning with the user. Explore the code to build context, ask the user questions when you hit decisions you can't make alone, and write your findings into the plan file as you go. The plan file starts as a rough skeleton and gradually becomes the final plan.

### The Loop

Repeat this cycle until the plan is complete:

1. **Explore** — Use read, bash, grep, find, ls to read code. Look for existing functions, utilities, and patterns to reuse.
2. **Update the plan file** — After each discovery, immediately capture what you learned in ${planPath}. Don't wait until the end.
3. **Ask the user** — When you hit an ambiguity or decision you can't resolve from code alone, use AskUserQuestion (if available) or ask in text. Then go back to step 1.

### First Turn

Start by quickly scanning a few key files to form an initial understanding of the task scope. Then write a skeleton plan (headers and rough notes) and ask the user your first round of questions. Don't explore exhaustively before engaging the user.

### Asking Good Questions

- Never ask what you could find out by reading the code
- Batch related questions together (use multi-question AskUserQuestion calls when available)
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge case priorities
- Scale depth to the task — a vague feature request needs many rounds; a focused bug fix may need one or none

### Plan File Structure

Your plan file should be divided into clear sections using markdown headers. Fill out these sections as you go:
- Begin with a **Context** section: what is being changed and why
- Include only your recommended approach, not all alternatives
- Keep it concise enough to scan quickly, but detailed enough to execute
- Include the paths of critical files to be modified
- Reference existing functions and utilities you found that should be reused, with their file paths
- End with a **Verification** section: how to test the changes (run commands, tests, etc.)

### When to Converge

Your plan is ready when you've addressed all ambiguities and it covers: what to change, which files to modify, what existing code to reuse (with file paths), and how to verify the changes. Call ExitPlanMode when ready.

### Ending Your Turn

Your turn should only end by either:
- Using AskUserQuestion to gather more information from the user
- Calling ExitPlanMode when the plan is ready for approval
- Answering a direct question from the user

Do NOT use AskUserQuestion or text to ask about plan approval — use ExitPlanMode for that.
Do NOT attempt implementation until your plan is approved.`,
				display: false,
			},
			systemPrompt:
				event.systemPrompt +
				`\n\n[PLAN MODE] You are in plan mode. Only read-only tools are available. Write your plan to ${planPath} and call ExitPlanMode when ready.`,
		};
	});

	// ── Preserve plan state across compaction ───────────────────────

	pi.on("session_before_compact", async (_event, _ctx) => {
		// Plan state is already persisted via appendEntry (plan-mode-state entries).
		// The plan content lives on disk at planFilePath and survives compaction.
		// Let pi's default summarizer handle conversation compaction — don't replace it
		// with a static string that would lose all conversation context.
		// State recovery happens in session_start via recoverPlanSlug + entry scanning.
	});

	// ── Cleanup on session shutdown ─────────────────────────────────

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setWidget("plan-mode", undefined);
	});

	// ── Restore state on session start/resume ───────────────────────

	pi.on("session_start", async (_event, ctx) => {
		state = createInitialState();

		// Check --plan flag
		if (pi.getFlag("plan") === true) {
			activatePlanMode(ctx);
			return;
		}

		// Recover state from session entries
		const entries = ctx.sessionManager.getEntries();
		const recoveredSlug = recoverPlanSlug(
			entries as Array<{ type: string; customType?: string; data?: Record<string, unknown> }>,
		);

		if (recoveredSlug) {
			state.planSlug = recoveredSlug;
			state.planFilePath = getPlanFilePath(recoveredSlug, getPlansDir());
		}

		// Check if plan mode was active and restore it
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i] as { type: string; customType?: string; data?: Record<string, unknown> };
			if (entry.type === "custom" && entry.customType === "plan-mode-state" && entry.data) {
				if (entry.data.active === true) {
					state.active = true;
					state.planSlug = (entry.data.planSlug as string) ?? state.planSlug;
					state.planFilePath = (entry.data.planFilePath as string) ?? state.planFilePath;
					// No setActiveTools needed — tool_call handler enforces restrictions
				}
				break;
			}
		}

		updateUI(ctx);
	});
}
