/**
 * Browser card controller — the safe reads that project a served value onto the
 * snapshot.
 *
 * The host serves base-layer status through the describe clone, and describe()
 * may carry no base layer at all; the controller's `publish` folds what is there
 * into the snapshot through these small, total readers so no field ever reads
 * `undefined`. They are pure, so the class keeps to just the store + actions.
 */
import type { UnityExecutableStatus } from "./snapshot.js";

/** Number read from any value, `fallback` when absent or not a number. */
export function readNumber(value: unknown, fallback: number): number {
    return typeof value === "number" ? value : fallback;
}

/** String read from any value, `fallback` when absent or not a string. */
export function readString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
}

/** Coerce the served per-row answers into the shape the card renders. */
export function readStatus(value: unknown): UnityExecutableStatus[] {
    if (!Array.isArray(value)) return [];
    const statuses: UnityExecutableStatus[] = [];
    for (const item of value) {
        if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
        const path = readString((item as { path?: unknown }).path, "");
        if (path === "") continue;
        statuses.push({
            path,
            version: readString((item as { version?: unknown }).version, ""),
            error: readString((item as { error?: unknown }).error, "")
        });
    }
    return statuses;
}
