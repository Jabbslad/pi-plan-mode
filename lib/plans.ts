/**
 * Plan file management utilities.
 *
 * Pure functions for slug generation, plan file I/O, and plan recovery.
 * No SDK imports — fully unit-testable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, normalize } from "node:path";

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

// ── Bash command safety ──────────────────────────────────────────────

/**
 * Destructive command names — checked against the FIRST WORD of each pipe segment only.
 * This avoids false positives like `grep rm file.txt` or `cat chmod.md`.
 */
const DESTRUCTIVE_COMMANDS = new Set([
	"rm", "rmdir", "mv", "cp", "mkdir", "touch",
	"chmod", "chown", "chgrp", "ln", "tee",
	"truncate", "dd", "shred",
	"sudo", "su",
	"kill", "pkill", "killall",
	"reboot", "shutdown",
	"vi", "vim", "nano", "emacs", "code", "subl",
]);

/**
 * Destructive multi-word command patterns — checked against the full pipe segment
 * starting from the command name. These need regex because they involve subcommands.
 */
const DESTRUCTIVE_COMMAND_PATTERNS = [
	/^\s*npm\s+(install|uninstall|update|ci|link|publish)/i,
	/^\s*yarn\s+(add|remove|install|publish)/i,
	/^\s*pnpm\s+(add|remove|install|publish)/i,
	/^\s*pip\s+(install|uninstall)/i,
	/^\s*apt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/^\s*brew\s+(install|uninstall|upgrade)/i,
	/^\s*git\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/^\s*systemctl\s+(start|stop|restart|enable|disable)/i,
	/^\s*service\s+\S+\s+(start|stop|restart)/i,
];

/**
 * Redirect patterns checked against the full command string.
 * Uses negative lookbehind/lookahead to avoid matching fd redirects (2>&1, 2>/dev/null).
 */
const REDIRECT_PATTERNS = [
	/(?<![\d&])>(?!>|&)/, // stdout redirect > but not >> or >& or 2> or &>
	/>>/,                  // append redirect >>
];

/** Safe read-only commands allowed in plan mode */
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*exa\b/,
];

/** Patterns that indicate command chaining/subshells which could hide destructive commands */
const CHAINING_PATTERNS = [
	/;/,           // semicolons: cmd1; cmd2
	/&&/,          // AND chains: cmd1 && cmd2
	/\|\|/,        // OR chains: cmd1 || cmd2
	/\$\(/,        // command substitution: $(cmd)
	/`[^`]*`/,     // backtick substitution: `cmd`
];

/**
 * Extract the command name (first word) from a command string.
 * Handles leading whitespace and returns lowercase.
 */
export function extractCommandName(command: string): string {
	const trimmed = command.trim();
	const match = trimmed.match(/^(\S+)/);
	return match ? match[1].toLowerCase() : "";
}

/**
 * Check if a pipe segment contains a destructive command.
 * Checks the command name against the blocklist and patterns against full segment.
 */
function isDestructiveSegment(segment: string): boolean {
	const cmdName = extractCommandName(segment);
	if (DESTRUCTIVE_COMMANDS.has(cmdName)) return true;
	return DESTRUCTIVE_COMMAND_PATTERNS.some((p) => p.test(segment));
}

/**
 * Check if a bash command is safe for plan mode.
 * Must match a safe pattern, NOT match any destructive pattern,
 * and NOT use command chaining operators that could hide destructive commands.
 */
export function isSafeCommand(command: string): boolean {
	// Block command chaining that could hide destructive operations
	for (const pattern of CHAINING_PATTERNS) {
		if (pattern.test(command)) return false;
	}

	// Check for dangerous redirect operators in the full command
	for (const pattern of REDIRECT_PATTERNS) {
		if (pattern.test(command)) return false;
	}

	// Check each part of piped commands
	const parts = command.split(/\s*\|\s*/);
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		if (isDestructiveSegment(trimmed)) return false;
	}
	// The first command must be a known safe command
	const firstPart = parts[0]?.trim();
	if (!firstPart) return false;
	return SAFE_PATTERNS.some((p) => p.test(firstPart));
}

// ── Plan state for session persistence ───────────────────────────────

export interface PlanModeState {
	/** Whether plan mode is currently active */
	active: boolean;
	/** The plan file slug for this session */
	planSlug: string | null;
	/** Path to the plan file */
	planFilePath: string | null;
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
