/** Shared types for bash safety validation. */

export type FlagArgType =
	| "none"
	| "number"
	| "string"
	| "char"
	| "{}"
	| "EOF";

export interface CommandConfig {
	safeFlags: Record<string, FlagArgType>;
	regex?: RegExp;
	additionalCommandIsDangerousCallback?: (
		rawCommand: string,
		args: string[],
	) => boolean;
	respectsDoubleDash?: boolean;
}

export type ValidationResult =
	| { ok: true }
	| { ok: false; stage: string; reason: string };

export interface ParsedArg {
	raw: string;
	value: string;
	quoted: "none" | "single" | "double";
}

export interface ParsedSegment {
	raw: string;
	tokens: string[];
	args: ParsedArg[];
}

export interface ParsedPipeline {
	segments: ParsedSegment[];
}

export interface ParsedCommand {
	raw: string;
	pipelines: ParsedPipeline[];
}

export interface ValidationContext {
	raw: string;
	// TODO: Extend ParsedCommand / ValidationContext with richer flow metadata so
	// command policies can make context-sensitive decisions about pipeline usage.
	// This should support future validators without coupling policies to raw shell
	// parsing details.
	parsed: ParsedCommand;
}

export interface CommandPolicyDefinition {
	pattern: string;
	category: "core" | "git" | "text" | "system" | "network";
	config: CommandConfig;
	notes?: string[];
	examples?: {
		allowed?: string[];
		blocked?: string[];
	};
}
