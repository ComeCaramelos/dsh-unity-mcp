/**
 * Types — the persisted settings section and its composition layers.
 *
 * What the user edits (and only that persists), the in-memory base layer served
 * alongside it, the resolved value the client card reads, and the `settings`
 * service surface this host half installs the section into.
 */
import type { BridgeStderrMode } from "./stderr.js";
import type { EffectiveUnitySource, UnityExecutableEntry, UnityExecutableStatus } from "./executable.js";

/**
 * User-authored settings fields — the only keys that persist.
 */
export type SettingsUserFields = {
    extraFlags: string[];
    /** Written by the card's **Search executables** action: one host run that
     * re-probes the saved rows and folds what it finds back into them. A module
     * plugin has no host→client push channel, so the action travels as one
     * write the host reacts to. */
    refreshExecutablesNonce: number;
    /** The relay executable the bridge launches with: picked in the picker (a
     * saved row's path), or seeded once by the host; "" = nothing resolved yet.
     * There is no "auto" state to fall back to. */
    relayPath: string;
    /** The saved-executables rows: `{ id: path, name: label }`, the dropdown's
     * catalog (see ./catalog.ts). Persisted, user-authored; a scan merges what it
     * finds into them without dropping a name the user chose. */
    executables: UnityExecutableEntry[];
    /** The card's "Reduce log output" toggle: "log" captures the bridge's
     * stderr into the log file, "console" echoes it. "" follows the row
     * config `bridgeStderr`. */
    stderrMode: "" | BridgeStderrMode;
};

/**
 * In-memory composition base layer served alongside the user layer. Never
 * persisted — the *rows* and the fields above are the persisted half.
 */
export type SettingsBaseLayer = {
    lastError: string;
    unityMissing: boolean;
    /** Completion signal of one executable run (a merged scan, and the probe of
     * what is selected that follows it). The one counter every executable action
     * waits on. */
    executableDiscoveryRevision: number;
    /** The `--version` line the selected relay answered with; "" when nothing
     * answered (nothing selected or a failed probe). */
    relayVersion: string;
    /** Per-row probe status, keyed by path: the version a row answered with, and
     * the failure for a row that is present but not runnable. */
    executableStatus: UnityExecutableStatus[];
    /** The relay the bridge actually launches with; "" when nothing is fixed. */
    effectiveRelayPath: string;
    /** Where `effectiveRelayPath` came from. */
    effectiveSource: EffectiveUnitySource;
    /** Row-config `bridgeStderr` in effect (static base-layer mirror) — the
     * fallback when the user `stderrMode` is "". */
    rowStderr: BridgeStderrMode;
    /** The canonical default extra-flags list (static base-layer mirror of
     * `DEFAULT_EXTRA_FLAGS`) — what the card's Restore defaults action appends,
     * missing entries only. */
    defaultExtraFlags: string[];
    /** True while the running host is WSL **and** the effective executable is a
     * Windows binary: the relay is then launched through the interop mount, which
     * works for stdio but puts the Unity Editor connection entirely on the
     * Windows side. Base layer, never persisted. */
    wslWindowsExecutable: boolean;
};

/**
 * Resolved value served to the client card.
 */
export type SettingsResolved = SettingsUserFields & SettingsBaseLayer;

/**
 * Validated settings section as consumed by the validate hook.
 */
export type ValidatedSettings = {
    extraFlags: string[];
    stderrMode: "" | BridgeStderrMode;
    relayPath: string;
    executables: UnityExecutableEntry[];
};

/** One `settings.mutate` operation: `set` a path, or `unset` it. */
export type SettingsOp =
    | { op: "set"; path: string[]; value?: unknown }
    | { op: "unset"; path: string[] };

/** Surface of the `settings` service as consumed here. */
export interface SettingsService {
    document?: Record<string, Record<string, any> | undefined> | undefined;
    mutate(ns: string, ops: SettingsOp[]): Promise<unknown> | unknown;
    installSection(
        ctx: unknown,
        ns: string,
        schema: unknown,
        base: Partial<SettingsResolved>,
        hooks: {
            setSource?: (source: () => SettingsResolved) => void;
            validate?: (value: SettingsResolved) => void;
            onChange?: () => void;
        }
    ): void;
}
