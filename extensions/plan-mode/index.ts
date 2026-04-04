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
 * Tools available in plan mode.
 * Includes read-only tools + write/edit (gated by plan-file check in tool_call) + plan tools.
 */
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "write", "edit", "EnterPlanMode", "ExitPlanMode", "AskUserQuestion"];

/** Write tools that need plan-file path validation */
const WRITE_TOOLS = ["write", "edit"];

// ── Extension ────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
	let state: PlanModeState = createInitialState();
	let savedActiveTools: string[] | null = null;

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

	/** Activate plan mode: save current tools and restrict to read-only */
	function activatePlanMode(ctx: ExtensionContext): void {
		if (state.active) return;

		// Save current tool set for restoration
		savedActiveTools = pi.getActiveTools().map((t) => t.name);
		state.active = true;

		// Ensure plan file infrastructure
		ensurePlanSlug();
		ensurePlansDir(getPlansDir());

		// Restrict to plan mode tools
		pi.setActiveTools(PLAN_MODE_TOOLS);

		updateUI(ctx);
		persistState();
	}

	/** Deactivate plan mode: restore all tools */
	function deactivatePlanMode(ctx: ExtensionContext): void {
		if (!state.active) return;

		state.active = false;
		savedActiveTools = null;

		// Always restore ALL tools — savedActiveTools can be stale if other
		// extensions registered tools after we entered plan mode.
		pi.setActiveTools(pi.getAllTools().map((t) => t.name));

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
			savedActiveTools: savedActiveTools,
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

		// Allow ExitPlanMode and EnterPlanMode always
		if (event.toolName === "ExitPlanMode" || event.toolName === "EnterPlanMode") return;

		// Allow write/edit ONLY to the plan file
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

		// Restrict bash to read-only commands
		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode: destructive bash command blocked. Only read-only commands are allowed.\nCommand: ${command}\nUse /plan or Ctrl+Alt+P to exit plan mode first.`,
				};
			}
		}

		// Allow read-only tools
		const readOnlyTools = ["read", "grep", "find", "ls"];
		if (readOnlyTools.includes(event.toolName)) return;

		// Block everything else not in PLAN_MODE_TOOLS
		if (!PLAN_MODE_TOOLS.includes(event.toolName)) {
			return {
				block: true,
				reason: `Plan mode: tool "${event.toolName}" is not available. Only read-only tools and writing to the plan file are allowed.`,
			};
		}
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
		// When plan mode is off, don't modify anything — the plan content
		// is already in the ExitPlanMode tool result in the conversation.
		if (!state.active) return;

		const planPath = ensurePlanFilePath();

		return {
			message: {
				customType: "plan-mode-context",
				content: `[PLAN MODE ACTIVE]
You are currently in PLAN MODE — a read-only exploration mode.

Your plan file: ${planPath}

RESTRICTIONS:
- You can only use read-only tools: read, bash (read-only commands), grep, find, ls
- You can write ONLY to your plan file: ${planPath}
- All other file writes/edits are blocked
- Bash is restricted to read-only commands (no git commit, npm install, rm, etc.)

IMPORTANT RULES:
- Do NOT call EnterPlanMode — you are ALREADY in plan mode
- If the user asks a question, answer it directly using read-only tools. Do NOT call ExitPlanMode just to answer a question.
- You can have normal conversations and answer questions while in plan mode
- Only call ExitPlanMode when your plan is complete and ready for user review
- If you need to clarify requirements or choose between approaches, use AskUserQuestion (if available) — do NOT use it for plan approval

WORKFLOW:
1. Explore the codebase with read-only tools to understand the architecture
2. Design your implementation approach
3. Write a clear, numbered plan to your plan file: ${planPath}
4. When the plan is ready, call ExitPlanMode to present it for user approval

DO NOT attempt implementation until your plan is approved.
Write your plan as markdown with numbered steps, each describing a specific change.`,
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
		savedActiveTools = null;

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

		// Check if plan mode was active and restore full state
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i] as { type: string; customType?: string; data?: Record<string, unknown> };
			if (entry.type === "custom" && entry.customType === "plan-mode-state" && entry.data) {
				if (entry.data.active === true) {
					state.active = true;
					state.planSlug = (entry.data.planSlug as string) ?? state.planSlug;
					state.planFilePath = (entry.data.planFilePath as string) ?? state.planFilePath;
					// Restore saved tools for later deactivation
					if (Array.isArray(entry.data.savedActiveTools)) {
						savedActiveTools = entry.data.savedActiveTools as string[];
					}
					pi.setActiveTools(PLAN_MODE_TOOLS);
				}
				break;
			}
		}

		updateUI(ctx);
	});
}
