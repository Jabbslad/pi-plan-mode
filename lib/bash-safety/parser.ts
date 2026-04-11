import type {
	ParsedArg,
	ParsedCommand,
	ParsedPipeline,
	ParsedSegment,
	ValidationResult,
} from "./types.js";
import { splitPipeSegments } from "./utils.js";

export interface ShellParser {
	parse(raw: string):
		| { ok: true; parsed: ParsedCommand }
		| { ok: false; stage: string; reason: string };
}

export function tokenizeCommand(command: string): ParsedArg[] {
	const tokens: ParsedArg[] = [];
	let current = "";
	let currentQuoted: ParsedArg["quoted"] = "none";
	let inSingle = false;
	let inDouble = false;

	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		if (ch === undefined) continue;

		if (inSingle) {
			if (ch === "'") {
				inSingle = false;
				continue;
			}
			current += ch;
			continue;
		}

		if (inDouble) {
			if (ch === '"') {
				inDouble = false;
				continue;
			}
			current += ch;
			continue;
		}

		if (/\s/.test(ch)) {
			if (current.length > 0) {
				tokens.push({ raw: current, value: current, quoted: currentQuoted });
				current = "";
				currentQuoted = "none";
			}
			continue;
		}

		if (ch === "'") {
			if (current.length === 0) currentQuoted = "single";
			inSingle = true;
			continue;
		}

		if (ch === '"') {
			if (current.length === 0) currentQuoted = "double";
			inDouble = true;
			continue;
		}

		current += ch;
	}

	if (inSingle || inDouble) {
		// Keep behavior permissive: unmatched quote still becomes a token.
	}

	if (current.length > 0) {
		tokens.push({ raw: current, value: current, quoted: currentQuoted });
	}

	return tokens;
}

export class BasicShellParser implements ShellParser {
	parse(raw: string):
		| { ok: true; parsed: ParsedCommand }
		| { ok: false; stage: string; reason: string } {
		const segmentsRaw = splitPipeSegments(raw);
		if (segmentsRaw.length === 0) {
			return { ok: false, stage: "parse", reason: "empty command" };
		}

		const segments: ParsedSegment[] = segmentsRaw.map((segmentRaw) => {
			const args = tokenizeCommand(segmentRaw);
			return {
				raw: segmentRaw,
				args,
				tokens: args.map((arg) => arg.value),
			};
		});

		const parsed: ParsedCommand = {
			raw,
			pipelines: [{ segments }],
		};

		return { ok: true, parsed };
	}
}
