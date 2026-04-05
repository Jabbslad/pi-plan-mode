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
		state.lastTransition = "entered";

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
			lastTransition: state.lastTransition,
			lastApprovedPlanFilePath: state.lastApprovedPlanFilePath,
		});
	}

	/** Check if a path is the plan file for this session */
	function checkIsPlanFile(path: string): boolean {
		if (!state.planFilePath) return false;
		return isPlanFilePath(path, state.planFilePath);
	}

	function buildPlanReviewText(planContent: string, planPath: string): string {
		return `📋 Ready to implement?\n\nReview this plan before implementation begins.\n\nPlan slug: ${state.planSlug ?? "(unsaved)"}\nPlan file: ${planPath}\n\n--- BEGIN PLAN ---\n${planContent}\n--- END PLAN ---\n\nHow to proceed:\n- Choose Yes to approve the plan and begin implementation\n- Choose No to keep planning in the current session\n- Use /plan open if you want to edit the plan directly before approving`;
	}

	function buildApprovedPlanText(planContent: string, planPath: string, edited: boolean, interactive: boolean): string {
		const approvalLabel = interactive ? "Plan approved." : "Plan approved in non-interactive mode.";
		const reviewNote = edited
			? "The approved version includes edits made during review.\n\n"
			: "";
		const freshSessionHint = interactive
			? "If you want a clean implementation handoff, use /plan fresh to start a new session seeded from this approved plan.\n\n"
			: "";
		return `${approvalLabel}\nImplementation may now begin.\n\nPlan file: ${planPath}\n\n${reviewNote}${freshSessionHint}Implement the following plan:\n\n${planContent}`;
	}

	function buildFreshSessionPrompt(planContent: string, planPath: string): string {
		return `Implement the following approved plan.\n\nPlan file for reference: ${planPath}\n\n${planContent}`;
	}

	function buildPlanStatusText(): string {
		const planContent = state.planSlug ? readPlan(state.planSlug, getPlansDir()) : null;
		const hasPlanContent = Boolean(planContent && planContent.trim().length > 0);
		const hasApprovedPlan = Boolean(state.lastApprovedPlanFilePath && hasPlanContent);
		return `Plan mode status\n\nActive: ${state.active ? "yes" : "no"}\nPlan slug: ${state.planSlug ?? "none"}\nPlan file: ${state.planFilePath ?? "none"}\nPlan content present: ${hasPlanContent ? "yes" : "no"}\nApproved plan available for /plan fresh: ${hasApprovedPlan ? "yes" : "no"}`;
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

			// /plan fresh — create a new session seeded from the approved plan
			if (trimmed === "fresh") {
				if (state.active) {
					ctx.ui.notify("Finish or cancel plan mode before starting a fresh session.", "warning");
					return;
				}
				if (!state.planSlug || !state.lastApprovedPlanFilePath) {
					ctx.ui.notify("No approved plan is available yet. Approve a plan first.", "warning");
					return;
				}
				const planContent = readPlan(state.planSlug, getPlansDir());
				if (!planContent || planContent.trim().length === 0) {
					ctx.ui.notify("The approved plan file is empty or missing.", "warning");
					return;
				}

				const currentSessionFile = ctx.sessionManager.getSessionFile();
				const prompt = buildFreshSessionPrompt(planContent, state.lastApprovedPlanFilePath);
				const result = await ctx.newSession({
					parentSession: currentSessionFile,
				});
				if (result.cancelled) {
					ctx.ui.notify("Fresh session creation cancelled.", "info");
					return;
				}

				ctx.ui.setEditorText(prompt);
				ctx.ui.notify("Fresh session ready. Review the seeded implementation prompt and submit when ready.", "success");
				return;
			}

			// /plan status — show plan mode state
			if (trimmed === "status") {
				ctx.ui.notify(buildPlanStatusText(), "info");
				return;
			}

			// /plan review — show current plan in review format without approval
			if (trimmed === "review") {
				if (!state.planSlug || !state.planFilePath) {
					ctx.ui.notify("No plan file yet. Start with /plan or /plan <task> first.", "warning");
					return;
				}
				const content = readPlan(state.planSlug, getPlansDir());
				if (!content || content.trim().length === 0) {
					ctx.ui.notify("Plan file is empty.", "info");
					return;
				}
				ctx.ui.notify(buildPlanReviewText(content, state.planFilePath), "info");
				return;
			}

			// /plan clear — clear current plan file contents after confirmation
			if (trimmed === "clear") {
				if (!state.planSlug || !state.planFilePath) {
					ctx.ui.notify("No plan file yet. Start with /plan or /plan <task> first.", "warning");
					return;
				}
				const currentContent = readPlan(state.planSlug, getPlansDir());
				if (!currentContent || currentContent.length === 0) {
					ctx.ui.notify("Plan file is already empty.", "info");
					return;
				}
				if (ctx.hasUI) {
					const confirmed = await ctx.ui.confirm(
						"Clear current plan?",
						"This will erase the current plan file contents but keep the same plan session and file path.",
					);
					if (!confirmed) {
						ctx.ui.notify("Plan clear cancelled.", "info");
						return;
					}
				}
				writePlan(state.planSlug, "", getPlansDir());
				state.lastTransition = "cancelled";
				state.lastApprovedPlanFilePath = null;
				persistState();
				ctx.ui.notify("Plan file cleared.", "success");
				return;
			}

			// /plan resume — re-enter plan mode using the existing plan file
			if (trimmed === "resume") {
				if (state.active) {
					ctx.ui.notify("Plan mode is already active.", "info");
					return;
				}
				if (!state.planSlug || !state.planFilePath) {
					ctx.ui.notify("No existing planning session found. Start with /plan or /plan <task> first.", "warning");
					return;
				}
				activatePlanMode(ctx);
				ctx.ui.notify(`Plan mode resumed. Plan file: ${state.planFilePath}`, "success");
				return;
			}
				if (state.active) {
					ctx.ui.notify("Finish or cancel plan mode before starting a fresh session.", "warning");
					return;
				}
				if (!state.planSlug || !state.lastApprovedPlanFilePath) {
					ctx.ui.notify("No approved plan is available yet. Approve a plan first.", "warning");
					return;
				}
				const planContent = readPlan(state.planSlug, getPlansDir());
				if (!planContent || planContent.trim().length === 0) {
					ctx.ui.notify("The approved plan file is empty or missing.", "warning");
					return;
				}

				const currentSessionFile = ctx.sessionManager.getSessionFile();
				const prompt = buildFreshSessionPrompt(planContent, state.lastApprovedPlanFilePath);
				const result = await ctx.newSession({
					parentSession: currentSessionFile,
				});
				if (result.cancelled) {
					ctx.ui.notify("Fresh session creation cancelled.", "info");
					return;
				}

				ctx.ui.setEditorText(prompt);
				ctx.ui.notify("Fresh session ready. Review the seeded implementation prompt and submit when ready.", "success");
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
			"In plan mode, explore the codebase, write your plan incrementally, ask only user-answerable questions, then call ExitPlanMode when the plan is ready.",
			"Do NOT call EnterPlanMode if you are already in plan mode. If the system prompt says you are in plan mode, you are already there.",
			"If the user asks a question during plan mode, answer it directly — do not call EnterPlanMode or ExitPlanMode just to respond.",
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
					"The agent wants to switch into read-only planning mode to explore the codebase and prepare a plan before making changes. Approve?",
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
		promptGuidelines: [
			"Only call ExitPlanMode when the plan file is complete enough for the user to review.",
			"Do NOT ask for plan approval in plain text or via AskUserQuestion — use ExitPlanMode for approval.",
			"If the user rejects the plan, stay in plan mode, revise the plan file, and call ExitPlanMode again when ready.",
		],
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!state.active) {
				return {
					content: [{ type: "text", text: "Not currently in plan mode." }],
					details: { wasActive: false },
				};
			}

			const planPath = ensurePlanFilePath();
			const planContent = readPlan(state.planSlug!, getPlansDir());

			if (!planContent || planContent.trim().length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No plan found in ${planPath}. Write your plan to the plan file first, then call ExitPlanMode again.`,
						},
					],
					details: { empty: true },
				};
			}

			if (!ctx.hasUI) {
				state.lastTransition = "approved";
				state.lastApprovedPlanFilePath = planPath;
				pi.appendEntry("plan-mode-exit", {
					approved: true,
					planSlug: state.planSlug,
					planFilePath: planPath,
				});
				deactivatePlanMode(ctx);
				return {
					content: [
						{
							type: "text",
							text: buildApprovedPlanText(planContent, planPath, false, false),
						},
					],
					details: { approved: true, planContent, planFilePath: planPath, editedDuringReview: false },
				};
			}

			ctx.ui.notify(buildPlanReviewText(planContent, planPath), "info");

			const approved = await ctx.ui.confirm(
				"Approve this plan?",
				"Yes approves the plan and allows implementation to begin. No keeps plan mode active so the plan can be revised. Use /plan open to edit the file before approving.",
			);

			if (approved === undefined) {
				return {
					content: [
						{
							type: "text",
							text: `Plan review cancelled. Still in plan mode. Plan file: ${planPath}`,
						},
					],
					details: { approved: false, cancelled: true },
				};
			}

			if (approved) {
				const finalContent = readPlan(state.planSlug!, getPlansDir()) ?? planContent;
				const editedDuringReview = finalContent !== planContent;
				state.lastTransition = "approved";
				state.lastApprovedPlanFilePath = planPath;
				pi.appendEntry("plan-mode-exit", {
					approved: true,
					planSlug: state.planSlug,
					planFilePath: planPath,
				});
				deactivatePlanMode(ctx);
				pi.setSessionName(extractSessionName(finalContent));

				return {
					content: [
						{
							type: "text",
							text: buildApprovedPlanText(finalContent, planPath, editedDuringReview, true),
						},
					],
					details: {
						approved: true,
						planContent: finalContent,
						planFilePath: planPath,
						editedDuringReview,
					},
				};
			}

			state.lastTransition = "cancelled";
			persistState();
			const feedback = await ctx.ui.input(
				"What should change before implementation begins?",
				"Describe the changes you want, or leave empty and edit with /plan open...",
			);

			return {
				content: [
					{
						type: "text",
						text: feedback
							? `Plan not approved yet. User feedback: ${feedback}\n\nRevise the plan in ${planPath}, then call ExitPlanMode again when it is ready for another review. Use /plan open if you want to edit the plan file directly before re-reviewing.`
							: `Plan not approved yet. Continue refining the plan in ${planPath}, then call ExitPlanMode again when it is ready for another review. Use /plan open if you want to edit the file directly before re-reviewing.`,
					},
				],
				details: { approved: false, feedback, planFilePath: planPath },
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
			return msg.customType === "plan-mode-context" || msg.customType === "plan-mode-exit-context";
		});

		if (!hasStaleMessages) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as Record<string, unknown>;
				return msg.customType !== "plan-mode-context" && msg.customType !== "plan-mode-exit-context";
			}),
		};
	});

	// ── Inject plan mode instructions into system prompt ────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		// When plan mode is off but a plan file exists, inject plan content
		// as a reference so the model has it after compaction.
		if (!state.active) {
			if (state.lastTransition === "approved" && state.lastApprovedPlanFilePath) {
				const transitionPath = state.lastApprovedPlanFilePath;
				state.lastTransition = null;
				persistState();
				return {
					message: {
						customType: "plan-mode-exit-context",
						content: `[PLAN MODE APPROVED]\nPlan mode is no longer active. The user approved the plan.\nImplementation may now begin.\nApproved plan file: ${transitionPath}\nFollow the approved plan while implementing.`,
						display: false,
					},
				};
			}
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
- Do NOT ask for plan approval in plain text or with AskUserQuestion — use ExitPlanMode for approval
- If you need to clarify requirements or choose between approaches, use AskUserQuestion (if available) — do NOT use it for plan approval

## Iterative Planning Workflow

You are pair-planning with the user. Explore the code to build context, ask the user questions when you hit decisions you can't make alone, and write your findings into the plan file as you go. The plan file starts as a rough skeleton and gradually becomes the final plan.

### The Loop

Repeat this cycle until the plan is complete:

1. **Explore** — Use read, bash, grep, find, ls to read code. Look for existing functions, utilities, and patterns to reuse. For large tasks spanning multiple areas, you can use team_dispatch with explore agents to search in parallel (if available) — use 1 agent for focused tasks, up to 3 for broad exploration. For straightforward queries, direct tools are simpler.
2. **Update the plan file** — After each discovery, immediately capture what you learned in ${planPath}. Don't wait until the end.
3. **Ask the user** — When you hit an ambiguity or decision you can't resolve from code alone, use AskUserQuestion (if available) or ask in text. Then go back to step 1.

### First Turn

Start by quickly scanning a few key files to form an initial understanding of the task scope. Then write a skeleton plan (headers and rough notes) and ask the user your first round of questions. Don't explore exhaustively before engaging the user.

### Asking Good Questions

- Never ask what you could find out by reading the code
- Batch related questions together (use multi-question AskUserQuestion calls when available)
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge case priorities
- Scale depth to the task — a vague feature request needs many rounds; a focused bug fix may need one or none
- Ask only user-answerable questions; do not ask the user to do code exploration for you

### Using Agents for Exploration (if available)

When team_dispatch and explore agents are available, use them for large-scope tasks:
- Dispatch up to 3 explore agents in parallel, each with a specific search focus
- Example: one agent searches for existing implementations, another explores related components, a third investigates test patterns
- Use 1 agent when the task is isolated to known files or you're making a small change
- Skip agents entirely for simple tasks — direct read/grep/find is faster
- After agents report back, synthesize their findings into the plan file
- You can also dispatch a planner agent to help design the approach based on exploration results

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

Prefer direct tools for small or localized tasks.
Use agents only when the task is broad enough to justify parallel exploration.
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
				state.lastTransition = (entry.data.lastTransition as "entered" | "approved" | "cancelled" | null) ?? state.lastTransition;
				state.lastApprovedPlanFilePath = (entry.data.lastApprovedPlanFilePath as string | null) ?? state.lastApprovedPlanFilePath;
				break;
			}
		}

		updateUI(ctx);
	});
}
