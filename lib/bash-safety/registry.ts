import type { CommandPolicyDefinition } from "./types.js";
import { corePolicies, coreSpecialMatchers, SIMPLE_SAFE_COMMANDS } from "./policies/core.js";
import { gitPolicies } from "./policies/git.js";
import { textPolicies } from "./policies/text.js";
import { systemPolicies } from "./policies/system.js";

export function createRegistry(policies: CommandPolicyDefinition[]) {
	const sortedPolicies = [...policies].sort(
		(a, b) => b.pattern.split(" ").length - a.pattern.split(" ").length,
	);

	function resolvePolicy(tokens: string[]): {
		policy: CommandPolicyDefinition | null;
		commandTokens: number;
	} {
		for (const policy of sortedPolicies) {
			const parts = policy.pattern.split(" ");
			if (tokens.length < parts.length) continue;
			let matches = true;
			for (let i = 0; i < parts.length; i++) {
				if (tokens[i] !== parts[i]) {
					matches = false;
					break;
				}
			}
			if (matches) return { policy, commandTokens: parts.length };
		}
		return { policy: null, commandTokens: 0 };
	}

	return {
		policies: sortedPolicies,
		resolvePolicy,
	};
}

export const COMMAND_POLICIES: CommandPolicyDefinition[] = [
	...gitPolicies,
	...textPolicies,
	...systemPolicies,
	...corePolicies,
];

const defaultRegistry = createRegistry(COMMAND_POLICIES);

export function resolvePolicy(tokens: string[]): {
	policy: CommandPolicyDefinition | null;
	commandTokens: number;
} {
	for (const policy of defaultRegistry.policies) {
		const parts = policy.pattern.split(" ");
		if (tokens.length < parts.length) continue;
		let matches = true;
		for (let i = 0; i < parts.length; i++) {
			if (tokens[i] !== parts[i]) {
				matches = false;
				break;
			}
		}
		if (matches) return { policy, commandTokens: parts.length };
	}
	return { policy: null, commandTokens: 0 };
}

export { SIMPLE_SAFE_COMMANDS, coreSpecialMatchers, defaultRegistry };
