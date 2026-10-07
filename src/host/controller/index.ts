/**
 * Host half — the controller's live state + behavior.
 *
 * One controller per apply(): the composition base layer, the nested bridge, the
 * serialized executable runs, and the two capture paths. The public surface is
 * `createUnityMcpController` and its config; everything behind it is split into
 * concern modules:
 *
 *   ./controller.ts  the assembly: resolve config, build the base layer, make
 *                     the initial bridge connection, wire the public methods
 *   ./state.ts       the live state + context every helper shares (internal)
 *   ./notes.ts       base-layer announcements (selection, stderr)
 *   ./bridge-run.ts  the bridge switches (config build, restart, flags, stderr)
 *   ./runs.ts        the executable run + serialization
 *   ./persist.ts     settings writes a run makes (seed, rows)
 *   ./captures.ts    bridge-log + tool-call-result captures
 *   ./commits.ts     settings-commit routing (`onSettingsChange`)
 *
 * The one rule that must survive the split: read the live settings value through
 * `state.source()` at commit time, never capture it, and keep every base-layer
 * mutation in these modules — settings commits route in, never out.
 */
export { createUnityMcpController } from "./controller.js";
export type { UnityMcpController, UnityMcpControllerDeps } from "./controller.js";
