/**
 * Tests for per-command flag validation in bash-safety module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafeCommand, extractCommandName } from "../lib/bash-safety.js";

describe("per-flag validation", () => {
	describe("tree — blocks -o/--output, -R", () => {
		it("allows tree with safe flags", () => {
			assert.equal(isSafeCommand("tree -L 2 src/"), true);
			assert.equal(isSafeCommand("tree -a -d"), true);
			assert.equal(isSafeCommand("tree -I node_modules"), true);
			assert.equal(isSafeCommand("tree -P '*.ts'"), true);
			assert.equal(isSafeCommand("tree"), true);
		});

		it("blocks tree -o (writes to file)", () => {
			assert.equal(isSafeCommand("tree -o output.html"), false);
			assert.equal(isSafeCommand("tree --output=out.html"), false);
		});

		it("blocks tree -R (writes 00Tree.html)", () => {
			assert.equal(isSafeCommand("tree -R"), false);
		});
	});

	describe("fd/fdfind — blocks -x/-X (exec)", () => {
		it("allows fd with safe flags", () => {
			assert.equal(isSafeCommand("fd '*.ts'"), true);
			assert.equal(isSafeCommand("fd -e ts -e js"), true);
			assert.equal(isSafeCommand("fd --hidden"), true);
			assert.equal(isSafeCommand("fd -d 3 src/"), true);
		});

		it("blocks fd -x (execute per result)", () => {
			assert.equal(isSafeCommand("fd -x rm"), false);
			assert.equal(isSafeCommand("fd --exec rm"), false);
		});

		it("blocks fd -X (execute batch)", () => {
			assert.equal(isSafeCommand("fd -X rm"), false);
			assert.equal(isSafeCommand("fd --exec-batch rm"), false);
		});

		it("blocks fdfind -x (Debian package name)", () => {
			assert.equal(isSafeCommand("fdfind -x rm"), false);
		});
	});

	describe("sed — blocks -i, w/W/e/E commands", () => {
		it("allows sed -n print commands", () => {
			assert.equal(isSafeCommand("sed -n '1,10p' file"), true);
			assert.equal(isSafeCommand("sed -n '5p' file"), true);
		});

		it("blocks sed -i (in-place editing)", () => {
			assert.equal(isSafeCommand("sed -i 's/foo/bar/' file"), false);
		});

		it("allows sed substitution with safe flags", () => {
			assert.equal(isSafeCommand("sed 's/foo/bar/g' file"), true);
		});
	});

	describe("date — blocks positional args that set time", () => {
		it("allows date with format strings", () => {
			assert.equal(isSafeCommand("date +%Y-%m-%d"), true);
			assert.equal(isSafeCommand("date -d '2024-01-01'"), true);
			// Note: --iso-8601 without argument is blocked because it's typed as 'string' (requires arg)
			// Use --iso-8601=date for explicit argument
			assert.equal(isSafeCommand("date --iso-8601=date"), true);
		});

		it("blocks date positional args (sets system time)", () => {
			assert.equal(isSafeCommand("date 010112002025"), false);
		});

		it("blocks date -s (set time)", () => {
			assert.equal(isSafeCommand("date -s '2024-01-01'"), false);
		});
	});

	describe("git branch — blocks creation", () => {
		it("allows git branch listing", () => {
			assert.equal(isSafeCommand("git branch -a"), true);
			assert.equal(isSafeCommand("git branch -l"), true);
			assert.equal(isSafeCommand("git branch --list"), true);
			assert.equal(isSafeCommand("git branch"), true);
		});

		it("blocks git branch creation via positional arg", () => {
			assert.equal(isSafeCommand("git branch new-branch"), false);
		});

		it("blocks git branch -d/-D (delete)", () => {
			assert.equal(isSafeCommand("git branch -d main"), false);
			assert.equal(isSafeCommand("git branch -D main"), false);
		});
	});

	describe("git tag — blocks creation", () => {
		it("allows git tag listing", () => {
			assert.equal(isSafeCommand("git tag -l"), true);
			assert.equal(isSafeCommand("git tag --list"), true);
			assert.equal(isSafeCommand("git tag"), true);
		});

		it("blocks git tag creation via positional arg", () => {
			assert.equal(isSafeCommand("git tag v1.0"), false);
		});
	});

	describe("ps — blocks BSD 'e' modifier (env leak)", () => {
		it("allows ps with safe flags", () => {
			assert.equal(isSafeCommand("ps aux"), true);
			assert.equal(isSafeCommand("ps -ef"), true);
			assert.equal(isSafeCommand("ps -A"), true);
		});

		it("blocks ps axe (BSD env leak)", () => {
			assert.equal(isSafeCommand("ps axe"), false);
		});
	});

	describe("grep — unknown flags blocked", () => {
		it("allows known grep flags", () => {
			assert.equal(isSafeCommand("grep -r pattern src/"), true);
			assert.equal(isSafeCommand("grep -i pattern"), true);
			assert.equal(isSafeCommand("grep -n -C 3 pattern file"), true);
		});

		it("blocks unknown grep flags", () => {
			assert.equal(isSafeCommand("grep --unknown-flag pattern"), false);
		});
	});

	describe("git subcommands with flag validation", () => {
		it("allows git diff with safe flags", () => {
			assert.equal(isSafeCommand("git diff HEAD"), true);
			assert.equal(isSafeCommand("git diff --stat"), true);
			assert.equal(isSafeCommand("git diff --cached"), true);
		});

		it("allows git log with safe flags", () => {
			assert.equal(isSafeCommand("git log --oneline -10"), true);
			assert.equal(isSafeCommand("git log --all --graph"), true);
		});

		it("allows git show with safe flags", () => {
			assert.equal(isSafeCommand("git show HEAD"), true);
			assert.equal(isSafeCommand("git show --stat HEAD"), true);
		});

		it("allows git reflog (show only)", () => {
			assert.equal(isSafeCommand("git reflog"), true);
			assert.equal(isSafeCommand("git reflog show"), true);
		});

		it("blocks git reflog expire", () => {
			assert.equal(isSafeCommand("git reflog expire --all"), false);
		});

		it("allows git ls-remote with safe flags", () => {
			assert.equal(isSafeCommand("git ls-remote --heads"), true);
		});

		it("allows git stash show", () => {
			assert.equal(isSafeCommand("git stash show"), true);
			assert.equal(isSafeCommand("git stash show --stat"), true);
		});
	});

	describe("stderr redirects", () => {
		it("allows 2>/dev/null", () => {
			assert.equal(isSafeCommand("cat file 2>/dev/null"), true);
		});

		it("allows 2>&1", () => {
			assert.equal(isSafeCommand("cat file 2>&1"), true);
		});

		it("still blocks stdout redirect", () => {
			assert.equal(isSafeCommand("echo hello > file.txt"), false);
		});

		it("still blocks append redirect", () => {
			assert.equal(isSafeCommand("echo hello >> file.txt"), false);
		});
	});

	describe("unknown flags on allowlisted commands are blocked", () => {
		it("blocks unknown sort flags", () => {
			assert.equal(isSafeCommand("sort --dangerous-flag file"), false);
		});

		it("blocks unknown tree flags", () => {
			assert.equal(isSafeCommand("tree --unknown-flag"), false);
		});
	});

	describe("xargs — safe target commands only", () => {
		it("allows xargs with safe targets", () => {
			assert.equal(isSafeCommand("find . -name '*.ts' | xargs grep pattern"), true);
		});

		it("blocks bare xargs with unsafe targets", () => {
			assert.equal(isSafeCommand("xargs rm"), false);
		});

		it("blocks piped xargs with unsafe targets", () => {
			assert.equal(isSafeCommand("find . -name '*.ts' | xargs rm"), false);
		});
	});

	describe("extractCommandName", () => {
		it("extracts first word", () => {
			assert.equal(extractCommandName("git status"), "git");
			assert.equal(extractCommandName("  ls -la"), "ls");
			assert.equal(extractCommandName("cat file.txt"), "cat");
		});

		it("returns empty for empty input", () => {
			assert.equal(extractCommandName(""), "");
			assert.equal(extractCommandName("   "), "");
		});
	});
});
