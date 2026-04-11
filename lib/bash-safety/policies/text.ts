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

export const textPolicies = pickPolicies("text", [
	"grep",
	"sort",
	"sed",
	"xargs",
	"rg",
]);
