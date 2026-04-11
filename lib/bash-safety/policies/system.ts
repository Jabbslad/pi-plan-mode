import type { CommandPolicyDefinition } from "../types.js";
import { COMMAND_ALLOWLIST } from "./definitions.js";

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

export const systemPolicies = pickPolicies("system", [
	"file",
	"man",
	"help",
	"netstat",
	"ps",
	"base64",
	"date",
	"hostname",
	"info",
	"lsof",
	"pgrep",
	"tput",
	"ss",
]);
