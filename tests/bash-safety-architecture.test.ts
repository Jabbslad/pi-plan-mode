import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	BasicShellParser,
	COMMAND_POLICIES,
	createBashSafetyEngine,
	createRegistry,
	resolvePolicy,
	tokenizeCommand,
} from "../lib/bash-safety.js";

describe("bash safety architecture", () => {
	describe("registry", () => {
		it("prefers longest multi-word match", () => {
			const registry = createRegistry(COMMAND_POLICIES);
			const resolved = registry.resolvePolicy(["git", "remote", "show", "origin"]);
			assert.equal(resolved.policy?.pattern, "git remote show");
			assert.equal(resolved.commandTokens, 3);
		});

		it("resolves git config --get as longest match", () => {
			const resolved = resolvePolicy(["git", "config", "--get", "user.name"]);
			assert.equal(resolved.policy?.pattern, "git config --get");
		});

		it("returns null for unknown commands", () => {
			const resolved = resolvePolicy(["totally-unknown", "arg"]);
			assert.equal(resolved.policy, null);
			assert.equal(resolved.commandTokens, 0);
		});
	});

	describe("parser", () => {
		it("tokenizes single-quoted arguments", () => {
			const tokens = tokenizeCommand("grep -e 'hello world' file.txt");
			assert.deepEqual(tokens.map((t) => t.value), ["grep", "-e", "hello world", "file.txt"]);
			assert.equal(tokens[2]?.quoted, "single");
		});

		it("tokenizes double-quoted arguments", () => {
			const tokens = tokenizeCommand('echo "hello world"');
			assert.deepEqual(tokens.map((t) => t.value), ["echo", "hello world"]);
			assert.equal(tokens[1]?.quoted, "double");
		});

		it("parses pipes into structured segments", () => {
			const parser = new BasicShellParser();
			const parsed = parser.parse("find . -name '*.ts' | wc -l");
			assert.equal(parsed.ok, true);
			if (!parsed.ok) return;
			assert.equal(parsed.parsed.pipelines[0]?.segments.length, 2);
			assert.deepEqual(parsed.parsed.pipelines[0]?.segments[0]?.tokens, ["find", ".", "-name", "*.ts"]);
			assert.deepEqual(parsed.parsed.pipelines[0]?.segments[1]?.tokens, ["wc", "-l"]);
		});
	});

	describe("engine extension points", () => {
		it("supports parser injection", () => {
			let parseCalls = 0;
			const engine = createBashSafetyEngine({
				parser: {
					parse(raw: string) {
						parseCalls++;
						return new BasicShellParser().parse(raw);
					},
				},
			});
			assert.equal(engine.isSafeCommand("cat file.txt"), true);
			assert.ok(parseCalls > 0);
		});

		it("supports custom policy registry", () => {
			const engine = createBashSafetyEngine({ policies: [] });
			assert.equal(engine.isSafeCommand("git status"), false);
			assert.deepEqual(engine.getRegisteredPolicyPatterns(), []);
		});
	});
});
