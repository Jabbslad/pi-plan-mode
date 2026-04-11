/**
 * Plan file management utilities.
 *
 * Pure functions for slug generation, plan file I/O, and plan recovery.
 * No SDK imports — fully unit-testable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, normalize } from "node:path";

// Re-export bash safety functions from the dedicated module
export { isSafeCommand, extractCommandName } from "./bash-safety.js";

// ── Slug generation ──────────────────────────────────────────────────

const ADJECTIVES = [
	"bold",
	"calm",
	"cool",
	"dark",
	"deep",
	"fast",
	"fine",
	"firm",
	"flat",
	"free",
	"full",
	"glad",
	"gold",
	"good",
	"gray",
	"keen",
	"kind",
	"last",
	"lean",
	"long",
	"loud",
	"mild",
	"neat",
	"next",
	"nice",
	"pale",
	"pure",
	"rare",
	"real",
	"rich",
	"ripe",
	"safe",
	"slim",
	"soft",
	"sure",
	"tall",
	"thin",
	"true",
	"vast",
	"warm",
	"wide",
	"wild",
	"wise",
	"worn",
	"blue",
	"fair",
	"open",
	"even",
	"late",
	"live",
	"lazy",
	"tiny",
	"high",
	"icy",
	"dry",
	"raw",
	"red",
	"shy",
	"tan",
	"wry",
	"dim",
	"fit",
	"hot",
	"odd",
	"old",
	"wet",
];

const NOUNS = [
	"bear",
	"bird",
	"boat",
	"bolt",
	"bone",
	"book",
	"cape",
	"cave",
	"claw",
	"coin",
	"core",
	"cove",
	"crow",
	"dawn",
	"deer",
	"dove",
	"drum",
	"dusk",
	"dust",
	"edge",
	"fern",
	"fire",
	"fish",
	"fist",
	"flux",
	"foam",
	"ford",
	"fork",
	"frog",
	"gale",
	"gate",
	"gaze",
	"glen",
	"glow",
	"gust",
	"hare",
	"harp",
	"hawk",
	"haze",
	"helm",
	"hill",
	"hive",
	"horn",
	"jade",
	"kelp",
	"knot",
	"lake",
	"lark",
	"leaf",
	"lime",
	"lion",
	"lynx",
	"mare",
	"mist",
	"moon",
	"moss",
	"moth",
	"muse",
	"nest",
	"opal",
	"palm",
	"path",
	"peak",
	"pine",
	"pond",
	"rain",
	"reef",
	"ring",
	"rock",
	"root",
	"rose",
	"sage",
	"sand",
	"seal",
	"snow",
	"star",
	"swan",
	"tarn",
	"tide",
	"tree",
	"vale",
	"veil",
	"vine",
	"wave",
	"weed",
	"well",
	"wind",
	"wing",
	"wolf",
	"wren",
	"yarn",
];

/** Default directory for plan files */
export const DEFAULT_PLANS_DIR = join(homedir(), ".config", "pi", "plans");

/**
 * Generate a random two-word slug (e.g. "bold-tiger").
 * Optionally provide a random function for testing.
 */
export function generateSlug(random: () => number = Math.random): string {
	const adj = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(random() * NOUNS.length)];
	return `${adj}-${noun}`;
}

/**
 * Generate a unique slug that doesn't conflict with existing plan files.
 * Retries up to maxRetries times.
 */
export function generateUniqueSlug(
	plansDir: string = DEFAULT_PLANS_DIR,
	maxRetries: number = 10,
	random: () => number = Math.random,
): string {
	for (let i = 0; i < maxRetries; i++) {
		const slug = generateSlug(random);
		const filePath = join(plansDir, `${slug}.md`);
		if (!existsSync(filePath)) {
			return slug;
		}
	}
	// Fallback: append timestamp
	const slug = generateSlug(random);
	return `${slug}-${Date.now()}`;
}

// ── Plan file I/O ────────────────────────────────────────────────────

/** Get the full path to a plan file */
export function getPlanFilePath(slug: string, plansDir: string = DEFAULT_PLANS_DIR): string {
	return join(plansDir, `${slug}.md`);
}

/** Ensure the plans directory exists */
export function ensurePlansDir(plansDir: string = DEFAULT_PLANS_DIR): void {
	mkdirSync(plansDir, { recursive: true });
}

/** Read plan content from disk. Returns null if file doesn't exist. */
export function readPlan(slug: string, plansDir: string = DEFAULT_PLANS_DIR): string | null {
	const filePath = getPlanFilePath(slug, plansDir);
	try {
		return readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/** Write plan content to disk. Creates directory if needed. */
export function writePlan(slug: string, content: string, plansDir: string = DEFAULT_PLANS_DIR): void {
	ensurePlansDir(plansDir);
	const filePath = getPlanFilePath(slug, plansDir);
	writeFileSync(filePath, content, "utf-8");
}

/** Check if a plan file exists */
export function planExists(slug: string, plansDir: string = DEFAULT_PLANS_DIR): boolean {
	return existsSync(getPlanFilePath(slug, plansDir));
}

// ── Bash safety is now in lib/bash-safety.ts ─────────────────────
// isSafeCommand and extractCommandName are re-exported at the top of this file.
// All bash safety constants and logic have moved to the dedicated module.

// ── Plan state for session persistence ───────────────────────────────

export interface PlanModeState {
	/** Whether plan mode is currently active */
	active: boolean;
	/** The plan file slug for this session */
	planSlug: string | null;
	/** Path to the plan file */
	planFilePath: string | null;
	/** Most recent plan-mode lifecycle transition */
	lastTransition: "entered" | "approved" | "cancelled" | null;
	/** Path to the most recently approved plan file */
	lastApprovedPlanFilePath: string | null;
	/** Whether plan mode has been exited at least once in this session (for re-entry guidance) */
	hasExitedPlanModeInSession: boolean;
}

/**
 * Check if a given path refers to the plan file.
 * Normalizes both paths for comparison (handles ~, relative paths, etc.)
 */
export function isPlanFilePath(path: string, planFilePath: string): boolean {
	const home = process.env.HOME ?? homedir();
	const normalizedPath = resolve(path.replace(/^~/, home));
	const normalizedTarget = resolve(planFilePath.replace(/^~/, home));
	return normalizedPath === normalizedTarget;
}

/**
 * Extract a session name from plan content.
 * Uses the first non-empty line, stripping markdown heading markers, truncated to 60 chars.
 */
export function extractSessionName(planContent: string): string {
	const firstLine = planContent.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "Plan";
	return firstLine.replace(/^#+\s*/, "").slice(0, 60) || "Plan";
}

/** Create an initial (inactive) plan mode state */
export function createInitialState(): PlanModeState {
	return {
		active: false,
		planSlug: null,
		planFilePath: null,
		lastTransition: null,
		lastApprovedPlanFilePath: null,
		hasExitedPlanModeInSession: false,
	};
}

// ── Plan recovery from session entries ───────────────────────────────

/**
 * Attempt to recover plan slug from session entries.
 * Scans for plan-mode-state custom entries, EnterPlanMode/ExitPlanMode tool uses, etc.
 */
export function recoverPlanSlug(entries: Array<{ type: string; customType?: string; data?: Record<string, unknown> }>): string | null {
	// Walk backwards to find the most recent plan-mode-state entry
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === "plan-mode-state" && entry.data) {
			const slug = entry.data.planSlug;
			if (typeof slug === "string") return slug;
		}
	}
	return null;
}
