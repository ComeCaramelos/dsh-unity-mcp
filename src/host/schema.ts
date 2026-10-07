/**
 * The two zod schemas: the cordis row config and the settings section.
 *
 * The row config validates what lives in the profile (one row per plugin
 * instance); the settings schema describes the namespace the Web GUI card
 * edits — the persisted user layer (flags, the executable selection, the saved
 * executable rows, the stderr toggle and the one action trigger) plus the
 * base-layer status fields served alongside it.
 */
import z from "@deepseek-ai/schemastery";

import {
    DEFAULT_EXTRA_FLAGS,
    EFFECTIVE_SOURCE_PATTERN,
    MCP_MODE_FLAG,
    OPTIONAL_PATH_PATTERN,
    RELAY_PATH_PATTERN,
    STDERR_MODE_FIELD_PATTERN
} from "./constants.js";
import { defaultRelayPaths } from "./discovery/index.js";

/** Reconnect policy passthrough; mirrors dsh-mcp-client's schema. */
const Reconnect = z.object({
    enabled: z.boolean().default(true),
    initialDelayMs: z.number().min(1).max(600000).default(500),
    maxDelayMs: z.number().min(1).max(600000).default(30000),
    maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10)
});

export const Config = z.object({
    serverName: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/).default("unity"),
    /**
     * Launcher prefix. "" (default) launches the effective relay executable
     * directly — the relay speaks MCP itself, so there is nothing to wrap. A
     * non-empty value is what prefixes the argv with a wrapper instead.
     */
    command: z.string().default(""),
    /** Flags appended after the mode flag. The mode flag itself never belongs
     * here (see ./flags.ts). */
    extraFlags: z.array(String).default(DEFAULT_EXTRA_FLAGS),
    /** Row-config relay executable: the fallback source of the selection when
     * the card has never picked one. */
    relayPath: z.string().default("").pattern(RELAY_PATH_PATTERN),
    /** Candidate list the scan probes when nothing is picked. Defaults to the
     * platform's relay locations; discovery additionally walks the Windows
     * profiles through the interop mount when the host is WSL. */
    relayPaths: z.array(String).default(defaultRelayPaths()),
    env: z.dict(String).default({}),
    cwd: z.string().default(""),
    toolCallTimeoutMs: z.number().default(60000),
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect,
    /** Bridge console-output routing: "log" (default) redirects the spawned
     * relay's inherited stderr into a per-spawn log file so its progress lines
     * stay out of the dsh console; "console" inherits it (debug). The card's
     * "Reduce log output" toggle (`stderrMode`) overrides this. See
     * {@link buildBridgeSpawn}. */
    bridgeStderr: z.union([z.const("log"), z.const("console")]).default("log"),
    /** Log path override for "log" mode; "" = auto (see
     * {@link bridgeStderrLogPath}). Absolute paths only. */
    bridgeStderrLog: z.string().default("").pattern(OPTIONAL_PATH_PATTERN)
});

/** One saved-executable catalog row: `id` is the path that goes on the wire,
 * `name` the label the user chose for the UI ("" = render the path).
 * Persisted. */
const ExecutableEntrySchema = z.object({
    id: z.string().default("").pattern(RELAY_PATH_PATTERN),
    name: z.string().default("")
});

/** What one saved row's probe answered with, keyed by its id (`path`): the
 * `--version` line, and the failure that makes it not runnable. Base layer. */
const ExecutableStatusSchema = z.object({
    path: z.string().default("").pattern(RELAY_PATH_PATTERN),
    version: z.string().default(""),
    error: z.string().default("")
});

/**
 * User-settings section served to the Web GUI card.
 *
 * Persisted (user layer in `$DSH_HOME/settings.yaml`): `extraFlags` (the last
 * UI edit, used to launch on (re)start), `relayPath` (the relay executable the
 * picker selected — or that the host seeded once), `executables` (the
 * saved-executables rows: `id` = path, `name` = UI label),
 * `refreshExecutablesNonce` (the card's **Search executables** trigger) and
 * `stderrMode` (the "Reduce log output" toggle: "log" captures the bridge's
 * stderr into a per-spawn log file, "console" echoes it, "" follows the
 * row-config `bridgeStderr`).
 *
 * Served but never persisted (composition base layer held in memory by the
 * host): `lastError`, `unityMissing`, `executableDiscoveryRevision`,
 * `relayVersion`, `executableStatus`, `effectiveRelayPath`, `effectiveSource`,
 * `wslWindowsExecutable`, the static `rowStderr` mirror and the static
 * `defaultExtraFlags` mirror (the canonical defaults list the card's **Restore
 * defaults** control appends) — the client's polls stop when the served
 * revision advances past its action-time value.
 */
export const SettingsSchema = z.object({
    /** Flags appended after `--mcp`; persisted last UI edit. A mode-flag entry
     * is rejected: the mode is the bridge's decision. */
    extraFlags: z.array(String).default(DEFAULT_EXTRA_FLAGS),
    /** Written by the UI **Search executables** button; the host reacts to it by
     * re-probing the saved rows and merging what it finds back into them. */
    refreshExecutablesNonce: z.number().default(0),
    /**
     * The relay executable the bridge launches with: picked in the picker (a
     * saved row's `id`) or seeded once by the host's first scan. "" = nothing
     * resolved yet — there is no auto state to fall back to.
     */
    relayPath: z.string().default("").pattern(RELAY_PATH_PATTERN),
    /** The picker's saved rows — `{ id: path, name: label }`, user-authored. The
     * host re-normalizes (trim, dedupe, caps) on every read, and a scan merges
     * what it discovers into them without dropping a name the user chose. */
    executables: z.array(ExecutableEntrySchema).default([]),
    /**
     * Persisted UI "Reduce log output" toggle: "log" captures the bridge's
     * stderr into the log file, "console" echoes it (debug). "" follows the
     * row-config `bridgeStderr` (mirrored into `rowStderr`).
     */
    stderrMode: z.string().default("").pattern(STDERR_MODE_FIELD_PATTERN),
    /** Last check/connection failure, human-readable; empty when healthy. */
    lastError: z.string().default(""),
    /** Known error: the last failure was "no Unity relay detected". */
    unityMissing: z.boolean().default(false),
    /** Executable-run counter (success or failure); completion signal for every
     * executable action the card can take. */
    executableDiscoveryRevision: z.number().default(0),
    /** The version the **selected** executable answered with; "" when nothing
     * answered — nothing picked, or a failed probe. */
    relayVersion: z.string().default(""),
    /** Per-row probe status keyed by path: the version the row answered with,
     * and the failure for a row that is present but not runnable. Base layer,
     * never persisted — the rows themselves live in the user layer. */
    executableStatus: z.array(ExecutableStatusSchema).default([]),
    /** The path the bridge actually launches with ("" when nothing is fixed).
     * Base layer, never persisted. */
    effectiveRelayPath: z.string().default("").pattern(RELAY_PATH_PATTERN),
    /** Where `effectiveRelayPath` came from — picked (`"selected"`), row config
     * (`"row-config"`) or nothing yet (""). Base layer, never persisted. */
    effectiveSource: z.string().default("").pattern(EFFECTIVE_SOURCE_PATTERN),
    /** Row-config `bridgeStderr` in effect (static base layer; never
     * persisted) — the fallback when `stderrMode` is "". */
    rowStderr: z.union([z.const("log"), z.const("console")]).default("log"),
    /** The canonical default extra-flags list (static base layer; never
     * persisted) — the list the card's **Restore defaults** control appends to
     * what the editor holds. Mirror of `DEFAULT_EXTRA_FLAGS`. */
    defaultExtraFlags: z.array(String).default(DEFAULT_EXTRA_FLAGS),
    /** True while this host runs under WSL and the selected executable is a
     * Windows binary — the state the card's notice explains. Base layer, never
     * persisted (see ./platform.ts). */
    wslWindowsExecutable: z.boolean().default(false),
    /** The mode flag every bridge launch carries, served as a static base-layer
     * mirror of `MCP_MODE_FLAG` so the card can name the launch shape without
     * importing host code. Never persisted. */
    modeFlag: z.string().default(MCP_MODE_FLAG)
});
