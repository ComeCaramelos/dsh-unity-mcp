/**
 * Controller — bridge switches.
 *
 * How a flag, executable or stderr-mode change reaches the running bridge: the
 * logical argv is rebuilt through `bridgeConfig` for the current state and
 * applied as a `fiber.update()`, chained on the fiber's own readiness so a
 * switch that lands while the first connection is still loading actually takes
 * effect (cordis restarts a fiber only from `ACTIVE`).
 */
import { bridgeConfig } from "../bridge.js";
import type { BridgeStderrMode, UnityMcpConfig } from "../types/index.js";

import { noteStderr } from "./notes.js";
import type { Controller } from "./state.js";

/** The row config as the bridge/config builders see it: effective executable,
 * cleaned row flags. The logical argv shape is unchanged. */
export function configForBridge(controller: Controller, flags: string[]): UnityMcpConfig {
    return { ...controller.config, extraFlags: flags, relayPath: controller.state.runningRelayPath };
}

/**
 * Restart the bridge connection with one built config.
 *
 * A cordis fiber restarts only from `ACTIVE`: an `update` issued while the
 * bridge's first connection is still loading is stored but never applied (the
 * load in flight resolves with the config it started with), and the update
 * settles `undefined` as if it had worked — so the bridge would silently keep
 * running with the argv it first spawned with. Chaining the update onto the
 * fiber's own readiness (the returned thenable settles with the load) is what
 * makes the switches that land while the bridge is still starting actually take
 * effect.
 */
export function restartBridge(controller: Controller, built: ReturnType<typeof bridgeConfig>, note: string): void {
    void Promise.resolve(controller.bridge)
        .then(() => controller.bridge.update(built.config))
        .then(() => {
            controller.state.entry.lastError = "";
            // Intentionally NOT clearing `unityMissing`: a successful bridge
            // update proves the flags took (clears the captured connection error)
            // but says nothing about the executable.
        })
        .catch((error) => controller.ctx.logger.error(`dsh-unity-mcp(${controller.config.serverName}): ${note}: ${String(error)}`));
}

/** Re-apply the nested bridge with one flags list; failures logged, never thrown. */
export function applyFlags(controller: Controller, flags: string[]): void {
    const { state } = controller;
    state.runningFlags = flags;
    controller.ctx.logger.info(`dsh-unity-mcp(${controller.config.serverName}): relaunching bridge with flags [${flags.join(" ")}]`);
    const built = bridgeConfig(configForBridge(controller, flags), flags, state.runningStderrMode);
    noteStderr(controller, built);
    restartBridge(controller, built, "flags update failed");
}

/**
 * Switch the effective bridge stderr mode in place — the card's "Reduce log
 * output" toggle. Only the spawn wrapper changes, but that means restarting the
 * bridge connection (the stderr routing is fixed at spawn); the flags and the
 * executable stay exactly as they were.
 */
export function applyStderrMode(controller: Controller, mode: BridgeStderrMode): void {
    const { state } = controller;
    state.runningStderrMode = mode;
    controller.ctx.logger.info(`dsh-unity-mcp(${controller.config.serverName}): bridge stderr mode → "${mode}" (restarting the bridge connection)`);
    const built = bridgeConfig(configForBridge(controller, state.runningFlags), state.runningFlags, mode);
    noteStderr(controller, built);
    restartBridge(controller, built, `bridge stderr mode switch to "${mode}" failed`);
}
