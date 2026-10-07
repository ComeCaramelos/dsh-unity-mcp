/**
 * Host half — live state: `createUnityMcpController`.
 *
 * One controller per apply(): the composition base layer (`entry`), the live
 * resolved settings source, the nested bridge, the serialized executable runs,
 * and the two capture paths — bridge log lines and tool-call results. Every
 * base-layer mutation happens here; settings commits route in through the
 * controller methods, never the other way round.
 *
 * The executable state follows the picker shape and the rule that there is no
 * auto mode: the saved **rows** (`{ id: path, name: label }`) are what the card's
 * dropdown lists, the *selection* is what the bridge launches with, and a run
 * refreshes both — it probes every candidate the rows and the row config carry
 * (plus the Windows profiles under WSL), merges what it finds into the rows
 * (names kept), and seeds a never-configured host exactly once. A fixed path
 * that later breaks stays fixed and reads broken instead of being re-resolved.
 *
 * This file is only the assembly: it resolves the config-derived pieces, builds
 * the base layer, makes the initial bridge connection, and wires the public
 * methods to the behavior modules that sit alongside it (see ./index.ts for the
 * layout). Everything that actually *does* something lives there, not here.
 */
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";

import { bridgeConfig, captureLogger } from "../bridge.js";
import { DEFAULT_EXTRA_FLAGS, FLAGS_ENV_VAR } from "../constants.js";
import { stripModeFlag } from "../flags.js";
import { isWindowsExecutablePath, isWindowsSubsystemForLinux } from "../platform.js";
import { readPersistedFlags, readPersistedRelayPath, readPersistedStderrMode, resolveEnvFlags, resolveStderrMode } from "../values.js";
import type {
    BridgeStderrMode,
    EffectiveUnitySource,
    PluginContext,
    SettingsResolved,
    UnityMcpConfig
} from "../types/index.js";

import { configForBridge } from "./bridge-run.js";
import { noteBridgeLog, registerToolCapture } from "./captures.js";
import { onSettingsChange } from "./commits.js";
import { noteSelection, noteStderr } from "./notes.js";
import { queue } from "./runs.js";
import type { Controller, ControllerState } from "./state.js";

/** The live state one apply() keeps in memory. */
export interface UnityMcpController {
    /** The composition base layer served alongside the user layer. */
    readonly entry: SettingsResolved;
    /** Swap the live resolved settings source (installSection hook). */
    setSource(next: () => SettingsResolved): void;
    /** Route one settings commit: relaunch on flag or executable drift, and run
     * one executable refresh on the search trigger. */
    onSettingsChange(): void;
    /** Run one executable refresh (probe the candidates, merge what is found
     * into the saved rows, seed a never-configured host). Runs are serialized so
     * rapid actions never interleave. */
    run(): Promise<unknown>;
}

/** The live state for one apply(); no host override is currently required, the
 * discovery halves all read the real filesystem through injectable probes. */
export type UnityMcpControllerDeps = {
    /** Test/diagnostics override of the launch environment lookup. */
    launchEnvironment?: (name: string) => string | undefined;
};

/**
 * Build the live state for one bridge + card pairing.
 * @param ctx - plugin context.
 * @param config - validated row config.
 * @param deps - optional host overrides (tests resolve the launch environment
 * without booting a host; everything else resolves from this process).
 */
export function createUnityMcpController(
    ctx: PluginContext,
    config: UnityMcpConfig,
    deps: UnityMcpControllerDeps = {}
): UnityMcpController {
    const lookup = typeof deps.launchEnvironment === "function"
        ? deps.launchEnvironment
        : (name: string) => launchEnvironmentOf(ctx).get(name)?.value;

    // Where the plugin runs. The one thing this answer changes in the Unity path
    // is the candidate list: under WSL the Editor usually sits on the Windows
    // side, so the relay it installed is only reachable through the interop
    // mount and the scan walks the Windows profiles as well. The launch
    // environment is authoritative inside a host, so the answer is deterministic.
    const wslHost = isWindowsSubsystemForLinux({ env: (name) => lookup(name) });

    // Nothing in the Unity path is ever blocked: a `<relay> --version` probe is
    // side-effect free on both a Linux relay and a Windows relay launched
    // through the interop mount, so no candidate is worth excluding.
    const blockedForPlatform = (_candidate: string): string => "";

    const rowRelayPath = config.relayPath.trim();
    const rowFlags = stripModeFlag(config.extraFlags);

    const baseFlags = resolveEnvFlags(rowFlags, lookup(FLAGS_ENV_VAR));
    const envValue = lookup(FLAGS_ENV_VAR);
    if (typeof envValue === "string" && envValue.trim() !== "" && baseFlags === rowFlags) {
        ctx.logger.warn(`dsh-unity-mcp(${config.serverName}): ignoring ${FLAGS_ENV_VAR} — invalid flags list; using row config`);
    }
    // The persisted UI selection wins over env/row config: seed the first bridge
    // spawn with it. When the settings service is not up yet this yields the base
    // flags, and the installSection initial onChange below switches the bridge to
    // the persisted selection in place right after.
    const initialFlags = readPersistedFlags(ctx) ?? baseFlags;

    // The initial selection: persisted `relayPath` → row config → nothing.
    // Nothing here consults discovery: the first run does, and only seeds if both
    // layers are silent.
    const persistedRelayPath = readPersistedRelayPath(ctx);
    const runningRelayPath = persistedRelayPath !== "" ? persistedRelayPath : rowRelayPath;
    const runningRelaySource: EffectiveUnitySource = persistedRelayPath !== "" ? "selected" : rowRelayPath !== "" ? "row-config" : "";

    // The effective bridge stderr mode: the persisted UI toggle when set, else the
    // row-config `bridgeStderr`. Every spawn reads it, and a UI write hot-switches
    // it (restarting the connection).
    const runningStderrMode: BridgeStderrMode = resolveStderrMode(readPersistedStderrMode(ctx), config.bridgeStderr);

    // Composition base layer: part of the resolved value served to the client but
    // never persisted. See ./types/settings.ts (SettingsBaseLayer) for the whole
    // shape; the static `defaultExtraFlags` mirror feeds the card's Restore
    // defaults action, and `wslWindowsExecutable` reads off this host from the
    // start (the Windows-executable configuration only exists under WSL).
    const entry: SettingsResolved = {
        extraFlags: initialFlags,
        refreshExecutablesNonce: 0,
        relayPath: "",
        executables: [],
        stderrMode: "",
        lastError: "",
        unityMissing: false,
        executableDiscoveryRevision: 0,
        relayVersion: "",
        executableStatus: [],
        effectiveRelayPath: runningRelayPath,
        effectiveSource: runningRelaySource,
        wslWindowsExecutable: wslHost && isWindowsExecutablePath(runningRelayPath),
        rowStderr: config.bridgeStderr === "console" ? "console" : "log",
        defaultExtraFlags: [...DEFAULT_EXTRA_FLAGS]
    };

    const state: ControllerState = {
        entry,
        source: () => entry,
        runningFlags: initialFlags,
        runningStderrMode,
        runningRelayPath,
        runningRelaySource,
        runningExecutables: [],
        stderrNotice: "",
        lastRefreshNonce: void 0,
        seededPath: "",
        seenUserSelection: false,
        runs: Promise.resolve(),
        wslNoticeShown: false
    };
    const controller: Controller = {
        ctx,
        config,
        wslHost,
        blockedForPlatform,
        rowRelayPath,
        rowFlags,
        bridge: undefined as unknown as Controller["bridge"],
        state
    };

    // Initial connection with the resolved flags + the resolved selection. The
    // bridge-log capture rides only on the bridge scope: our own logs bypass it,
    // so our own warns never masquerade as connection errors.
    const bridgeScope = ctx.extend({ logger: captureLogger(ctx.logger as unknown as Record<string, (...args: unknown[]) => unknown>, (level, args) => noteBridgeLog(controller, level, args)) });
    const initial = bridgeConfig(configForBridge(controller, initialFlags), initialFlags, runningStderrMode);
    noteStderr(controller, initial);
    controller.bridge = bridgeScope.plugin(McpClient, initial.config) as Controller["bridge"];
    noteSelection(controller);

    // Tool-level status: relay-level failures are returned to the calling agent
    // and never reach the bridge logger.
    registerToolCapture(controller);

    return {
        entry,
        setSource: (next) => {
            state.source = next;
        },
        run: () => queue(controller, "refresh"),
        onSettingsChange: () => onSettingsChange(controller)
    };
}
