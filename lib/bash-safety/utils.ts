import type { ParsedArg } from "./types.js";

export function extractCommandName(command: string): string {
	const trimmed = command.trim();
	const match = trimmed.match(/^(\S+)/);
	return match ? match[1].toLowerCase() : "";
}

export function makeRegexForSafeCommand(command: string): RegExp {
	return new RegExp(`^${command}(?:\\s|$)[^<>()$\`|{}&;\\n\\r]*$`);
}

export function stripSafeStderrRedirects(command: string): string {
	return command
		.replace(/\s*2>\/dev\/null\s*$/, "")
		.replace(/\s*2>&1\s*$/, "")
		.trim();
}

export function splitPipeSegments(raw: string): string[] {
	return raw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
}

export function parsedArgsToTokens(args: ParsedArg[]): string[] {
	return args.map((arg) => arg.value);
}
