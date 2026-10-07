/**
 * @comecaramelos/dsh-unity-mcp — host half, public surface.
 *
 * Connects the Unity MCP server (the `unity-ai-relay` executable the
 * `com.unity.ai.assistant` package installs into `~/.unity/relay/`, launched as
 * `<relay> --mcp [extraFlags]`) as an MCP server through the stock
 * @deepseek-ai/dsh-mcp-client bridge, and exposes the user-facing settings —
 * extra flags, the relay executable picker, and error reporting — under the
 * `unity-mcp` settings namespace: the Web GUI's Plugins settings page renders a
 * card (see ./client.js) keyed by that namespace. Editing the extra flags
 * re-applies the nested mcp-client plugin in place (fiber.update), which
 * restarts the bridge with the new arguments; so does picking another
 * executable.
 *
 * Persistence boundary: only the user-authored fields land in
 * `$DSH_HOME/settings.yaml` — `extraFlags` (the last UI edit, used to launch on
 * (re)start), `relayPath` (the executable the picker selected — or that the host
 * seeded once), `executables` (the saved-executable rows: `{ id: path, name:
 * label }`), `refreshExecutablesNonce` (the card's **Search executables**
 * trigger) and `stderrMode` (the card's "Reduce log output" toggle: "log"
 * captures the bridge's stderr into a per-spawn log file, "console" echoes it,
 * "" follows the row-config `bridgeStderr`). A module plugin has no host→client
 * push channel (`harness.handle` is reserved for code-string halves), which is
 * why the card's executable action travels as the `refreshExecutablesNonce`
 * trigger. Status state (`lastError`, `executableDiscoveryRevision`,
 * `relayVersion`, `executableStatus`, `unityMissing`, `effectiveRelayPath`,
 * `effectiveSource`, `wslWindowsExecutable`, the static `rowStderr` mirror, the
 * static `defaultExtraFlags` mirror and the static `modeFlag` mirror) rides the
 * composition base layer — served to the client inside the resolved value, held
 * in memory, never persisted.
 *
 * One plugin instance per dsh host: the settings namespace is fixed.
 *
 * Everything behind this surface lives in ./host/*:
 *
 *   ./host/apply.ts       the wiring (controller + section)
 *   ./host/controller/    live state: base layer, bridge, checks, captures
 *   ./host/settings.ts    namespace install, commit routing, validation
 *   ./host/catalog.ts     the saved-executable rows the picker edits
 *   ./host/discovery/     candidate paths + `--version` probes + check run
 *   ./host/bridge.ts      the bridge argv + config, stderr wrapper, log capture
 *   ./host/flags.ts       extra-flags validation + flag predicates
 *   ./host/platform.ts    WSL detection + the Windows-executable predicate
 *   ./host/values.ts      precedence resolution + persisted reads
 *   ./host/status.ts      error classification + tool-result notes
 *   ./host/schema.ts      the zod schemas
 *   ./host/constants.ts   fixed identifiers, budgets, patterns
 *
 * Config (cordis row):
 *   serverName          tool namespace prefix       (default "unity")
 *   command             launcher prefix, "" = the relay itself
 *   relayPath           row-config executable       (the fallback source of the
 *                       selection for hosts whose card never picked one)
 *   relayPaths          scan candidate list when nothing is picked
 *                       (default defaultRelayPaths(), the documented
 *                       `<home>/.unity/relay/<binary>` locations; discovery also
 *                       walks the Windows user profiles through the interop
 *                       mount on a WSL host)
 *   extraFlags          flags appended after the `--mcp` mode flag
 *                       (default none — the mode flag itself is added by the
 *                       bridge and may not appear here)
 *   env / cwd / toolCallTimeoutMs / failOnStartupError / reconnect
 *                       passed through to dsh-mcp-client
 */

// ── identity ────────────────────────────────────────────────────────────────
export { inject, name } from "./host/plugin-meta.js";

// ── fixed identifiers and budgets ───────────────────────────────────────────
export {
    CONFIGURATION_DOCS_URL,
    DEFAULT_EXTRA_FLAGS,
    FLAGS_ENV_VAR,
    MCP_MODE_FLAG,
    SETTINGS_NAMESPACE
} from "./host/constants.js";

// ── the two schemas ─────────────────────────────────────────────────────────
export { Config, SettingsSchema } from "./host/schema.js";

// ── the wiring ──────────────────────────────────────────────────────────────
export { apply } from "./host/apply.js";

// ── the behavior tests and diagnostics drive directly ───────────────────────
export { bridgeConfig, bridgeStderrLogPath, buildBridgeSpawn, buildServerArgs, captureLogger } from "./host/bridge.js";
export {
    checkUnity,
    defaultRelayPaths,
    DEFAULT_RELAY_PATHS,
    discoverUnity,
    expandHomePaths,
    relayCandidates,
    scanUnityExecutables,
    windowsProfileRelayPaths
} from "./host/discovery/index.js";
export { isUnityMissing, toolResultNote } from "./host/status.js";
export { isWindowsExecutablePath, isWindowsExecutableUnderWsl, isWindowsSubsystemForLinux } from "./host/platform.js";
export { carriesModeFlag, flagsCarryMode, sameFlags, stripModeFlag, validateExtraFlags } from "./host/flags.js";
export {
    readPersistedFlags,
    readPersistedRelayPath,
    readPersistedStderrMode,
    resolveEffectiveRelayPath,
    resolveEnvFlags,
    resolveStderrMode
} from "./host/values.js";
// The saved-executable rows: pure helpers over `{ id: path, name: label }`, the
// list the picker edits and a merged run extends.
export { entryIds, entryLabel, findEntry, isValidEntryId, mergeEntries, normalizeEntries } from "./host/catalog.js";

// The controller, the installSection wrapper, the bridge spawn argv and the
// internal predicates stay off this surface: they are implementation, and
// widening it is a public-API change.

export type {
    BridgeStderrMode,
    EffectiveUnitySource,
    ReconnectConfig,
    UnityMcpConfig
} from "./host/types/index.js";
export type { UnityExecutableEntry, UnityExecutableStatus } from "./host/types/index.js";
export type {
    McpBridge,
    PluginContext,
    SettingsBaseLayer,
    SettingsOp,
    SettingsResolved,
    SettingsService,
    SettingsUserFields,
    ToolCallExecution,
    ToolCallResult,
    ValidatedSettings
} from "./host/types/index.js";
