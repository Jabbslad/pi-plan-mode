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

export const gitPolicies = pickPolicies("git", [
	"git remote show",
	"git config --get",
	"git stash list",
	"git ls-remote",
	"git merge-base",
	"git rev-parse",
	"git rev-list",
	"git shortlog",
	"git for-each-ref",
	"git cat-file",
	"git stash show",
	"git worktree list",
	"git reflog",
	"git status",
	"git blame",
	"git ls-files",
	"git remote",
	"git describe",
	"git branch",
	"git tag",
	"git grep",
	"git diff",
	"git log",
	"git show",
]);
