import type { ValidationResult } from "./types.js";
import { extractCommandName } from "./utils.js";

export const DESTRUCTIVE_COMMANDS = new Set([
	"rm",
	"rmdir",
	"mv",
	"cp",
	"mkdir",
	"touch",
	"chmod",
	"chown",
	"chgrp",
	"ln",
	"tee",
	"truncate",
	"dd",
	"shred",
	"sudo",
	"su",
	"kill",
	"pkill",
	"killall",
	"reboot",
	"shutdown",
	"vi",
	"vim",
	"nano",
	"emacs",
	"code",
	"subl",
]);

export const DESTRUCTIVE_COMMAND_PATTERNS = [
	/^\s*npm\s+(install|uninstall|update|ci|link|publish)/i,
	/^\s*yarn\s+(add|remove|install|publish)/i,
	/^\s*pnpm\s+(add|remove|install|publish)/i,
	/^\s*pip\s+(install|uninstall)/i,
	/^\s*apt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/^\s*brew\s+(install|uninstall|upgrade)/i,
	/^\s*git\s+(add|commit|push|pull|merge(?!(?:-base|-info-tree|-independent)\s)|rebase|reset|checkout|branch\s+-[dD]|stash(?!\s+(list|show))|cherry-pick|revert|init|clone)/i,
	/^\s*systemctl\s+(start|stop|restart|enable|disable)/i,
	/^\s*service\s+\S+\s+(start|stop|restart)/i,
];

export const REDIRECT_PATTERNS = [
	/(?<![\d&])>(?!>|&)/,
	/>>/,
];

export const CHAINING_PATTERNS = [/;/, /&&/, /\|\|/, /\$\(/, /`[^`]*`/];

export function isDestructiveSegment(segment: string): boolean {
	const cmdName = extractCommandName(segment);
	if (DESTRUCTIVE_COMMANDS.has(cmdName)) return true;
	return DESTRUCTIVE_COMMAND_PATTERNS.some((p) => p.test(segment));
}

function walkUnquoted(raw: string, cb: (ch: string, next: string | undefined, index: number) => boolean): boolean {
	let inSingle = false;
	let inDouble = false;
	let escaped = false;

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === undefined) continue;

		if (escaped) {
			escaped = false;
			continue;
		}

		if (ch === "\\" && !inSingle) {
			escaped = true;
			continue;
		}

		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			continue;
		}

		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			continue;
		}

		if (inSingle || inDouble) continue;
		if (cb(ch, raw[i + 1], i)) return true;
	}

	return false;
}

function containsExpandableDollar(raw: string): boolean {
	return walkUnquoted(raw, (ch, next) => {
		if (ch !== "$") return false;
		if (!next) return true;
		return /[A-Za-z_@*#?!$0-9\-({]/.test(next);
	});
}

function containsBraceExpansion(raw: string): boolean {
	return walkUnquoted(raw, (ch, _next, index) => {
		if (ch !== "{") return false;
		const closeIndex = raw.indexOf("}", index + 1);
		if (closeIndex === -1) return false;
		const body = raw.slice(index + 1, closeIndex);
		return body.includes(",") || body.includes("..");
	});
}

export function validateGlobalGuards(raw: string): ValidationResult {
	if (containsExpandableDollar(raw)) {
		return { ok: false, stage: "global_guards", reason: "variable expansion blocked" };
	}

	if (containsBraceExpansion(raw)) {
		return { ok: false, stage: "global_guards", reason: "brace expansion blocked" };
	}

	for (const pattern of CHAINING_PATTERNS) {
		if (pattern.test(raw)) {
			return { ok: false, stage: "global_guards", reason: "command chaining blocked" };
		}
	}

	for (const pattern of REDIRECT_PATTERNS) {
		if (pattern.test(raw)) {
			return { ok: false, stage: "global_guards", reason: "output redirect blocked" };
		}
	}

	return { ok: true };
}

export function validateSegmentGuards(segment: string): ValidationResult {
	if (isDestructiveSegment(segment)) {
		return { ok: false, stage: "segment_guards", reason: "destructive command blocked" };
	}
	return { ok: true };
}
