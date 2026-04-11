import type { CommandConfig, FlagArgType } from "../types.js";
import { tokenizeCommand } from "../parser.js";

// ── Shared Git Flag Groups ───────────────────────────────────────────
// Ported from readOnlyCommandValidation.ts

const GIT_REF_SELECTION_FLAGS: Record<string, FlagArgType> = {
	"--all": "none",
	"--branches": "none",
	"--tags": "none",
	"--remotes": "none",
};

const GIT_DATE_FILTER_FLAGS: Record<string, FlagArgType> = {
	"--since": "string",
	"--after": "string",
	"--until": "string",
	"--before": "string",
};

const GIT_LOG_DISPLAY_FLAGS: Record<string, FlagArgType> = {
	"--oneline": "none",
	"--graph": "none",
	"--decorate": "none",
	"--no-decorate": "none",
	"--date": "string",
	"--relative-date": "none",
};

const GIT_COUNT_FLAGS: Record<string, FlagArgType> = {
	"--max-count": "number",
	"-n": "number",
};

const GIT_STAT_FLAGS: Record<string, FlagArgType> = {
	"--stat": "none",
	"--numstat": "none",
	"--shortstat": "none",
	"--name-only": "none",
	"--name-status": "none",
};

const GIT_COLOR_FLAGS: Record<string, FlagArgType> = {
	"--color": "none",
	"--no-color": "none",
};

const GIT_PATCH_FLAGS: Record<string, FlagArgType> = {
	"--patch": "none",
	"-p": "none",
	"--no-patch": "none",
	"--no-ext-diff": "none",
	"-s": "none",
};

const GIT_AUTHOR_FILTER_FLAGS: Record<string, FlagArgType> = {
	"--author": "string",
	"--committer": "string",
	"--grep": "string",
};

// ── FD Safe Flags ────────────────────────────────────────────────────
// Shared between fd and fdfind (Debian/Ubuntu package name)
// SECURITY: -x/--exec and -X/--exec-batch are deliberately excluded.

const FD_SAFE_FLAGS: Record<string, FlagArgType> = {
	"-h": "none",
	"--help": "none",
	"-V": "none",
	"--version": "none",
	"-H": "none",
	"--hidden": "none",
	"-I": "none",
	"--no-ignore": "none",
	"--no-ignore-vcs": "none",
	"--no-ignore-parent": "none",
	"-s": "none",
	"--case-sensitive": "none",
	"-i": "none",
	"--ignore-case": "none",
	"-g": "none",
	"--glob": "none",
	"--regex": "none",
	"-F": "none",
	"--fixed-strings": "none",
	"-a": "none",
	"--absolute-path": "none",
	"-L": "none",
	"--follow": "none",
	"-p": "none",
	"--full-path": "none",
	"-0": "none",
	"--print0": "none",
	"-d": "number",
	"--max-depth": "number",
	"--min-depth": "number",
	"--exact-depth": "number",
	"-t": "string",
	"--type": "string",
	"-e": "string",
	"--extension": "string",
	"-S": "string",
	"--size": "string",
	"--changed-within": "string",
	"--changed-before": "string",
	"-o": "string",
	"--owner": "string",
	"-E": "string",
	"--exclude": "string",
	"--ignore-file": "string",
	"-c": "string",
	"--color": "string",
	"-j": "number",
	"--threads": "number",
	"--max-buffer-time": "string",
	"--max-results": "number",
	"-1": "none",
	"-q": "none",
	"--quiet": "none",
	"--show-errors": "none",
	"--strip-cwd-prefix": "none",
	"--one-file-system": "none",
	"--prune": "none",
	"--search-path": "string",
	"--base-directory": "string",
	"--path-separator": "string",
	"--batch-size": "number",
	"--no-require-git": "none",
	"--hyperlink": "string",
	"--and": "string",
	"--format": "string",
};

// ── COMMAND_ALLOWLIST ────────────────────────────────────────────────
// Central configuration for allowlist-based command validation.
// All commands and flags here should only allow reading files.

export const COMMAND_ALLOWLIST: Record<string, CommandConfig> = {
	// ── Text search / processing ────────────────────────────────────

	grep: {
		safeFlags: {
			"-e": "string",
			"--regexp": "string",
			"-f": "string",
			"--file": "string",
			"-F": "none",
			"--fixed-strings": "none",
			"-G": "none",
			"--basic-regexp": "none",
			"-E": "none",
			"--extended-regexp": "none",
			"-P": "none",
			"--perl-regexp": "none",
			"-i": "none",
			"--ignore-case": "none",
			"--no-ignore-case": "none",
			"-v": "none",
			"--invert-match": "none",
			"-w": "none",
			"--word-regexp": "none",
			"-x": "none",
			"--line-regexp": "none",
			"-c": "none",
			"--count": "none",
			"--color": "string",
			"--colour": "string",
			"-L": "none",
			"--files-without-match": "none",
			"-l": "none",
			"--files-with-matches": "none",
			"-m": "number",
			"--max-count": "number",
			"-o": "none",
			"--only-matching": "none",
			"-q": "none",
			"--quiet": "none",
			"--silent": "none",
			"-s": "none",
			"--no-messages": "none",
			"-b": "none",
			"--byte-offset": "none",
			"-H": "none",
			"--with-filename": "none",
			"-h": "none",
			"--no-filename": "none",
			"--label": "string",
			"-n": "none",
			"--line-number": "none",
			"-T": "none",
			"--initial-tab": "none",
			"-u": "none",
			"--unix-byte-offsets": "none",
			"-Z": "none",
			"--null": "none",
			"-z": "none",
			"--null-data": "none",
			"-A": "number",
			"--after-context": "number",
			"-B": "number",
			"--before-context": "number",
			"-C": "number",
			"--context": "number",
			"--group-separator": "string",
			"--no-group-separator": "none",
			"-a": "none",
			"--text": "none",
			"--binary-files": "string",
			"-D": "string",
			"--devices": "string",
			"-d": "string",
			"--directories": "string",
			"--exclude": "string",
			"--exclude-from": "string",
			"--exclude-dir": "string",
			"--include": "string",
			"-r": "none",
			"--recursive": "none",
			"-R": "none",
			"--dereference-recursive": "none",
			"--line-buffered": "none",
			"-U": "none",
			"--binary": "none",
			"--help": "none",
			"-V": "none",
			"--version": "none",
		},
	},

	rg: {
		safeFlags: {
			"-e": "string",
			"--regexp": "string",
			"-f": "string",
			"-i": "none",
			"--ignore-case": "none",
			"-S": "none",
			"--smart-case": "none",
			"-F": "none",
			"--fixed-strings": "none",
			"-w": "none",
			"--word-regexp": "none",
			"-v": "none",
			"--invert-match": "none",
			"-c": "none",
			"--count": "none",
			"-l": "none",
			"--files-with-matches": "none",
			"--files-without-match": "none",
			"-n": "none",
			"--line-number": "none",
			"-o": "none",
			"--only-matching": "none",
			"-A": "number",
			"--after-context": "number",
			"-B": "number",
			"--before-context": "number",
			"-C": "number",
			"--context": "number",
			"-H": "none",
			"-h": "none",
			"--heading": "none",
			"--no-heading": "none",
			"-q": "none",
			"--quiet": "none",
			"--column": "none",
			"-g": "string",
			"--glob": "string",
			"-t": "string",
			"--type": "string",
			"-T": "string",
			"--type-not": "string",
			"--type-list": "none",
			"--hidden": "none",
			"--no-ignore": "none",
			"-u": "none",
			"-m": "number",
			"--max-count": "number",
			"-d": "number",
			"--max-depth": "number",
			"-a": "none",
			"--text": "none",
			"-z": "none",
			"-L": "none",
			"--follow": "none",
			"--color": "string",
			"--json": "none",
			"--stats": "none",
			"--help": "none",
			"--version": "none",
			"--debug": "none",
			"--": "none",
		},
	},

	sort: {
		safeFlags: {
			"--ignore-leading-blanks": "none",
			"-b": "none",
			"--dictionary-order": "none",
			"-d": "none",
			"--ignore-case": "none",
			"-f": "none",
			"--general-numeric-sort": "none",
			"-g": "none",
			"--human-numeric-sort": "none",
			"-h": "none",
			"--ignore-nonprinting": "none",
			"-i": "none",
			"--month-sort": "none",
			"-M": "none",
			"--numeric-sort": "none",
			"-n": "none",
			"--random-sort": "none",
			"-R": "none",
			"--reverse": "none",
			"-r": "none",
			"--sort": "string",
			"--stable": "none",
			"-s": "none",
			"--unique": "none",
			"-u": "none",
			"--version-sort": "none",
			"-V": "none",
			"--zero-terminated": "none",
			"-z": "none",
			"--key": "string",
			"-k": "string",
			"--field-separator": "string",
			"-t": "string",
			"--check": "none",
			"-c": "none",
			"--check-char-order": "none",
			"-C": "none",
			"--merge": "none",
			"-m": "none",
			"--buffer-size": "string",
			"-S": "string",
			"--parallel": "number",
			"--batch-size": "number",
			"--help": "none",
			"--version": "none",
		},
	},

	sed: {
		safeFlags: {
			"--expression": "string",
			"-e": "string",
			"--quiet": "none",
			"--silent": "none",
			"-n": "none",
			"--regexp-extended": "none",
			"-r": "none",
			"--posix": "none",
			"-E": "none",
			"--line-length": "number",
			"-l": "number",
			"--zero-terminated": "none",
			"-z": "none",
			"--separate": "none",
			"-s": "none",
			"--unbuffered": "none",
			"-u": "none",
			"--debug": "none",
			"--help": "none",
			"--version": "none",
		},
		additionalCommandIsDangerousCallback: (
			rawCommand: string,
			_args: string[],
		) => !sedCommandIsAllowedByAllowlist(rawCommand),
	},

	// ── File inspection ─────────────────────────────────────────────

	tree: {
		safeFlags: {
			"-a": "none",
			"-d": "none",
			"-l": "none",
			"-f": "none",
			"-x": "none",
			"-L": "number",
			"-P": "string",
			"-I": "string",
			"--gitignore": "none",
			"--gitfile": "string",
			"--ignore-case": "none",
			"--matchdirs": "none",
			"--metafirst": "none",
			"--prune": "none",
			"--info": "none",
			"--infofile": "string",
			"--noreport": "none",
			"--charset": "string",
			"--filelimit": "number",
			"-q": "none",
			"-N": "none",
			"-Q": "none",
			"-p": "none",
			"-u": "none",
			"-g": "none",
			"-s": "none",
			"-h": "none",
			"--si": "none",
			"--du": "none",
			"-D": "none",
			"--timefmt": "string",
			"-F": "none",
			"--inodes": "none",
			"--device": "none",
			"-v": "none",
			"-t": "none",
			"-c": "none",
			"-U": "none",
			"-r": "none",
			"--dirsfirst": "none",
			"--filesfirst": "none",
			"--sort": "string",
			"-i": "none",
			"-A": "none",
			"-S": "none",
			"-n": "none",
			"-C": "none",
			"-X": "none",
			"-J": "none",
			"-H": "string",
			"--nolinks": "none",
			"--hintro": "string",
			"--houtro": "string",
			"-T": "string",
			"--hyperlink": "none",
			"--scheme": "string",
			"--authority": "string",
			"--fromfile": "none",
			"--fromtabfile": "none",
			"--fflinks": "none",
			"--help": "none",
			"--version": "none",
		},
	},

	file: {
		safeFlags: {
			"--brief": "none",
			"-b": "none",
			"--mime": "none",
			"-i": "none",
			"--mime-type": "none",
			"--mime-encoding": "none",
			"--apple": "none",
			"--check-encoding": "none",
			"-c": "none",
			"--exclude": "string",
			"--exclude-quiet": "string",
			"--print0": "none",
			"-0": "none",
			"-f": "string",
			"-F": "string",
			"--separator": "string",
			"--help": "none",
			"--version": "none",
			"-v": "none",
			"--no-dereference": "none",
			"-h": "none",
			"--dereference": "none",
			"-L": "none",
			"--magic-file": "string",
			"-m": "string",
			"--keep-going": "none",
			"-k": "none",
			"--list": "none",
			"-l": "none",
			"--no-buffer": "none",
			"-n": "none",
			"--preserve-date": "none",
			"-p": "none",
			"--raw": "none",
			"-r": "none",
			"-s": "none",
			"--special-files": "none",
			"--uncompress": "none",
			"-z": "none",
		},
	},

	// ── Checksum commands ───────────────────────────────────────────

	sha256sum: {
		safeFlags: {
			"-b": "none",
			"--binary": "none",
			"-t": "none",
			"--text": "none",
			"-c": "none",
			"--check": "none",
			"--ignore-missing": "none",
			"--quiet": "none",
			"--status": "none",
			"--strict": "none",
			"-w": "none",
			"--warn": "none",
			"--tag": "none",
			"-z": "none",
			"--zero": "none",
			"--help": "none",
			"--version": "none",
		},
	},

	sha1sum: {
		safeFlags: {
			"-b": "none",
			"--binary": "none",
			"-t": "none",
			"--text": "none",
			"-c": "none",
			"--check": "none",
			"--ignore-missing": "none",
			"--quiet": "none",
			"--status": "none",
			"--strict": "none",
			"-w": "none",
			"--warn": "none",
			"--tag": "none",
			"-z": "none",
			"--zero": "none",
			"--help": "none",
			"--version": "none",
		},
	},

	md5sum: {
		safeFlags: {
			"-b": "none",
			"--binary": "none",
			"-t": "none",
			"--text": "none",
			"-c": "none",
			"--check": "none",
			"--ignore-missing": "none",
			"--quiet": "none",
			"--status": "none",
			"--strict": "none",
			"-w": "none",
			"--warn": "none",
			"--tag": "none",
			"-z": "none",
			"--zero": "none",
			"--help": "none",
			"--version": "none",
		},
	},

	// ── System info commands ────────────────────────────────────────

	date: {
		safeFlags: {
			"-d": "string",
			"--date": "string",
			"-r": "string",
			"--reference": "string",
			"-u": "none",
			"--utc": "none",
			"--universal": "none",
			"-I": "none",
			"--iso-8601": "string",
			"-R": "none",
			"--rfc-email": "none",
			"--rfc-3339": "string",
			"--debug": "none",
			"--help": "none",
			"--version": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const flagsWithArgs = new Set([
				"-d",
				"--date",
				"-r",
				"--reference",
				"--iso-8601",
				"--rfc-3339",
			]);
			let i = 0;
			while (i < args.length) {
				const token = args[i];
				if (token === undefined) {
					i++;
					continue;
				}
				if (token.startsWith("--") && token.includes("=")) {
					i++;
				} else if (token.startsWith("-")) {
					if (flagsWithArgs.has(token)) {
						i += 2;
					} else {
						i++;
					}
				} else {
					if (!token.startsWith("+")) {
						return true; // Positional arg could set system time
					}
					i++;
				}
			}
			return false;
		},
	},

	hostname: {
		safeFlags: {
			"-f": "none",
			"--fqdn": "none",
			"--long": "none",
			"-s": "none",
			"--short": "none",
			"-i": "none",
			"--ip-address": "none",
			"-I": "none",
			"--all-ip-addresses": "none",
			"-a": "none",
			"--alias": "none",
			"-d": "none",
			"--domain": "none",
			"-A": "none",
			"--all-fqdns": "none",
			"-v": "none",
			"--verbose": "none",
			"-h": "none",
			"--help": "none",
			"-V": "none",
			"--version": "none",
		},
		regex: /^hostname(?:\s+(?:-[a-zA-Z]|--[a-zA-Z-]+))*\s*$/,
	},

	ps: {
		safeFlags: {
			"-e": "none",
			"-A": "none",
			"-a": "none",
			"-d": "none",
			"-N": "none",
			"--deselect": "none",
			"-f": "none",
			"-F": "none",
			"-l": "none",
			"-j": "none",
			"-y": "none",
			"-w": "none",
			"-ww": "none",
			"--width": "number",
			"-c": "none",
			"-H": "none",
			"--forest": "none",
			"--headers": "none",
			"--no-headers": "none",
			"-n": "string",
			"--sort": "string",
			"-L": "none",
			"-T": "none",
			"-m": "none",
			"-C": "string",
			"-G": "string",
			"-g": "string",
			"-p": "string",
			"--pid": "string",
			"-q": "string",
			"--quick-pid": "string",
			"-s": "string",
			"--sid": "string",
			"-t": "string",
			"--tty": "string",
			"-U": "string",
			"-u": "string",
			"--user": "string",
			"--help": "none",
			"--info": "none",
			"-V": "none",
			"--version": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			return args.some(
				(a) => !a.startsWith("-") && /^[a-zA-Z]*e[a-zA-Z]*$/.test(a),
			);
		},
	},

	base64: {
		respectsDoubleDash: false, // macOS base64 does not respect POSIX --
		safeFlags: {
			"-d": "none",
			"-D": "none",
			"--decode": "none",
			"-b": "number",
			"--break": "number",
			"-w": "number",
			"--wrap": "number",
			"-i": "string",
			"--input": "string",
			"--ignore-garbage": "none",
			"-h": "none",
			"--help": "none",
			"--version": "none",
		},
	},

	netstat: {
		safeFlags: {
			"-a": "none",
			"-L": "none",
			"-l": "none",
			"-n": "none",
			"-f": "string",
			"-g": "none",
			"-i": "none",
			"-I": "string",
			"-s": "none",
			"-r": "none",
			"-m": "none",
			"-v": "none",
		},
	},

	pgrep: {
		safeFlags: {
			"-d": "string",
			"--delimiter": "string",
			"-l": "none",
			"--list-name": "none",
			"-a": "none",
			"--list-full": "none",
			"-v": "none",
			"--inverse": "none",
			"-w": "none",
			"--lightweight": "none",
			"-c": "none",
			"--count": "none",
			"-f": "none",
			"--full": "none",
			"-g": "string",
			"--pgroup": "string",
			"-G": "string",
			"--group": "string",
			"-i": "none",
			"--ignore-case": "none",
			"-n": "none",
			"--newest": "none",
			"-o": "none",
			"--oldest": "none",
			"-O": "string",
			"--older": "string",
			"-P": "string",
			"--parent": "string",
			"-s": "string",
			"--session": "string",
			"-t": "string",
			"--terminal": "string",
			"-u": "string",
			"--euid": "string",
			"-U": "string",
			"--uid": "string",
			"-x": "none",
			"--exact": "none",
			"-F": "string",
			"--pidfile": "string",
			"-L": "none",
			"--logpidfile": "none",
			"-r": "string",
			"--runstates": "string",
			"--ns": "string",
			"--nslist": "string",
			"--help": "none",
			"-V": "none",
			"--version": "none",
		},
	},

	tput: {
		safeFlags: {
			"-T": "string",
			"-V": "none",
			"-x": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const DANGEROUS_CAPABILITIES = new Set([
				"init",
				"reset",
				"rs1",
				"rs2",
				"rs3",
				"is1",
				"is2",
				"is3",
				"iprog",
				"if",
				"rf",
				"clear",
				"flash",
				"mc0",
				"mc4",
				"mc5",
				"mc5i",
				"mc5p",
				"pfkey",
				"pfloc",
				"pfx",
				"pfxl",
				"smcup",
				"rmcup",
			]);
			const flagsWithArgs = new Set(["-T"]);
			let i = 0;
			let afterDoubleDash = false;
			while (i < args.length) {
				const token = args[i];
				if (token === undefined) {
					i++;
					continue;
				}
				if (token === "--") {
					afterDoubleDash = true;
					i++;
				} else if (!afterDoubleDash && token.startsWith("-")) {
					if (token === "-S") return true;
					if (
						!token.startsWith("--") &&
						token.length > 2 &&
						token.includes("S")
					)
						return true;
					if (flagsWithArgs.has(token)) {
						i += 2;
					} else {
						i++;
					}
				} else {
					if (DANGEROUS_CAPABILITIES.has(token)) return true;
					i++;
				}
			}
			return false;
		},
	},

	ss: {
		safeFlags: {
			"-h": "none",
			"--help": "none",
			"-V": "none",
			"--version": "none",
			"-n": "none",
			"--numeric": "none",
			"-r": "none",
			"--resolve": "none",
			"-a": "none",
			"--all": "none",
			"-l": "none",
			"--listening": "none",
			"-o": "none",
			"--options": "none",
			"-e": "none",
			"--extended": "none",
			"-m": "none",
			"--memory": "none",
			"-p": "none",
			"--processes": "none",
			"-i": "none",
			"--info": "none",
			"-s": "none",
			"--summary": "none",
			"-4": "none",
			"--ipv4": "none",
			"-6": "none",
			"--ipv6": "none",
			"-0": "none",
			"--packet": "none",
			"-t": "none",
			"--tcp": "none",
			"-M": "none",
			"--mptcp": "none",
			"-S": "none",
			"--sctp": "none",
			"-u": "none",
			"--udp": "none",
			"-d": "none",
			"--dccp": "none",
			"-w": "none",
			"--raw": "none",
			"-x": "none",
			"--unix": "none",
			"--tipc": "none",
			"--vsock": "none",
			"-f": "string",
			"--family": "string",
			"-A": "string",
			"--query": "string",
			"--socket": "string",
			"-Z": "none",
			"--context": "none",
			"-z": "none",
			"--contexts": "none",
			"-b": "none",
			"--bpf": "none",
			"-E": "none",
			"--events": "none",
			"-H": "none",
			"--no-header": "none",
			"-O": "none",
			"--oneline": "none",
			"--tipcinfo": "none",
			"--tos": "none",
			"--cgroup": "none",
			"--inet-sockopt": "none",
		},
	},

	lsof: {
		safeFlags: {
			"-?": "none",
			"-h": "none",
			"-v": "none",
			"-a": "none",
			"-b": "none",
			"-C": "none",
			"-l": "none",
			"-n": "none",
			"-N": "none",
			"-O": "none",
			"-P": "none",
			"-Q": "none",
			"-R": "none",
			"-t": "none",
			"-U": "none",
			"-V": "none",
			"-X": "none",
			"-H": "none",
			"-E": "none",
			"-F": "none",
			"-g": "none",
			"-i": "none",
			"-K": "none",
			"-L": "none",
			"-o": "none",
			"-r": "none",
			"-s": "none",
			"-S": "none",
			"-T": "none",
			"-x": "none",
			"-A": "string",
			"-c": "string",
			"-d": "string",
			"-e": "string",
			"-k": "string",
			"-p": "string",
			"-u": "string",
		},
		additionalCommandIsDangerousCallback: (_rawCommand, args) =>
			args.some((a) => a === "+m" || a.startsWith("+m")),
	},

	// ── Help / documentation ────────────────────────────────────────

	info: {
		safeFlags: {
			"-f": "string",
			"--file": "string",
			"-d": "string",
			"--directory": "string",
			"-n": "string",
			"--node": "string",
			"-a": "none",
			"--all": "none",
			"-k": "string",
			"--apropos": "string",
			"-w": "none",
			"--where": "none",
			"--location": "none",
			"--show-options": "none",
			"--vi-keys": "none",
			"--subnodes": "none",
			"-h": "none",
			"--help": "none",
			"--usage": "none",
			"--version": "none",
		},
	},

	man: {
		safeFlags: {
			"-a": "none",
			"--all": "none",
			"-d": "none",
			"-f": "none",
			"--whatis": "none",
			"-h": "none",
			"-k": "none",
			"--apropos": "none",
			"-l": "string",
			"-w": "none",
			"-S": "string",
			"-s": "string",
		},
	},

	help: {
		safeFlags: {
			"-d": "none",
			"-m": "none",
			"-s": "none",
		},
	},

	// ── File finder ─────────────────────────────────────────────────

	fd: { safeFlags: { ...FD_SAFE_FLAGS } },
	fdfind: { safeFlags: { ...FD_SAFE_FLAGS } },

	// ── xargs ───────────────────────────────────────────────────────

	xargs: {
		safeFlags: {
			"-I": "{}",
			"-n": "number",
			"-P": "number",
			"-L": "number",
			"-s": "number",
			"-E": "EOF",
			"-0": "none",
			"-t": "none",
			"-r": "none",
			"-x": "none",
			"-d": "char",
		},
	},

	// ── Docker (read-only) ──────────────────────────────────────────

	"docker logs": {
		safeFlags: {
			"--follow": "none",
			"-f": "none",
			"--tail": "string",
			"-n": "string",
			"--timestamps": "none",
			"-t": "none",
			"--since": "string",
			"--until": "string",
			"--details": "none",
		},
	},

	"docker inspect": {
		safeFlags: {
			"--format": "string",
			"-f": "string",
			"--type": "string",
			"--size": "none",
			"-s": "none",
		},
	},

	// ── Git read-only commands ──────────────────────────────────────

	"git diff": {
		safeFlags: {
			...GIT_STAT_FLAGS,
			...GIT_COLOR_FLAGS,
			"--dirstat": "none",
			"--summary": "none",
			"--patch-with-stat": "none",
			"--word-diff": "none",
			"--word-diff-regex": "string",
			"--color-words": "none",
			"--no-renames": "none",
			"--no-ext-diff": "none",
			"--check": "none",
			"--ws-error-highlight": "string",
			"--full-index": "none",
			"--binary": "none",
			"--abbrev": "number",
			"--break-rewrites": "none",
			"--find-renames": "none",
			"--find-copies": "none",
			"--find-copies-harder": "none",
			"--irreversible-delete": "none",
			"--diff-algorithm": "string",
			"--histogram": "none",
			"--patience": "none",
			"--minimal": "none",
			"--ignore-space-at-eol": "none",
			"--ignore-space-change": "none",
			"--ignore-all-space": "none",
			"--ignore-blank-lines": "none",
			"--inter-hunk-context": "number",
			"--function-context": "none",
			"--exit-code": "none",
			"--quiet": "none",
			"--cached": "none",
			"--staged": "none",
			"--pickaxe-regex": "none",
			"--pickaxe-all": "none",
			"--no-index": "none",
			"--relative": "string",
			"--diff-filter": "string",
			"-p": "none",
			"-u": "none",
			"-s": "none",
			"-M": "none",
			"-C": "none",
			"-B": "none",
			"-D": "none",
			"-l": "none",
			"-S": "string",
			"-G": "string",
			"-O": "string",
			"-R": "none",
		},
	},

	"git log": {
		safeFlags: {
			...GIT_LOG_DISPLAY_FLAGS,
			...GIT_REF_SELECTION_FLAGS,
			...GIT_DATE_FILTER_FLAGS,
			...GIT_COUNT_FLAGS,
			...GIT_STAT_FLAGS,
			...GIT_COLOR_FLAGS,
			...GIT_PATCH_FLAGS,
			...GIT_AUTHOR_FILTER_FLAGS,
			"--abbrev-commit": "none",
			"--full-history": "none",
			"--dense": "none",
			"--sparse": "none",
			"--simplify-merges": "none",
			"--ancestry-path": "none",
			"--source": "none",
			"--first-parent": "none",
			"--merges": "none",
			"--no-merges": "none",
			"--reverse": "none",
			"--walk-reflogs": "none",
			"--skip": "number",
			"--max-age": "number",
			"--min-age": "number",
			"--no-min-parents": "none",
			"--no-max-parents": "none",
			"--follow": "none",
			"--no-walk": "none",
			"--left-right": "none",
			"--cherry-mark": "none",
			"--cherry-pick": "none",
			"--boundary": "none",
			"--topo-order": "none",
			"--date-order": "none",
			"--author-date-order": "none",
			"--pretty": "string",
			"--format": "string",
			"--diff-filter": "string",
			"-S": "string",
			"-G": "string",
			"--pickaxe-regex": "none",
			"--pickaxe-all": "none",
		},
	},

	"git show": {
		safeFlags: {
			...GIT_LOG_DISPLAY_FLAGS,
			...GIT_STAT_FLAGS,
			...GIT_COLOR_FLAGS,
			...GIT_PATCH_FLAGS,
			"--abbrev-commit": "none",
			"--word-diff": "none",
			"--word-diff-regex": "string",
			"--color-words": "none",
			"--pretty": "string",
			"--format": "string",
			"--first-parent": "none",
			"--raw": "none",
			"--diff-filter": "string",
			"-m": "none",
			"--quiet": "none",
		},
	},

	"git shortlog": {
		safeFlags: {
			...GIT_REF_SELECTION_FLAGS,
			...GIT_DATE_FILTER_FLAGS,
			"-s": "none",
			"--summary": "none",
			"-n": "none",
			"--numbered": "none",
			"-e": "none",
			"--email": "none",
			"-c": "none",
			"--committer": "none",
			"--group": "string",
			"--format": "string",
			"--no-merges": "none",
			"--author": "string",
		},
	},

	"git reflog": {
		safeFlags: {
			...GIT_LOG_DISPLAY_FLAGS,
			...GIT_REF_SELECTION_FLAGS,
			...GIT_DATE_FILTER_FLAGS,
			...GIT_COUNT_FLAGS,
			...GIT_AUTHOR_FILTER_FLAGS,
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const DANGEROUS_SUBCOMMANDS = new Set([
				"expire",
				"delete",
				"exists",
			]);
			for (const token of args) {
				if (!token || token.startsWith("-")) continue;
				if (DANGEROUS_SUBCOMMANDS.has(token)) {
					return true;
				}
				return false;
			}
			return false;
		},
	},

	"git stash list": {
		safeFlags: {
			...GIT_LOG_DISPLAY_FLAGS,
			...GIT_REF_SELECTION_FLAGS,
			...GIT_COUNT_FLAGS,
		},
	},

	"git ls-remote": {
		safeFlags: {
			"--branches": "none",
			"-b": "none",
			"--tags": "none",
			"-t": "none",
			"--heads": "none",
			"-h": "none",
			"--refs": "none",
			"--quiet": "none",
			"-q": "none",
			"--exit-code": "none",
			"--get-url": "none",
			"--symref": "none",
			"--sort": "string",
		},
	},

	"git status": {
		safeFlags: {
			"--short": "none",
			"-s": "none",
			"--branch": "none",
			"-b": "none",
			"--porcelain": "none",
			"--long": "none",
			"--verbose": "none",
			"-v": "none",
			"--untracked-files": "string",
			"-u": "string",
			"--ignored": "none",
			"--ignore-submodules": "string",
			"--column": "none",
			"--no-column": "none",
			"--ahead-behind": "none",
			"--no-ahead-behind": "none",
			"--renames": "none",
			"--no-renames": "none",
			"--find-renames": "string",
			"-M": "string",
		},
	},

	"git blame": {
		safeFlags: {
			...GIT_COLOR_FLAGS,
			"-L": "string",
			"--porcelain": "none",
			"-p": "none",
			"--line-porcelain": "none",
			"--incremental": "none",
			"--root": "none",
			"--show-stats": "none",
			"--show-name": "none",
			"--show-number": "none",
			"-n": "none",
			"--show-email": "none",
			"-e": "none",
			"-f": "none",
			"--date": "string",
			"-w": "none",
			"--ignore-rev": "string",
			"--ignore-revs-file": "string",
			"-M": "none",
			"-C": "none",
			"--score-debug": "none",
			"--abbrev": "number",
			"-s": "none",
			"-l": "none",
			"-t": "none",
		},
	},

	"git ls-files": {
		safeFlags: {
			"--cached": "none",
			"-c": "none",
			"--deleted": "none",
			"-d": "none",
			"--modified": "none",
			"-m": "none",
			"--others": "none",
			"-o": "none",
			"--ignored": "none",
			"-i": "none",
			"--stage": "none",
			"-s": "none",
			"--killed": "none",
			"-k": "none",
			"--unmerged": "none",
			"-u": "none",
			"--directory": "none",
			"--no-empty-directory": "none",
			"--eol": "none",
			"--full-name": "none",
			"--abbrev": "number",
			"--debug": "none",
			"-z": "none",
			"-t": "none",
			"-v": "none",
			"-f": "none",
			"--exclude": "string",
			"-x": "string",
			"--exclude-from": "string",
			"-X": "string",
			"--exclude-per-directory": "string",
			"--exclude-standard": "none",
			"--error-unmatch": "none",
			"--recurse-submodules": "none",
		},
	},

	"git config --get": {
		safeFlags: {
			"--local": "none",
			"--global": "none",
			"--system": "none",
			"--worktree": "none",
			"--default": "string",
			"--type": "string",
			"--bool": "none",
			"--int": "none",
			"--bool-or-int": "none",
			"--path": "none",
			"--expiry-date": "none",
			"-z": "none",
			"--null": "none",
			"--name-only": "none",
			"--show-origin": "none",
			"--show-scope": "none",
		},
	},

	"git remote show": {
		safeFlags: {
			"-n": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const positional = args.filter((a) => a !== "-n");
			if (positional.length !== 1) return true;
			return !/^[a-zA-Z0-9_-]+$/.test(positional[0]!);
		},
	},

	"git remote": {
		safeFlags: {
			"-v": "none",
			"--verbose": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			return args.some((a) => a !== "-v" && a !== "--verbose");
		},
	},

	"git merge-base": {
		safeFlags: {
			"--is-ancestor": "none",
			"--fork-point": "none",
			"--octopus": "none",
			"--independent": "none",
			"--all": "none",
		},
	},

	"git rev-parse": {
		safeFlags: {
			"--verify": "none",
			"--short": "string",
			"--abbrev-ref": "none",
			"--symbolic": "none",
			"--symbolic-full-name": "none",
			"--show-toplevel": "none",
			"--show-cdup": "none",
			"--show-prefix": "none",
			"--git-dir": "none",
			"--git-common-dir": "none",
			"--absolute-git-dir": "none",
			"--show-superproject-working-tree": "none",
			"--is-inside-work-tree": "none",
			"--is-inside-git-dir": "none",
			"--is-bare-repository": "none",
			"--is-shallow-repository": "none",
			"--is-shallow-update": "none",
			"--path-prefix": "none",
		},
	},

	"git rev-list": {
		safeFlags: {
			...GIT_REF_SELECTION_FLAGS,
			...GIT_DATE_FILTER_FLAGS,
			...GIT_COUNT_FLAGS,
			...GIT_AUTHOR_FILTER_FLAGS,
			"--count": "none",
			"--reverse": "none",
			"--first-parent": "none",
			"--ancestry-path": "none",
			"--merges": "none",
			"--no-merges": "none",
			"--min-parents": "number",
			"--max-parents": "number",
			"--no-min-parents": "none",
			"--no-max-parents": "none",
			"--skip": "number",
			"--max-age": "number",
			"--min-age": "number",
			"--walk-reflogs": "none",
			"--oneline": "none",
			"--abbrev-commit": "none",
			"--pretty": "string",
			"--format": "string",
			"--abbrev": "number",
			"--full-history": "none",
			"--dense": "none",
			"--sparse": "none",
			"--source": "none",
			"--graph": "none",
		},
	},

	"git describe": {
		safeFlags: {
			"--tags": "none",
			"--match": "string",
			"--exclude": "string",
			"--long": "none",
			"--abbrev": "number",
			"--always": "none",
			"--contains": "none",
			"--first-match": "none",
			"--exact-match": "none",
			"--candidates": "number",
			"--dirty": "none",
			"--broken": "none",
		},
	},

	"git cat-file": {
		safeFlags: {
			"-t": "none",
			"-s": "none",
			"-p": "none",
			"-e": "none",
			"--batch-check": "none",
			"--allow-undetermined-type": "none",
		},
	},

	"git for-each-ref": {
		safeFlags: {
			"--format": "string",
			"--sort": "string",
			"--count": "number",
			"--contains": "string",
			"--no-contains": "string",
			"--merged": "string",
			"--no-merged": "string",
			"--points-at": "string",
		},
	},

	"git grep": {
		safeFlags: {
			"-e": "string",
			"-E": "none",
			"--extended-regexp": "none",
			"-G": "none",
			"--basic-regexp": "none",
			"-F": "none",
			"--fixed-strings": "none",
			"-P": "none",
			"--perl-regexp": "none",
			"-i": "none",
			"--ignore-case": "none",
			"-v": "none",
			"--invert-match": "none",
			"-w": "none",
			"--word-regexp": "none",
			"-n": "none",
			"--line-number": "none",
			"-c": "none",
			"--count": "none",
			"-l": "none",
			"--files-with-matches": "none",
			"-L": "none",
			"--files-without-match": "none",
			"-h": "none",
			"-H": "none",
			"--heading": "none",
			"--break": "none",
			"--full-name": "none",
			"--color": "none",
			"--no-color": "none",
			"-o": "none",
			"--only-matching": "none",
			"-A": "number",
			"--after-context": "number",
			"-B": "number",
			"--before-context": "number",
			"-C": "number",
			"--context": "number",
			"--and": "none",
			"--or": "none",
			"--not": "none",
			"--max-depth": "number",
			"--untracked": "none",
			"--no-index": "none",
			"--recurse-submodules": "none",
			"--cached": "none",
			"--threads": "number",
			"-q": "none",
			"--quiet": "none",
		},
	},

	"git stash show": {
		safeFlags: {
			...GIT_STAT_FLAGS,
			...GIT_COLOR_FLAGS,
			...GIT_PATCH_FLAGS,
			"--word-diff": "none",
			"--word-diff-regex": "string",
			"--diff-filter": "string",
			"--abbrev": "number",
		},
	},

	"git worktree list": {
		safeFlags: {
			"--porcelain": "none",
			"-v": "none",
			"--verbose": "none",
			"--expire": "string",
		},
	},

	"git tag": {
		safeFlags: {
			"-l": "none",
			"--list": "none",
			"-n": "number",
			"--contains": "string",
			"--no-contains": "string",
			"--merged": "string",
			"--no-merged": "string",
			"--sort": "string",
			"--format": "string",
			"--points-at": "string",
			"--column": "none",
			"--no-column": "none",
			"-i": "none",
			"--ignore-case": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const flagsWithArgs = new Set([
				"--contains",
				"--no-contains",
				"--merged",
				"--no-merged",
				"--points-at",
				"--sort",
				"--format",
				"-n",
			]);
			let i = 0;
			let seenListFlag = false;
			let seenDashDash = false;
			while (i < args.length) {
				const token = args[i];
				if (!token) {
					i++;
					continue;
				}
				if (token === "--" && !seenDashDash) {
					seenDashDash = true;
					i++;
					continue;
				}
				if (!seenDashDash && token.startsWith("-")) {
					if (token === "--list" || token === "-l") {
						seenListFlag = true;
					} else if (
						token[0] === "-" &&
						token[1] !== "-" &&
						token.length > 2 &&
						!token.includes("=") &&
						token.slice(1).includes("l")
					) {
						seenListFlag = true;
					}
					if (token.includes("=")) {
						i++;
					} else if (flagsWithArgs.has(token)) {
						i += 2;
					} else {
						i++;
					}
				} else {
					if (!seenListFlag) {
						return true; // Positional without --list = tag creation
					}
					i++;
				}
			}
			return false;
		},
	},

	"git branch": {
		safeFlags: {
			"-l": "none",
			"--list": "none",
			"-a": "none",
			"--all": "none",
			"-r": "none",
			"--remotes": "none",
			"-v": "none",
			"-vv": "none",
			"--verbose": "none",
			"--color": "none",
			"--no-color": "none",
			"--column": "none",
			"--no-column": "none",
			"--abbrev": "number",
			"--no-abbrev": "none",
			"--contains": "string",
			"--no-contains": "string",
			"--merged": "none",
			"--no-merged": "none",
			"--points-at": "string",
			"--sort": "string",
			"--show-current": "none",
			"-i": "none",
			"--ignore-case": "none",
		},
		additionalCommandIsDangerousCallback: (
			_rawCommand: string,
			args: string[],
		) => {
			const flagsWithArgs = new Set([
				"--contains",
				"--no-contains",
				"--points-at",
				"--sort",
			]);
			const flagsWithOptionalArgs = new Set(["--merged", "--no-merged"]);
			let i = 0;
			let lastFlag = "";
			let seenListFlag = false;
			let seenDashDash = false;
			while (i < args.length) {
				const token = args[i];
				if (!token) {
					i++;
					continue;
				}
				if (token === "--" && !seenDashDash) {
					seenDashDash = true;
					lastFlag = "";
					i++;
					continue;
				}
				if (!seenDashDash && token.startsWith("-")) {
					if (token === "--list" || token === "-l") {
						seenListFlag = true;
					} else if (
						token[0] === "-" &&
						token[1] !== "-" &&
						token.length > 2 &&
						!token.includes("=") &&
						token.slice(1).includes("l")
					) {
						seenListFlag = true;
					}
					if (token.includes("=")) {
						lastFlag = token.split("=")[0] || "";
						i++;
					} else if (flagsWithArgs.has(token)) {
						lastFlag = token;
						i += 2;
					} else {
						lastFlag = token;
						i++;
					}
				} else {
					const lastFlagHasOptionalArg =
						flagsWithOptionalArgs.has(lastFlag);
					if (!seenListFlag && !lastFlagHasOptionalArg) {
						return true;
					}
					i++;
				}
			}
			return false;
		},
	},
};

// ── Safe target commands for xargs ──────────────────────────────────

export const SAFE_TARGET_COMMANDS_FOR_XARGS = [
	"echo",
	"printf",
	"wc",
	"grep",
	"head",
	"tail",
];

// ── SIMPLE_SAFE_COMMANDS ────────────────────────────────────────────
// Commands with no dangerous flags. Validated with simple regex.
// These have NO flags that can write files, execute code, or make network requests.

export const SIMPLE_SAFE_COMMANDS: Set<string> = new Set([
	// File content viewing
	"cat",
	"head",
	"tail",
	"less",
	"more",
	"wc",
	"diff",
	"stat",
	"du",
	"df",
	// System info
	"id",
	"uname",
	"free",
	"basename",
	"dirname",
	"realpath",
	// Text processing
	"cut",
	"paste",
	"tr",
	"column",
	"tac",
	"rev",
	"fold",
	"expand",
	"unexpand",
	"fmt",
	"comm",
	"cmp",
	"numfmt",
	"readlink",
	"sleep",
	"which",
	"whereis",
	"type",
	"expr",
	"test",
	"getconf",
	"seq",
	"tsort",
	"pr",
	"true",
	"false",
	"whoami",
	"pwd",
	"cal",
	"uptime",
	"nproc",
	"groups",
	"locale",
	"strings",
	"hexdump",
	"od",
	"nl",
	"bat",
	"exa",
	"env",
	"printenv",
]);

// ── Sed Validation ──────────────────────────────────────────────────

/**
 * Simplified sed validation callback.
 * Allows:
 *   - `sed -n 'Np'` and `sed -n 'N,Mp'` print commands
 *   - `sed 's/pattern/replacement/flags'` with only g/p/i/I/m/M flags
 * Blocks:
 *   - -i flag (handled by omitting from safeFlags)
 *   - w/W/e/E commands (file write / code execution)
 */
export function sedCommandIsAllowedByAllowlist(rawCommand: string): boolean {
	// Extract the part after 'sed'
	const sedMatch = rawCommand.match(/^\s*sed\s+/);
	if (!sedMatch) return false;

	const argsStr = rawCommand.slice(sedMatch[0].length);

	// Extract expressions from quotes (single or double)
	const expressions: string[] = [];
	let hasNFlag = false;

	// Simple tokenization of sed args
	const tokens = tokenizeCommand(argsStr).map((token) => token.value);

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;

		if (token === "-n" || token === "--quiet" || token === "--silent") {
			hasNFlag = true;
		} else if (token === "-e" || token === "--expression") {
			i++; // skip the expression arg
			if (i < tokens.length && tokens[i]) {
				expressions.push(tokens[i]);
			}
		} else if (token.startsWith("-e=")) {
			expressions.push(token.slice(3));
		} else if (token.startsWith("--expression=")) {
			expressions.push(token.slice("--expression=".length));
		} else if (!token.startsWith("-")) {
			// First non-flag without -e is the expression
			if (expressions.length === 0) {
				expressions.push(token);
			}
		}
	}

	if (expressions.length === 0) return false;

	// Check each expression
	for (const expr of expressions) {
		// Allow semicolon-separated print commands with -n
		if (hasNFlag) {
			const subcmds = expr.split(";");
			for (const cmd of subcmds) {
				if (!isSedPrintCommand(cmd.trim())) {
					return false;
				}
			}
		} else {
			// Without -n, only allow substitution commands
			if (!isSedSubstitutionCommand(expr)) {
				return false;
			}
		}
	}

	return true;
}

/** Check if a sed subcommand is a print command: p, Np, or N,Mp */
function isSedPrintCommand(cmd: string): boolean {
	if (!cmd) return false;
	return /^(?:\d+|\d+,\d+)?p$/.test(cmd);
}

/** Check if a sed expression is a safe substitution: s/pattern/replacement/flags */
function isSedSubstitutionCommand(expr: string): boolean {
	const trimmed = expr.trim();
	if (!trimmed.startsWith("s")) return false;

	// Parse s/pattern/replacement/flags — only allow / delimiter
	const match = trimmed.match(/^s\/(.*?)$/);
	if (!match) return false;

	const rest = match[1]!;

	// Find the / delimiters (account for escapes)
	let delimiterCount = 0;
	let lastDelimiterPos = -1;
	let i = 0;
	while (i < rest.length) {
		if (rest[i] === "\\") {
			i += 2;
			continue;
		}
		if (rest[i] === "/") {
			delimiterCount++;
			lastDelimiterPos = i;
		}
		i++;
	}

	if (delimiterCount !== 2) return false;

	const flags = rest.slice(lastDelimiterPos + 1);

	// Only allow g, p, i, I, m, M flags
	if (!/^[gpimIM]*$/.test(flags)) return false;

	return true;
}

