/**
 * Browser card controller — the snapshot + the settings scope/mirror surfaces.
 *
 * The shape the card store holds and the two host surfaces it projects from: the
 * bound settings scope (`getSnapshot`/`subscribe`/`set`/`unset`) and the describe
 * mirror every waiting action re-reads while the host's base-layer status is in
 * flight. Split out of the single `controller.ts` so the class reads as just the
 * store + write actions.
 */
import type { CatalogEntry } from "../catalog.js";

/**
 * Snapshot returned by the settings scope.
 *
 * The composition base layer rides here: describe() clones it fresh on every
 * read, while the frozen resolved value folds the base in only at commits.
 * Status must therefore be served from the base clone.
 */
export interface SettingsScopeSnapshot {
    status: string;
    value: Record<string, unknown>;
    base?: Record<string, unknown> | undefined;
    writable?: boolean;
    revision?: number;
}

/**
 * A settings scope bound to one namespace.
 *
 * subscribe() returns a disposer that stops future notifications.
 * set() / unset() return promises that resolve on success.
 */
export interface SettingsScope {
    getSnapshot(): SettingsScopeSnapshot;
    subscribe(fn: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
}

/**
 * Describe mirror: read-only view of the latest resolved settings value.
 *
 * load() returns a promise of the current value (or void if unavailable).
 * The client's poll loops read this mirror while the host's base-layer
 * updates are en route.
 */
export interface DescribeMirror {
    load(): Promise<unknown>;
}

/** One saved row's probe answer, keyed by the row's id. */
export interface UnityExecutableStatus {
    path: string;
    version: string;
    error: string;
}

/** The snapshot the card renders; `undefined` fields never reach the store. */
export interface UnityMcpCardSnapshot {
    available: boolean;
    writable: boolean;
    extraFlags: string[];
    lastError: string;
    unityMissing: boolean;
    /** Run counter: the signal every executable action waits on. */
    executableDiscoveryRevision: number;
    /** What the selected executable answered with ("" = nothing answered). */
    relayVersion: string;
    /** The saved executable rows — the dropdown's options. */
    executables: CatalogEntry[];
    /** Per-row probe answers, served by the host (never persisted). */
    executableStatus: UnityExecutableStatus[];
    /** Persisted selection ("" = nothing picked or seeded yet). */
    relayPath: string;
    /** The path the bridge launches with — what the pill shows. */
    effectiveRelayPath: string;
    /** Where that path came from (`"selected"`, `"row-config"` or ""). */
    effectiveSource: "" | "selected" | "row-config";
    /** Persisted "Reduce log output" toggle: "" follows the row config. */
    stderrMode: "" | "log" | "console";
    /** Row-config fallback the host serves (the toggle's default state). */
    rowStderr: "log" | "console";
    /** The canonical default extra-flags list the host serves (static base
     * layer) — what the card's **Restore defaults** control appends. */
    defaultExtraFlags: string[];
    /** True when the host runs under WSL and the selection is a Windows
     * executable — the state the card's static notice speaks to. */
    wslWindowsExecutable: boolean;
    actionError: string;
    /** True when a staged edit has not been applied yet. The editable fields
     * (`extraFlags`, `executables`, the effective selection, `stderrMode`)
     * carry the draft, not the persisted value, while this is true. */
    dirty: boolean;
    /** True while an apply is crossing the wire. */
    saving: boolean;
    /** True after a save the Host did not accept. */
    failed: boolean;
}
