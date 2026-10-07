/**
 * Error classification and status notes — the human-readable half.
 *
 * Every capture path (check failure, bridge log line, tool-call result) ends
 * in one capped line written to the base layer's `lastError`; `isUnityMissing`
 * decides whether that line is the known, developer-actionable "no Unity relay
 * detected" state (`unityMissing`) or a generic failure.
 */
import { ERROR_CAP } from "./constants.js";
import type { ToolCallResult } from "./types/index.js";

/** First non-empty line of a text block, capped. */
export function firstLine(text: unknown, cap: number = ERROR_CAP): string {
    const line = String(text ?? "")
        .split(/\r?\n/u)
        .find((candidate) => candidate.trim() !== "") ?? "";
    return line.trim().slice(0, cap);
}

/**
 * Recognizes the known, developer-actionable error "no Unity relay executable
 * was detected": our own ENOENT/discovery lines, and the relay's own
 * "connect refused"/"no editor"/"not running" answers that mean the binary ran
 * but found no Unity Editor to talk to. Anything else is a generic check or
 * connection error.
 * @param text - an error message (or first line thereof).
 * @returns true when the failure is the known executable-missing state.
 */
export function isUnityMissing(text: unknown): boolean {
    const message = String(text ?? "");
    return (
        /unity relay executable not found/iu.test(message) ||
        /relay executable not found/iu.test(message) ||
        /no unity (?:editor|instance|project) (?:found|running|connected)/iu.test(message) ||
        /failed to connect to unity (?:editor|mcp|bridge)/iu.test(message)
    );
}

/**
 * Summarize one Unity-tool call result for the card's status line. Failed
 * calls return "<tool> failed: <first text line>" — tool-level errors (no
 * editor connected, a denied connection) are returned to the calling agent and
 * never route through the bridge logger, so this is the only capture point.
 * Successes return null: the caller clears the stored error.
 * @param toolName - fully qualified registered name (`mcp__<server>__<tool>`).
 * @param result - settled tools-service execution result.
 * @returns the note, or null when the call did not fail.
 */
export function toolResultNote(toolName: string, result: ToolCallResult | null | undefined): string | null {
    if (!result || result.isError !== true) return null;
    const blocks = Array.isArray(result.content) ? result.content : [];
    let text = blocks
        .filter((block) => block && block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join(" ");
    if (text === "" && result.error && typeof result.error.message === "string") text = result.error.message;
    if (text === "") text = result.error === void 0 ? "unknown error" : String(result.error);
    return firstLine(`${toolName.split("__").pop()} failed: ${text}`);
}
