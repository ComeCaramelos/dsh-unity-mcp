/**
 * Controller — settings-commit routing.
 *
 * One settings commit may carry any of four changes; this routes them in order:
 * a flags drift restarts the bridge, an executable change picked by the card
 * restarts it and re-runs the discovery, a rows change is folded into the same
 * run (never a second one), and the stderr toggle restarts the connection
 * with/without the stderr wrapper. The first commit is the registration run —
 * discovery + probe, no separate call.
 */
import { normalizeEntries } from "../catalog.js";
import { sameFlags } from "../flags.js";
import { resolveEffectiveRelayPath, resolveStderrMode } from "../values.js";
import type { EffectiveUnitySource } from "../types/index.js";

import { applyFlags, applyStderrMode } from "./bridge-run.js";
import { applyRelayPath, queue, sameEntries } from "./runs.js";
import type { Controller } from "./state.js";

/** Route one settings commit. */
export function onSettingsChange(controller: Controller): void {
    const { state } = controller;
    try {
        const current = state.source();
        if (!sameFlags(current.extraFlags, state.runningFlags)) applyFlags(controller, current.extraFlags);

        // Executable changes come from the persisted `relayPath` the card wrote
        // (a row's `id`). They restart the bridge connection and re-run the
        // discovery, because a different executable reads a different machine. A
        // path the host seeded itself keeps standing until the user picks one:
        // the seed is written into the persisted layer, and until that write is
        // visible a commit must not resolve back to "nothing selected".
        const userLayer = typeof current.relayPath === "string" ? current.relayPath.trim() : "";
        if (userLayer !== "") state.seenUserSelection = true;
        const seededCarry = state.seededPath !== "" && !state.seenUserSelection ? state.seededPath : "";
        const nextRelayPath = resolveEffectiveRelayPath(userLayer !== "" ? userLayer : seededCarry, controller.rowRelayPath);
        const nextSource: EffectiveUnitySource =
            userLayer !== "" ? "selected" : seededCarry !== "" ? "selected" : controller.rowRelayPath !== "" ? "row-config" : "";
        if (nextRelayPath !== state.runningRelayPath) applyRelayPath(controller, nextRelayPath, nextSource);

        // Rows changes touch the list, never the connection.
        const nextExecutables = normalizeEntries(current.executables);
        const rowsChanged = !sameEntries(nextExecutables, state.runningExecutables);

        // The "Reduce log output" toggle lives here too: a change of the
        // effective stderr mode restarts the bridge connection with / without
        // the stderr-capturing wrapper.
        const nextStderrMode = resolveStderrMode(current.stderrMode, controller.config.bridgeStderr);
        if (nextStderrMode !== state.runningStderrMode) applyStderrMode(controller, nextStderrMode);

        const firstCommit = state.lastRefreshNonce === void 0;
        const refreshChanged = !firstCommit && current.refreshExecutablesNonce !== state.lastRefreshNonce;
        state.lastRefreshNonce = current.refreshExecutablesNonce;
        if (firstCommit) {
            // The registration run: discovery + probe, no separate call.
            queue(controller, "probe");
        } else {
            // The card's **Search executables** button. A rows change is folded
            // into the same run rather than a second one, so the client waits
            // on exactly one revision bump.
            if (refreshChanged || rowsChanged) queue(controller, "probe");
        }
    } catch (error) {
        controller.ctx.logger.error(`dsh-unity-mcp(${controller.config.serverName}): ${String(error)}`);
    }
}
