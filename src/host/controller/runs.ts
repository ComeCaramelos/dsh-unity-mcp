/**
 * Controller — the executable run and its serialization.
 *
 * Every executable action goes through one **run**: probe the candidate list the
 * saved rows + row config + selection carry (with the Windows profiles inserted
 * through the interop mount on a WSL host), publish the per-path answers, and
 * merge what was found back into the saved rows (keeping the names the user
 * gave them). When nothing is configured at all, the first runnable entry is
 * seeded. A `probe` is the follow-up probe of the selection that answers the
 * version line the card shows.
 */
import { bridgeConfig } from "../bridge.js";
import { entryIds, mergeEntries, normalizeEntries } from "../catalog.js";
import { checkUnity, relayCandidates, scanUnityExecutables } from "../discovery/index.js";
import { firstLine, isUnityMissing } from "../status.js";
import type { EffectiveUnitySource, UnityExecutableEntry, UnityExecutableStatus } from "../types/index.js";

import { configForBridge, restartBridge } from "./bridge-run.js";
import { noteSelection, noteStderr } from "./notes.js";
import { persistExecutables, persistRelayPath } from "./persist.js";
import type { Controller } from "./state.js";

/** The serialized units one controller may queue. */
export type RunKind = "refresh" | "probe";

/** Element-wise equality of two saved-row lists (order is the dropdown order). */
export function sameEntries(a: readonly UnityExecutableEntry[], b: readonly UnityExecutableEntry[]): boolean {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => entry.id === b[index].id && entry.name === b[index].name);
}

/**
 * One executable run. Probe every candidate the row config and the saved rows
 * carry (plus the selection — the same path may appear as a row), publish what
 * answered as per-path status, and merge what was found into the saved rows,
 * keeping the names their user gave them. When nothing is configured at all
 * (neither layer carries a path) the first runnable entry is **seeded**: written
 * into the persisted `relayPath` once, so what the picker shows is what the
 * bridge runs. A selection that is already fixed is never re-resolved, however
 * broken.
 * @returns the per-path statuses the run answered with.
 */
export async function runExecutableDiscovery(controller: Controller): Promise<UnityExecutableStatus[]> {
    const { state } = controller;
    const live = state.source();
    // Rows are user-authored; re-normalize on every read (the client writes them
    // in one shot, so the shape it hands may be anything).
    const stored = normalizeEntries(live.executables);
    state.runningExecutables = stored;
    const savedIds = entryIds(state.runningExecutables);
    const candidates = relayCandidates(controller.config, savedIds, state.runningRelayPath, {
        wslHost: controller.wslHost
    });
    let statuses: UnityExecutableStatus[] = [];
    try {
        statuses = await scanUnityExecutables(candidates, controller.blockedForPlatform);
    } catch (error) {
        controller.ctx.logger.warn(`dsh-unity-mcp(${controller.config.serverName}): executable run failed: ${String(error)}`);
    }
    state.entry.executableStatus = statuses;

    // A found path that is not a row yet becomes one, nameless; a row the user
    // named keeps that name. A path that vanished is dropped by the scan and so
    // stops being offered.
    const merged = mergeEntries(state.runningExecutables, statuses.map((status) => status.path));
    if (merged.changed) {
        state.runningExecutables = merged.entries;
        void persistExecutables(controller, merged.entries);
    }

    if (state.runningRelayPath === "") {
        const seeded = statuses.find((status) => status.version !== "" && status.error === "");
        if (seeded !== void 0) {
            // Seeding is a selection change like any other: the bridge has to
            // restart carrying it, otherwise the card would claim a path the
            // running argv does not carry.
            controller.ctx.logger.info(
                `dsh-unity-mcp(${controller.config.serverName}): no executable configured — seeding relayPath = ${seeded.path} (found by scan)`
            );
            state.seededPath = seeded.path;
            void persistRelayPath(controller, seeded.path);
            // Already inside this run: the status list above already carries the
            // seeded path's own answer, so no follow-up run.
            applyRelayPath(controller, seeded.path, "selected", false);
        } else if (candidates.length > 0 && statuses.every((status) => status.error !== "" || status.version === "")) {
            // Nothing present at all: the known executable-missing state.
            state.entry.lastError = firstLine(
                `Unity relay executable not found: no executable detected (checked: ${candidates.join(", ")})`
            );
            state.entry.unityMissing = isUnityMissing(state.entry.lastError);
        }
    }
    noteSelection(controller);
    return statuses;
}

/**
 * The probe of the *selection* — the one run that answers the version line the
 * card shows under the pill. A probe that answers nothing clears the version
 * line: unlike the Chrome plugin, the relay answers `--version` eagerly, so
 * silence here really does mean "nothing answered".
 */
export async function probeSelection(controller: Controller): Promise<string> {
    const { state } = controller;
    if (state.runningRelayPath === "") {
        state.entry.relayVersion = "";
        return "";
    }
    try {
        const version = await checkUnity(
            { ...controller.config, extraFlags: state.runningFlags, relayPath: state.runningRelayPath },
            state.runningFlags,
            controller.blockedForPlatform
        );
        state.entry.relayVersion = version;
        if (version !== "") {
            state.entry.lastError = "";
            state.entry.unityMissing = false;
        }
        return version;
    } catch (error) {
        state.entry.lastError = firstLine(error instanceof Error ? error.message : String(error));
        // A failed probe says nothing about the version: keep no stale answer
        // behind the error.
        state.entry.relayVersion = "";
        state.entry.unityMissing = isUnityMissing(state.entry.lastError);
        controller.ctx.logger.warn(`dsh-unity-mcp(${controller.config.serverName}): executable probe failed: ${state.entry.lastError}`);
        return "";
    }
}

/**
 * Restart the bridge connection with a different executable selected — the
 * launch command *is* the executable, so unlike a flag change this one is what
 * the card's pill claims is running. `rerun` schedules the scan+probe that
 * follows a selection change; a caller that is already inside that run (the
 * seeding branch above) passes `false`.
 */
export function applyRelayPath(controller: Controller, path: string, nextSource: EffectiveUnitySource, rerun = true): void {
    const { state } = controller;
    state.runningRelayPath = path;
    state.runningRelaySource = nextSource;
    noteSelection(controller);
    controller.ctx.logger.info(`dsh-unity-mcp(${controller.config.serverName}): executable → "${path || "(none)"}" (restarting the bridge connection)`);
    const built = bridgeConfig(configForBridge(controller, state.runningFlags), state.runningFlags, state.runningStderrMode);
    noteStderr(controller, built);
    restartBridge(controller, built, "executable update failed");
    // A different executable reads a different machine: refresh the list and
    // probe what is now selected, so the pill's version is the new one's.
    if (rerun) queue(controller, "probe");
}

/**
 * Serialize one unit of work: a rows-only refresh, or a run that also re-probes
 * what is selected. The invariant is "one run at a time" — a rapid sequence of
 * picker actions must never interleave two scans.
 */
export function queue(controller: Controller, kind: RunKind): Promise<unknown> {
    const { state } = controller;
    state.runs = state.runs
        .then(async () => {
            await runExecutableDiscovery(controller);
            if (kind === "probe") await probeSelection(controller);
            state.entry.executableDiscoveryRevision += 1;
        })
        .catch(() => { });
    return state.runs;
}
