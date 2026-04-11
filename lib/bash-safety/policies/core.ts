import type { CommandPolicyDefinition } from "../types.js";
import { COMMAND_ALLOWLIST, SIMPLE_SAFE_COMMANDS } from "./definitions.js";

function pickPolicies(
	category: CommandPolicyDefinition["category"],
	patterns: string[],
): CommandPolicyDefinition[] {
	return patterns.map((pattern) => ({
		pattern,
		category,
		config: COMMAND_ALLOWLIST[pattern]!,
	}));
}

export const corePolicies = pickPolicies("core", [
	"tree",
	"fd",
	"fdfind",
	"sha256sum",
	"sha1sum",
	"md5sum",
]);

export const coreSpecialMatchers = {
	matchesNpmReadOnly(command: string): boolean {
		return /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i.test(command);
	},
	matchesCurlReadOnly(command: string): boolean {
		return /^\s*curl\s/.test(command);
	},
	matchesJqReadOnly(command: string): boolean {
		return /^\s*jq\b/.test(command);
	},
	matchesNodeVersion(command: string): boolean {
		return /^\s*node\s+--version\b/.test(command);
	},
	matchesPythonVersion(command: string): boolean {
		return /^\s*python\d*\s+--version\b/.test(command);
	},
	matchesLs(command: string): boolean {
		return /^\s*ls(?:\s|$)/.test(command);
	},
	matchesFind(command: string): boolean {
		return /^\s*find\b/.test(command);
	},
	matchesEcho(command: string): boolean {
		return /^\s*echo\b/.test(command);
	},
	matchesPwd(command: string): boolean {
		return /^\s*pwd\s*$/.test(command);
	},
	matchesWhoami(command: string): boolean {
		return /^\s*whoami\s*$/.test(command);
	},
	// TODO: Expand safe awk support beyond narrow print-only patterns.
	// Current matcher allows simple single-quoted read-only print forms like:
	//   awk '{print $1}' file.txt
	//   awk '{print $1,$2}' file.txt
	// Future work:
	// - support more read-only awk programs safely
	// - keep shell-expansion checks quote-aware
	// - avoid allowing system(), redirection, getline-from-command, or file writes
	matchesSafeAwkPrint(command: string): boolean {
		return /^\s*awk\s+'\{\s*print(?:\s+(?:(?:"[^"]*"|\$\d+)(?:\s*,\s*(?:"[^"]*"|\$\d+))*))?\s*\}'(?:\s+[^<>()`|{}&;\n\r]+)*\s*$/.test(command);
	},
};

export { SIMPLE_SAFE_COMMANDS };
