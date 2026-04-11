import { validateGlobalGuards, validateSegmentGuards } from "./guards.js";
import { BasicShellParser } from "./parser.js";
import type { ShellParser } from "./parser.js";
import { COMMAND_POLICIES, SIMPLE_SAFE_COMMANDS, coreSpecialMatchers, createRegistry, defaultRegistry, resolvePolicy } from "./registry.js";
import { SAFE_TARGET_COMMANDS_FOR_XARGS } from "./policies/definitions.js";
import type {
	CommandConfig,
	ParsedSegment,
	ValidationResult,
	ValidationContext,
	FlagArgType,
	CommandPolicyDefinition,
} from "./types.js";
import {
	extractCommandName,
	makeRegexForSafeCommand,
	parsedArgsToTokens,
	stripSafeStderrRedirects,
} from "./utils.js";

const defaultParser = new BasicShellParser();

export interface BashSafetyEngineOptions {
	parser?: ShellParser;
	policies?: CommandPolicyDefinition[];
	simpleSafeCommands?: Set<string>;
	specialMatchers?: typeof coreSpecialMatchers;
}

export function validateFlagArgument(value: string, argType: FlagArgType): boolean {
	switch (argType) {
		case "none":
			return false;
		case "number":
			return /^\d+$/.test(value);
		case "string":
			return true;
		case "char":
			return value.length === 1;
		case "{}":
			return value === "{}";
		case "EOF":
			return value === "EOF";
		default:
			return false;
	}
}

const FLAG_PATTERN = /^-[a-zA-Z0-9_-]/;

export function validateFlags(
	tokens: string[],
	startIndex: number,
	config: CommandConfig,
	options?: {
		commandName?: string;
		rawCommand?: string;
		xargsTargetCommands?: string[];
	},
): boolean {
	let i = startIndex;

	while (i < tokens.length) {
		let token = tokens[i];
		if (!token) {
			i++;
			continue;
		}

		if (
			options?.xargsTargetCommands &&
			options.commandName === "xargs" &&
			(!token.startsWith("-") || token === "--")
		) {
			if (token === "--" && i + 1 < tokens.length) {
				i++;
				token = tokens[i];
			}
			if (token && options.xargsTargetCommands.includes(token)) break;
			return false;
		}

		if (token === "--") {
			if (config.respectsDoubleDash !== false) {
				i++;
				break;
			}
			i++;
			continue;
		}

		if (token.startsWith("-") && token.length > 1 && FLAG_PATTERN.test(token)) {
			const hasEquals = token.includes("=");
			const [flag, ...valueParts] = token.split("=");
			const inlineValue = valueParts.join("=");
			if (!flag) return false;

			const flagArgType = config.safeFlags[flag];
			if (!flagArgType) {
				if (options?.commandName === "git" && flag.match(/^\-\d+$/)) {
					i++;
					continue;
				}

				if (
					(options?.commandName === "grep" || options?.commandName === "rg") &&
					flag.startsWith("-") &&
					!flag.startsWith("--") &&
					flag.length > 2
				) {
					const potentialFlag = flag.substring(0, 2);
					const potentialValue = flag.substring(2);
					if (config.safeFlags[potentialFlag] && /^\d+$/.test(potentialValue)) {
						const type = config.safeFlags[potentialFlag];
						if ((type === "number" || type === "string") && validateFlagArgument(potentialValue, type)) {
							i++;
							continue;
						}
						return false;
					}
				}

				if (flag.startsWith("-") && !flag.startsWith("--") && flag.length > 2) {
					let consumedAsBundle = false;
					for (let j = 1; j < flag.length; j++) {
						const singleFlag = `-${flag[j]}`;
						const type = config.safeFlags[singleFlag];
						if (!type) return false;
						if (type !== "none") {
							if (j !== flag.length - 1) return false;
							const attachedValue = flag.slice(j + 1);
							if (!attachedValue) return false;
							if (!validateFlagArgument(attachedValue, type)) return false;
							consumedAsBundle = true;
							break;
						}
					}
					if (!consumedAsBundle) {
						i++;
						continue;
					}
					i++;
					continue;
				}

				return false;
			}

			if (flagArgType === "none") {
				if (hasEquals) return false;
				i++;
			} else {
				let argValue: string;
				if (hasEquals) {
					argValue = inlineValue;
					i++;
				} else {
					if (
						i + 1 >= tokens.length ||
						(tokens[i + 1] && tokens[i + 1]!.startsWith("-") && FLAG_PATTERN.test(tokens[i + 1]!))
					) {
						return false;
					}
					argValue = tokens[i + 1] || "";
					i += 2;
				}

				if (flagArgType === "string" && argValue.startsWith("-")) {
					if (
						flag === "--sort" &&
						options?.commandName === "git" &&
						/^-[a-zA-Z]/.test(argValue)
					) {
						// allowed reverse sort key
					} else {
						return false;
					}
				}

				if (!validateFlagArgument(argValue, flagArgType)) return false;
			}
		} else {
			i++;
		}
	}

	return true;
}

function validatePolicyForSegment(
	segment: ParsedSegment,
	context: ValidationContext,
	resolver: (tokens: string[]) => { policy: CommandPolicyDefinition | null; commandTokens: number },
): ValidationResult {
	const tokens = segment.tokens;
	if (tokens.length === 0) {
		return { ok: false, stage: "policy", reason: "empty segment" };
	}

	const { policy, commandTokens } = resolver(tokens);
	if (!policy) {
		return { ok: false, stage: "policy", reason: "unknown command policy" };
	}

	for (let i = commandTokens; i < tokens.length; i++) {
		const token = tokens[i];
		const arg = segment.args[i];
		if (!token) continue;
		if (token.includes("$") && arg?.quoted !== "single") {
			return { ok: false, stage: "policy", reason: "variable expansion blocked" };
		}
		if (
			token.includes("{") &&
			(token.includes(",") || token.includes("..")) &&
			arg?.quoted === "none"
		) {
			return { ok: false, stage: "policy", reason: "brace expansion blocked" };
		}
	}

	if (
		!validateFlags(tokens, commandTokens, policy.config, {
			commandName: tokens[0],
			rawCommand: segment.raw,
			xargsTargetCommands: tokens[0] === "xargs" ? SAFE_TARGET_COMMANDS_FOR_XARGS : undefined,
		})
	) {
		return { ok: false, stage: "flags", reason: "flag validation failed" };
	}

	if (policy.config.regex && !policy.config.regex.test(segment.raw)) {
		return { ok: false, stage: "regex", reason: "regex validation failed" };
	}

	if (!policy.config.regex && /`/.test(segment.raw)) {
		return { ok: false, stage: "regex", reason: "backticks blocked" };
	}

	if (!policy.config.regex && (tokens[0] === "rg" || tokens[0] === "grep") && /[\n\r]/.test(segment.raw)) {
		return { ok: false, stage: "regex", reason: "newline in pattern blocked" };
	}

	if (
		policy.config.additionalCommandIsDangerousCallback &&
		policy.config.additionalCommandIsDangerousCallback(segment.raw, tokens.slice(commandTokens))
	) {
		return { ok: false, stage: "callback", reason: "command callback marked segment dangerous" };
	}

	return { ok: true };
}

function matchesSimpleSafeCommand(command: string, simpleSafeCommands: Set<string>): boolean {
	const cmdName = extractCommandName(command);
	if (!simpleSafeCommands.has(cmdName)) return false;
	return makeRegexForSafeCommand(cmdName).test(command);
}

function matchesCoreSpecialCases(command: string, specialMatchers: typeof coreSpecialMatchers): boolean {
	return (
		specialMatchers.matchesNpmReadOnly(command) ||
		specialMatchers.matchesCurlReadOnly(command) ||
		specialMatchers.matchesJqReadOnly(command) ||
		specialMatchers.matchesNodeVersion(command) ||
		specialMatchers.matchesPythonVersion(command) ||
		specialMatchers.matchesLs(command) ||
		specialMatchers.matchesFind(command) ||
		specialMatchers.matchesEcho(command) ||
		specialMatchers.matchesPwd(command) ||
		specialMatchers.matchesWhoami(command) ||
		specialMatchers.matchesSafeAwkPrint(command)
	);
}

export function createBashSafetyEngine(options: BashSafetyEngineOptions = {}) {
	const parser = options.parser ?? defaultParser;
	const registry = options.policies ? createRegistry(options.policies) : defaultRegistry;
	const simpleSafeCommands = options.simpleSafeCommands ?? SIMPLE_SAFE_COMMANDS;
	const specialMatchers = options.specialMatchers ?? coreSpecialMatchers;

	function isCommandSafeViaFlagParsingInternal(command: string): boolean {
		const parseResult = parser.parse(command);
		if (!parseResult.ok) return false;
		const segment = parseResult.parsed.pipelines[0]?.segments[0];
		if (!segment) return false;
		const context: ValidationContext = { raw: command, parsed: parseResult.parsed };
		return validatePolicyForSegment(segment, context, registry.resolvePolicy).ok;
	}

	function isSafeCommandInternal(command: string): boolean {
		const global = validateGlobalGuards(command);
		if (!global.ok) return false;

		const parseResult = parser.parse(command);
		if (!parseResult.ok) return false;
		const context: ValidationContext = { raw: command, parsed: parseResult.parsed };
		const pipeline = context.parsed.pipelines[0];
		if (!pipeline || pipeline.segments.length === 0) return false;

		// TODO: Add pipeline-aware validation rules beyond per-segment safety.
		// Right now each pipe segment must be individually safe, but the pipeline as a
		// whole is not semantically analyzed. Future work:
		// - reason about stdin/stdout data flow between segments
		// - detect risky data-to-code bridges, not just risky commands
		// - support policy decisions that depend on segment position in the pipeline
		//   (e.g. producer vs consumer vs final sink)
		for (const segment of pipeline.segments) {
			const segmentGuard = validateSegmentGuards(segment.raw);
			if (!segmentGuard.ok) return false;

			// TODO: Add position-aware policy hooks for pipeline consumer commands such as
			// xargs. Some commands are only fully understandable when validated in context
			// of a pipeline, not as isolated segments. Future work:
			// - allow policies to inspect previous/next pipeline segments
			// - distinguish standalone `xargs ...` validation from piped `... | xargs ...`
			// - extend this to other consumer-style commands if added later
			const cleanedRaw = stripSafeStderrRedirects(segment.raw);
			const reparsed = parser.parse(cleanedRaw);
			if (!reparsed.ok) return false;
			const normalizedSegment = reparsed.parsed.pipelines[0]?.segments[0];
			if (!normalizedSegment) return false;

			if (validatePolicyForSegment(normalizedSegment, context, registry.resolvePolicy).ok) continue;
			if (matchesSimpleSafeCommand(cleanedRaw, simpleSafeCommands)) continue;
			if (matchesCoreSpecialCases(cleanedRaw, specialMatchers)) continue;
			return false;
		}

		return true;
	}

	return {
		isSafeCommand: isSafeCommandInternal,
		isCommandSafeViaFlagParsing: isCommandSafeViaFlagParsingInternal,
		getRegisteredPolicyPatterns: () => registry.policies.map((policy) => policy.pattern),
	};
}

const defaultEngine = createBashSafetyEngine();

export function isCommandSafeViaFlagParsing(command: string): boolean {
	return defaultEngine.isCommandSafeViaFlagParsing(command);
}

export function isSafeCommand(command: string): boolean {
	return defaultEngine.isSafeCommand(command);
}

export function getRegisteredPolicyPatterns(): string[] {
	return defaultEngine.getRegisteredPolicyPatterns();
}
