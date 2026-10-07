/**
 * Host-half shared types — the whole surface.
 *
 * Everything a module needs without importing its implementation, split into
 * sections by concern and re-exported here so `from "./types/index.js"` still
 * names all of it:
 *
 *   ./stderr.ts      where the bridge console goes + the stderr-wrapper shapes
 *   ./config.ts      the validated row config + reconnect + PluginContext
 *   ./executable.ts  the saved-executable rows + source tag
 *   ./settings.ts    the persisted section, base layer, resolved value, service
 *   ./plugin.ts      the bridge fiber + the tool-call captures
 *
 * Structural views stay narrow: only what the host half actually calls.
 */
export type { BridgeStderrMode, BridgeStderrNotice, BridgeSpawnTarget, BridgeSpawnOptions, BridgeSpawnResult, BridgeStderrLogPathOptions } from "./stderr.js";
export type { UnityMcpConfig, ReconnectConfig, PluginContext } from "./config.js";
export type { UnityExecutableEntry, UnityExecutableStatus, EffectiveUnitySource } from "./executable.js";
export type { SettingsUserFields, SettingsBaseLayer, SettingsResolved, ValidatedSettings, SettingsOp, SettingsService } from "./settings.js";
export type { McpBridge, ToolCallExecution, ToolCallResult } from "./plugin.js";
