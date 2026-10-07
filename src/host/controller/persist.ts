/**
 * Controller — settings persistence.
 *
 * The two writes a run may need to make back into the persisted settings
 * section: the seeded relay executable, and the saved rows a merged scan folded
 * in. Both follow the same rule — never throw out of a run, because the base
 * layer is what the card reads and a failed write must not break an otherwise
 * successful run.
 */
import { SETTINGS_NAMESPACE } from "../constants.js";
import type { UnityExecutableEntry } from "../types/index.js";

import type { Controller } from "./state.js";

/** Read the `settings` service surface as consumed here (`mutate` only). */
function settingsService(controller: Controller): { mutate?: (ns: string, ops: unknown[]) => unknown } | undefined {
    return controller.ctx.get("settings") as { mutate?: (ns: string, ops: unknown[]) => unknown } | undefined;
}

/** Persist one seeded/executable write through the settings service. */
export async function persistRelayPath(controller: Controller, path: string): Promise<void> {
    try {
        const settings = settingsService(controller);
        if (!settings || typeof settings.mutate !== "function") return;
        await Promise.resolve(settings.mutate(SETTINGS_NAMESPACE, [{ op: "set", path: ["relayPath"], value: path }]));
    } catch (error) {
        controller.ctx.logger.warn(`dsh-unity-mcp(${controller.config.serverName}): failed to persist the seeded relayPath: ${String(error)}`);
    }
}

/** Persist the saved-executables rows a run merged into. */
export async function persistExecutables(controller: Controller, entries: UnityExecutableEntry[]): Promise<void> {
    try {
        const settings = settingsService(controller);
        if (!settings || typeof settings.mutate !== "function") return;
        await Promise.resolve(settings.mutate(SETTINGS_NAMESPACE, [{ op: "set", path: ["executables"], value: entries }]));
    } catch (error) {
        controller.ctx.logger.warn(`dsh-unity-mcp(${controller.config.serverName}): failed to persist the executable rows: ${String(error)}`);
    }
}
