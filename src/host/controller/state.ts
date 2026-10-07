/**
 * Controller internals — the live state + the context every controller method
 * reads.
 *
 * The public half (`createUnityMcpController`, `UnityMcpController`,
 * `UnityMcpControllerDeps`) lives in ./controller.ts; the behavior it wires
 * together is split across the sibling modules here (`notes`, `bridge-run`,
 * `runs`, `persist`, `captures`, `commits`). This file names the state those
 * helpers share — every base-layer mutation targets `state.entry`, every run
 * reads its source through `state.source`, and the immutable context pieces a
 * method needs to act on (the row config, the WSL answer) sit alongside it.
 * Nothing here is part of the public surface.
 */
import type {
    BridgeStderrMode,
    EffectiveUnitySource,
    McpBridge,
    PluginContext,
    SettingsResolved,
    UnityExecutableEntry,
    UnityMcpConfig
} from "../types/index.js";

/** The live state one controller instance owns and mutates. */
export interface ControllerState {
    /** The composition base layer served alongside the user layer. */
    entry: SettingsResolved;
    /** The live resolved settings source (swapped by the installSection hook). */
    source: () => SettingsResolved;
    /** Flags the nested bridge currently launches with. */
    runningFlags: string[];
    /** Effective bridge stderr mode ("log"/"console"). */
    runningStderrMode: BridgeStderrMode;
    /** Relay executable the bridge actually launches with. */
    runningRelayPath: string;
    /** Where that executable came from. */
    runningRelaySource: EffectiveUnitySource;
    /** The saved rows the last commit served, already normalized. */
    runningExecutables: UnityExecutableEntry[];
    /** Last emitted stderr notice key (keeps the announce silent across churn). */
    stderrNotice: string;
    /** Last observed `refreshExecutablesNonce` (undefined until first commit). */
    lastRefreshNonce: number | undefined;
    /** The relay this host seeded on the first run ("" = nothing). */
    seededPath: string;
    /** Whether the user layer has ever carried a path. */
    seenUserSelection: boolean;
    /** Serializes runs so rapid actions never interleave. */
    runs: Promise<unknown>;
    /** Whether the WSL + Windows-executable notice has been logged already. */
    wslNoticeShown: boolean;
}

/** Everything a controller method needs: the immutable context + the state. */
export interface Controller {
    ctx: PluginContext;
    config: UnityMcpConfig;
    /** True on a WSL host (where the Windows-profile candidate walk runs). */
    wslHost: boolean;
    /** A path this host must never exec. Nothing in the Unity path blocks;
     * kept as a seam so the platform rule has exactly one home. */
    blockedForPlatform: (candidate: string) => string;
    /** The row-config executable source ("" = unset). */
    rowRelayPath: string;
    /** The row-config extra flags, mode-flag stripped. */
    rowFlags: string[];
    /** The nested bridge fiber, driven by every flag/executable/stderr switch. */
    bridge: McpBridge;
    /** The live mutable state. */
    state: ControllerState;
}
