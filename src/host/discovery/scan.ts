/**
 * Relay discovery — the scan and the check run that tie it together.
 *
 * What one executable run does: probe every candidate it has (the row-config
 * list expanded through `$HOME`, the Windows profiles walked through the interop
 * mount on a WSL host, the saved rows' ids, the selection), publish the per-path
 * answer, and report the first runnable one. The candidate ordering lives in
 * ./candidates.ts; the `--version` probe + presence + identity helpers in
 * ./probe.ts.
 *
 * Unlike the Chrome plugin's scan, there is nothing here the probe must not run.
 * A `<relay> --version` call is a pure answer: no Editor instance, no
 * connection, no state change (measured 2026-10-07 against the Windows relay
 * through the interop mount), so every candidate earns a probe and a candidate
 * that answers nothing simply drops off the list.
 */
import { firstLine } from "../status.js";
import type { UnityExecutableStatus, UnityMcpConfig } from "../types/index.js";

import { defaultRelayPaths } from "./candidates.js";
import { identity, presentOnDisk, probeExecutable } from "./probe.js";

/**
 * What one run probes: every candidate it has — the row-config candidate list
 * (expanded, plus the Windows profiles when the host is WSL), the paths the
 * saved rows carry, and the current selection (see
 * {@link relayCandidates}) — probed in that order.
 *
 * A candidate that runs answers with its version line; one that is present but
 * not runnable (bad binary, a probe that timed out) keeps its place in the list
 * carrying the failure, so a broken pin stays visible instead of vanishing into
 * a red dot.
 *
 * - absent / not executable → dropped without a spawn,
 * - `ENOENT` on spawn → dropped (the path simply is not there),
 * - any other failure → kept, carrying the failure,
 * - two spellings of the same binary collapse into the first one seen.
 *
 * An empty candidate list resolves `[]` (nothing probed: a host patched down to
 * nothing).
 *
 * @param candidates - candidate executable paths.
 * @param blockedForPlatform - answers a reason for a candidate this host must
 * never exec, `""` for one it may probe. Nothing in the Unity path blocks; the
 * seam stays so the platform answer remains the only place a rule could live.
 */
export async function scanUnityExecutables(
    candidates: string[],
    blockedForPlatform: (candidate: string) => string = () => ""
): Promise<UnityExecutableStatus[]> {
    const list = Array.isArray(candidates) ? candidates : [];
    const statuses: UnityExecutableStatus[] = [];
    const seen = new Set<string>();
    for (const candidate of list) {
        const path = String(candidate ?? "").trim();
        if (path === "") continue;
        const blocked = blockedForPlatform(path);
        if (blocked !== "") {
            const key = `blocked\u0000${identity(path)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            statuses.push({ path, version: "", error: blocked });
            continue;
        }
        if (!presentOnDisk(path)) continue;
        try {
            const version = await probeExecutable(path);
            const key = `${identity(path)}\u0000${version}`;
            if (seen.has(key)) continue;
            seen.add(key);
            statuses.push({ path, version, error: "" });
        } catch (error) {
            const code = (error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string")
                ? (error as NodeJS.ErrnoException).code
                : "";
            if (code === "ENOENT") continue;
            const key = identity(path);
            if (seen.has(key)) continue;
            seen.add(key);
            statuses.push({
                path,
                version: "",
                error: firstLine(error instanceof Error ? error.message : String(error))
            });
        }
    }
    return statuses;
}

/**
 * Discover usable Unity relay executables when nothing is fixed: probe every
 * candidate and report the first runnable one. Kept for its `Promise<string>`
 * contract (`src/index.ts` re-export, tests, diagnostics).
 * @param candidatePaths - candidate executable paths (default: platform list).
 * @param blockedForPlatform - answers a reason for a candidate this host must
 * never exec, `""` for one it may probe.
 * @returns the discovered executable version line.
 */
export async function discoverUnity(
    candidatePaths: string[],
    blockedForPlatform: (candidate: string) => string = () => ""
): Promise<string> {
    const candidates = (Array.isArray(candidatePaths) ? candidatePaths : defaultRelayPaths())
        .map((candidate) => String(candidate ?? "").trim())
        .filter((candidate) => candidate !== "");
    if (candidates.length === 0) return "";
    const found = await scanUnityExecutables(candidates, blockedForPlatform);
    for (const status of found) {
        if (status.version !== "" && status.error === "") return status.version;
    }
    const broken = found.find((status) => status.error !== "");
    if (broken !== void 0) throw new Error(broken.error);
    throw new Error(`Unity relay executable not found: no executable detected (checked: ${candidates.join(", ")})`);
}

/**
 * One check run — the public "did we find a runnable relay?" question:
 *
 * - `relayPath` non-empty → probe that executable (ENOENT → "Unity relay
 *   executable not found: <path>"; non-zero → the first stderr/stdout line;
 *   success → the version line).
 * - `relayPath` empty → run the scan over the candidate list and report the
 *   first runnable entry. Nothing usable → the known executable-missing error;
 *   only-present-but-broken entries → that entry's failure.
 *
 * A run that probes **nothing** (no candidates) resolves "" — callers must treat
 * that as "no evidence", never as health.
 *
 * @param entry - validated {@link UnityMcpConfig}.
 * @param extraFlags - unused here; kept so the check's shape matches the rest of
 * the plugin family.
 * @param blockedForPlatform - answers a reason for a path this host must never
 * exec, `""` for one it may probe.
 * @returns the executable version line, or "" when nothing is probed.
 */
export function checkUnity(
    entry: UnityMcpConfig,
    extraFlags?: string[],
    blockedForPlatform: (candidate: string) => string = () => ""
): Promise<string> {
    void extraFlags;
    const target = typeof entry.relayPath === "string" ? entry.relayPath.trim() : "";
    if (target !== "") return blockedForPlatform(target) !== "" ? Promise.resolve("") : probeExecutable(target);
    return discoverUnity(entry.relayPaths, blockedForPlatform);
}
