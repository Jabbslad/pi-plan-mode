/**
 * Unit tests for plan file management utilities.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	generateSlug,
	generateUniqueSlug,
	getPlanFilePath,
	ensurePlansDir,
	readPlan,
	writePlan,
	planExists,
	isPlanFilePath,
	extractCommandName,
	isSafeCommand,
	extractSessionName,
	createInitialState,
	recoverPlanSlug,
	DEFAULT_PLANS_DIR,
} from "../lib/plans.js";

// ── Test helpers ─────────────────────────────────────────────────────

function createTempDir(): string {
	const dir = join(tmpdir(), `pi-plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// ── Slug generation ──────────────────────────────────────────────────

describe("generateSlug", () => {
	it("generates a two-word slug with hyphen", () => {
		const slug = generateSlug();
		assert.match(slug, /^[a-z]+-[a-z]+$/);
	});

	it("generates different slugs with different random functions", () => {
		const slug1 = generateSlug(() => 0.1);
		const slug2 = generateSlug(() => 0.9);
		assert.notEqual(slug1, slug2);
	});

	it("generates deterministic slug with fixed random", () => {
		const slug1 = generateSlug(() => 0.5);
		const slug2 = generateSlug(() => 0.5);
		assert.equal(slug1, slug2);
	});

	it("generates non-empty parts", () => {
		for (let i = 0; i < 20; i++) {
			const slug = generateSlug();
			const parts = slug.split("-");
			assert.equal(parts.length, 2);
			assert.ok(parts[0].length > 0, "adjective should not be empty");
			assert.ok(parts[1].length > 0, "noun should not be empty");
		}
	});
});

describe("generateUniqueSlug", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("generates a slug that doesn't conflict with existing files", () => {
		const slug = generateUniqueSlug(tempDir);
		assert.ok(!existsSync(join(tempDir, `${slug}.md`)));
	});

	it("avoids conflicting slugs", () => {
		const fixedRandom = () => 0.5;
		const firstSlug = generateSlug(fixedRandom);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, `${firstSlug}.md`), "existing plan");
		const slug = generateUniqueSlug(tempDir, 1, fixedRandom);
		assert.ok(slug.includes("-"), "should still have hyphen");
		assert.notEqual(slug, firstSlug, "should not be the conflicting slug");
	});

	it("returns slug immediately when no conflict", () => {
		let callCount = 0;
		const countingRandom = () => {
			callCount++;
			return 0.3;
		};
		generateUniqueSlug(tempDir, 10, countingRandom);
		assert.equal(callCount, 2);
	});

	it("appends timestamp on exhausted retries", () => {
		const fixedRandom = () => 0.5;
		const slug = generateSlug(fixedRandom);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, `${slug}.md`), "existing");
		const result = generateUniqueSlug(tempDir, 1, fixedRandom);
		assert.ok(result.startsWith(slug + "-"), `Expected "${result}" to start with "${slug}-"`);
		assert.match(result, /\d+$/, "should end with timestamp digits");
	});

	it("handles maxRetries = 0", () => {
		const fixedRandom = () => 0.5;
		const result = generateUniqueSlug(tempDir, 0, fixedRandom);
		// With 0 retries, should go straight to timestamp fallback
		assert.match(result, /\d+$/, "should end with timestamp digits");
	});
});

// ── Plan file I/O ────────────────────────────────────────────────────

describe("getPlanFilePath", () => {
	it("returns correct path", () => {
		assert.equal(getPlanFilePath("fuzzy-tiger", "/tmp/plans"), "/tmp/plans/fuzzy-tiger.md");
	});

	it("uses default plans dir", () => {
		const path = getPlanFilePath("bold-hawk");
		assert.ok(path.endsWith("/bold-hawk.md"));
		assert.ok(path.includes(".config/pi/plans"));
	});
});

describe("ensurePlansDir", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-plan-ensure-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates directory if it doesn't exist", () => {
		const nested = join(tempDir, "a", "b", "c");
		assert.ok(!existsSync(nested));
		ensurePlansDir(nested);
		assert.ok(existsSync(nested));
	});

	it("is idempotent", () => {
		ensurePlansDir(tempDir);
		ensurePlansDir(tempDir);
		assert.ok(existsSync(tempDir));
	});
});

describe("readPlan / writePlan", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns null for non-existent plan", () => {
		assert.equal(readPlan("nonexistent", tempDir), null);
	});

	it("writes and reads plan content", () => {
		const content = "# My Plan\n\n1. Step one\n2. Step two";
		writePlan("test-plan", content, tempDir);
		assert.equal(readPlan("test-plan", tempDir), content);
	});

	it("overwrites existing plan", () => {
		writePlan("test-plan", "v1", tempDir);
		writePlan("test-plan", "v2", tempDir);
		assert.equal(readPlan("test-plan", tempDir), "v2");
	});

	it("creates directory when writing", () => {
		const nested = join(tempDir, "nested", "dir");
		writePlan("test-plan", "content", nested);
		assert.equal(readPlan("test-plan", nested), "content");
	});

	it("handles empty content", () => {
		writePlan("empty", "", tempDir);
		assert.equal(readPlan("empty", tempDir), "");
	});

	it("handles unicode content", () => {
		const content = "# 计划\n\n1. 步骤一 🎉\n2. Ñoño → résumé";
		writePlan("unicode", content, tempDir);
		assert.equal(readPlan("unicode", tempDir), content);
	});

	it("handles multiline markdown with code blocks", () => {
		const content = "# Plan\n\n```typescript\nconst x = 1;\n```\n\n1. Step one";
		writePlan("code", content, tempDir);
		assert.equal(readPlan("code", tempDir), content);
	});
});

describe("planExists", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns false for non-existent plan", () => {
		assert.equal(planExists("nope", tempDir), false);
	});

	it("returns true after writing", () => {
		writePlan("exists", "content", tempDir);
		assert.equal(planExists("exists", tempDir), true);
	});
});

// ── isPlanFilePath ───────────────────────────────────────────────────

describe("isPlanFilePath", () => {
	it("matches identical paths", () => {
		assert.equal(isPlanFilePath("/tmp/plans/bold-hawk.md", "/tmp/plans/bold-hawk.md"), true);
	});

	it("rejects different paths", () => {
		assert.equal(isPlanFilePath("/tmp/plans/bold-hawk.md", "/tmp/plans/other.md"), false);
	});

	it("normalizes relative paths with ..", () => {
		assert.equal(
			isPlanFilePath("/tmp/plans/../plans/bold-hawk.md", "/tmp/plans/bold-hawk.md"),
			true,
		);
	});

	it("handles tilde expansion", () => {
		const home = process.env.HOME ?? "";
		if (home) {
			assert.equal(
				isPlanFilePath("~/.config/pi/plans/test.md", `${home}/.config/pi/plans/test.md`),
				true,
			);
		}
	});

	it("handles tilde in both paths", () => {
		assert.equal(
			isPlanFilePath("~/.config/pi/plans/test.md", "~/.config/pi/plans/test.md"),
			true,
		);
	});

	it("rejects different filenames", () => {
		assert.equal(
			isPlanFilePath("/tmp/plans/bold-hawk.md", "/tmp/plans/calm-deer.md"),
			false,
		);
	});
});

// ── extractCommandName ──────────────────────────────────────���────────

describe("extractCommandName", () => {
	it("extracts simple command name", () => {
		assert.equal(extractCommandName("ls -la"), "ls");
	});

	it("extracts from command with path", () => {
		assert.equal(extractCommandName("/usr/bin/cat file.txt"), "/usr/bin/cat");
	});

	it("handles leading whitespace", () => {
		assert.equal(extractCommandName("  grep pattern"), "grep");
	});

	it("returns empty for empty string", () => {
		assert.equal(extractCommandName(""), "");
	});

	it("returns empty for whitespace only", () => {
		assert.equal(extractCommandName("   "), "");
	});

	it("lowercases the command name", () => {
		assert.equal(extractCommandName("CAT file"), "cat");
	});
});

// ── Bash command safety ──────────────────────────────────────────────

describe("isSafeCommand", () => {
	describe("allows safe read-only commands", () => {
		const safeCmds = [
			"cat file.txt",
			"head -n 10 file.txt",
			"tail -f log.txt",
			"grep -r pattern src/",
			"find . -name '*.ts'",
			"ls -la",
			"pwd",
			"echo hello",
			"wc -l file.txt",
			"sort file.txt",
			"diff file1.txt file2.txt",
			"file binary.bin",
			"stat file.txt",
			"du -sh .",
			"df -h",
			"tree src/",
			"which node",
			"git status",
			"git log --oneline",
			"git diff HEAD",
			"git show HEAD",
			"git branch",
			"git remote -v",
			"git config --get user.name",
			"git ls-files",
			"npm list",
			"npm ls --depth=0",
			"npm view react",
			"npm audit",
			"node --version",
			"python --version",
			"curl https://example.com",
			"jq '.name' package.json",
			"sed -n '1,10p' file.txt",
			"awk '{print $1}' file.txt",
			"rg pattern src/",
			"fd '*.ts'",
			"bat file.txt",
		];

		for (const cmd of safeCmds) {
			it(`allows: ${cmd}`, () => {
				assert.equal(isSafeCommand(cmd), true, `Expected "${cmd}" to be safe`);
			});
		}
	});

	describe("blocks destructive commands", () => {
		const unsafeCmds = [
			"rm file.txt",
			"rm -rf /",
			"rmdir dir/",
			"mv a.txt b.txt",
			"cp a.txt b.txt",
			"mkdir new-dir",
			"touch newfile.txt",
			"chmod 755 file.txt",
			"chown user file.txt",
			"ln -s target link",
			"tee output.txt",
			"npm install express",
			"yarn add react",
			"pip install flask",
			"git add .",
			"git commit -m 'msg'",
			"git push origin main",
			"git pull",
			"git merge feature",
			"git rebase main",
			"git reset --hard",
			"git checkout -b new-branch",
			"git stash",
			"sudo apt update",
			"kill -9 1234",
			"pkill node",
			"vim file.txt",
			"nano file.txt",
			"code .",
		];

		for (const cmd of unsafeCmds) {
			it(`blocks: ${cmd}`, () => {
				assert.equal(isSafeCommand(cmd), false, `Expected "${cmd}" to be blocked`);
			});
		}
	});

	describe("no false positives on arguments containing command names", () => {
		it("allows grep for destructive command names", () => {
			assert.equal(isSafeCommand("grep rm file.txt"), true);
			assert.equal(isSafeCommand("grep -r 'rm' ."), true);
			assert.equal(isSafeCommand("grep -r 'chmod' src/"), true);
		});

		it("allows find with destructive names in arguments", () => {
			assert.equal(isSafeCommand("find . -name rm"), true);
			assert.equal(isSafeCommand("find . -name 'mkdir*'"), true);
		});

		it("allows cat on files with destructive names", () => {
			assert.equal(isSafeCommand("cat chmod.md"), true);
			assert.equal(isSafeCommand("cat /path/to/rm.log"), true);
			assert.equal(isSafeCommand("cat kill-process.sh"), true);
		});

		it("allows echo with destructive words", () => {
			assert.equal(isSafeCommand("echo rm -rf is dangerous"), true);
		});

		it("allows ls on paths with destructive names", () => {
			assert.equal(isSafeCommand("ls -la /usr/bin/sudo"), true);
		});
	});

	describe("handles stderr redirects correctly", () => {
		it("allows stderr redirect to /dev/null", () => {
			assert.equal(isSafeCommand("cat file 2>/dev/null"), true);
		});

		it("allows stderr to stdout redirect", () => {
			assert.equal(isSafeCommand("cat file 2>&1"), true);
		});

		it("blocks stdout redirect", () => {
			assert.equal(isSafeCommand("echo hello > file.txt"), false);
		});

		it("blocks append redirect", () => {
			assert.equal(isSafeCommand("echo hello >> file.txt"), false);
		});
	});

	describe("handles piped commands", () => {
		it("allows safe pipes", () => {
			assert.equal(isSafeCommand("cat file.txt | grep pattern"), true);
			assert.equal(isSafeCommand("find . -name '*.ts' | wc -l"), true);
			assert.equal(isSafeCommand("git log --oneline | head -5"), true);
		});

		it("blocks pipes with destructive commands", () => {
			assert.equal(isSafeCommand("cat file.txt | tee output.txt"), false);
			assert.equal(isSafeCommand("echo test | sudo command"), false);
		});
	});

	describe("blocks command chaining and subshells", () => {
		it("blocks semicolons", () => {
			assert.equal(isSafeCommand("ls; rm file"), false);
			assert.equal(isSafeCommand("cat file.txt; rm -rf /"), false);
		});

		it("blocks && chains", () => {
			assert.equal(isSafeCommand("ls && rm file"), false);
			assert.equal(isSafeCommand("cat file.txt && git commit -m 'x'"), false);
		});

		it("blocks || chains", () => {
			assert.equal(isSafeCommand("ls || rm file"), false);
			assert.equal(isSafeCommand("cat file || echo fallback"), false);
		});

		it("blocks command substitution $()", () => {
			assert.equal(isSafeCommand("echo $(rm file)"), false);
			assert.equal(isSafeCommand("cat $(find . -name '*.ts')"), false);
		});

		it("blocks backtick substitution", () => {
			assert.equal(isSafeCommand("echo `rm file`"), false);
			assert.equal(isSafeCommand("cat `which node`"), false);
		});
	});

	describe("edge cases", () => {
		it("blocks empty/whitespace commands", () => {
			assert.equal(isSafeCommand(""), false);
			assert.equal(isSafeCommand("   "), false);
		});

		it("handles commands with leading whitespace", () => {
			assert.equal(isSafeCommand("  ls -la"), true);
			assert.equal(isSafeCommand("  rm file"), false);
		});

		it("blocks unknown commands not in safe list", () => {
			assert.equal(isSafeCommand("unknown-cmd arg"), false);
			assert.equal(isSafeCommand("python script.py"), false);
			assert.equal(isSafeCommand("make"), false);
			assert.equal(isSafeCommand("cargo build"), false);
		});

		it("is case-sensitive for safe commands (Unix)", () => {
			assert.equal(isSafeCommand("CAT file.txt"), false);
			assert.equal(isSafeCommand("LS -la"), false);
		});

		it("blocks git branch -D (uppercase D)", () => {
			assert.equal(isSafeCommand("git branch -D main"), false);
		});

		it("blocks git branch -d (lowercase d)", () => {
			assert.equal(isSafeCommand("git branch -d main"), false);
		});
	});
});

// ── extractSessionName ───────────────────────────────────────────────

describe("extractSessionName", () => {
	it("extracts heading from markdown", () => {
		assert.equal(extractSessionName("# Add authentication\n\n1. Step one"), "Add authentication");
	});

	it("strips ## prefix", () => {
		assert.equal(extractSessionName("## Refactor module\n\nDetails"), "Refactor module");
	});

	it("strips ### prefix", () => {
		assert.equal(extractSessionName("### Deeply nested heading"), "Deeply nested heading");
	});

	it("uses raw first line if no heading marker", () => {
		assert.equal(extractSessionName("Plan to refactor auth"), "Plan to refactor auth");
	});

	it("skips leading empty lines", () => {
		assert.equal(extractSessionName("\n\n\n# Real title"), "Real title");
	});

	it("returns 'Plan' for empty content", () => {
		assert.equal(extractSessionName(""), "Plan");
	});

	it("returns 'Plan' for only whitespace", () => {
		assert.equal(extractSessionName("   \n  \n  "), "Plan");
	});

	it("truncates to 60 characters", () => {
		const longTitle = "A".repeat(100);
		assert.equal(extractSessionName(longTitle).length, 60);
	});

	it("returns 'Plan' if first line is only heading markers", () => {
		assert.equal(extractSessionName("# \n\nSome content"), "Plan");
	});
});

// ── State management ─────────────────────────────────────────────────

describe("createInitialState", () => {
	it("creates inactive state", () => {
		const state = createInitialState();
		assert.equal(state.active, false);
		assert.equal(state.planSlug, null);
		assert.equal(state.planFilePath, null);
		assert.equal(state.lastTransition, null);
		assert.equal(state.lastApprovedPlanFilePath, null);
	});

	it("creates independent instances", () => {
		const s1 = createInitialState();
		const s2 = createInitialState();
		s1.active = true;
		assert.equal(s2.active, false);
	});
});

// ── Plan recovery ────────────────────────────────────────────────────

describe("recoverPlanSlug", () => {
	it("returns null for empty entries", () => {
		assert.equal(recoverPlanSlug([]), null);
	});

	it("returns null when no plan-mode-state entries", () => {
		const entries = [
			{ type: "message" },
			{ type: "custom", customType: "other-type" },
		];
		assert.equal(recoverPlanSlug(entries), null);
	});

	it("recovers slug from plan-mode-state entry", () => {
		const entries = [
			{ type: "message" },
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { active: true, planSlug: "bold-hawk", planFilePath: "/tmp/plans/bold-hawk.md" },
			},
		];
		assert.equal(recoverPlanSlug(entries), "bold-hawk");
	});

	it("recovers most recent slug when multiple entries exist", () => {
		const entries = [
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { planSlug: "old-slug" },
			},
			{ type: "message" },
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { planSlug: "new-slug" },
			},
		];
		assert.equal(recoverPlanSlug(entries), "new-slug");
	});

	it("returns null if data has no planSlug", () => {
		const entries = [
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { active: false },
			},
		];
		assert.equal(recoverPlanSlug(entries), null);
	});

	it("returns null if data is missing", () => {
		const entries = [
			{
				type: "custom",
				customType: "plan-mode-state",
			},
		];
		assert.equal(recoverPlanSlug(entries), null);
	});

	it("skips entries with wrong customType", () => {
		const entries = [
			{
				type: "custom",
				customType: "some-other-state",
				data: { planSlug: "wrong-slug" },
			},
		];
		assert.equal(recoverPlanSlug(entries), null);
	});

	it("skips non-custom entries", () => {
		const entries = [
			{
				type: "message",
				customType: "plan-mode-state",
				data: { planSlug: "wrong-slug" },
			},
		];
		assert.equal(recoverPlanSlug(entries), null);
	});

	it("returns null for non-string planSlug values", () => {
		const entries = [
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { planSlug: 42 },
			},
		];
		assert.equal(recoverPlanSlug(entries), null);

		const entries2 = [
			{
				type: "custom",
				customType: "plan-mode-state",
				data: { planSlug: true },
			},
		];
		assert.equal(recoverPlanSlug(entries2), null);
	});
});

// ── DEFAULT_PLANS_DIR ────────────────────────────────────────────────

describe("DEFAULT_PLANS_DIR", () => {
	it("is under .config/pi/plans", () => {
		assert.ok(DEFAULT_PLANS_DIR.includes(".config/pi/plans"));
	});

	it("is an absolute path", () => {
		assert.ok(DEFAULT_PLANS_DIR.startsWith("/"));
	});
});
