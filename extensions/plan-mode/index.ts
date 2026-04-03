/**
 * Plan Mode Extension
 *
 * Structured workflow: explore → plan → approve → implement.
 * When enabled, tools are restricted to read-only + plan file writing.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle
 * - EnterPlanMode tool (agent-initiated, requires user approval)
 * - ExitPlanMode tool (plan approval: approve/edit/reject)
 * - Bash restricted to read-only commands
 * - Plan file management (unique slug per session)
 * - Plan step extraction and progress tracking
 * - Session persistence (state survives restart/compaction)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function planModeExtension(pi: ExtensionAPI): void {
	// TODO: Implement plan mode extension
	// See PRD.md for full requirements
}
