/**
 * Host half — the Unity relay: candidate locations, the `--version` probes, the
 * executable **scan** that produces the card's dropdown options, and the check
 * run that ties them together.
 *
 *   ./candidates.ts  the per-platform relay locations, the Windows-profile walk
 *                    discovery does under WSL, and the ordered candidate list
 *   ./probe.ts       the `--version` probe + presence + identity helpers
 *   ./scan.ts        the scan, the discover-the-first-runnable run, the check
 *
 * Unlike the Chrome plugin, Unity's relay is installed **per user**, into a
 * directory the Editor creates on first load — so a candidate list built only
 * from a fixed system path finds nothing on most hosts. The list therefore
 * expands `$HOME`, walks every Windows user profile visible through the interop
 * mount on a WSL host, and keeps whatever the row config or the saved rows carry.
 *
 * There is no "auto" mode beyond that: the scan lists what exists, the card
 * picks one, and what is picked stays picked — a path that later disappears is
 * reported broken, never silently substituted.
 */
export {
    defaultRelayPaths,
    DEFAULT_RELAY_PATHS,
    expandHomePaths,
    relayCandidates,
    windowsProfileRelayPaths
} from "./candidates.js";
export { checkUnity, discoverUnity, scanUnityExecutables } from "./scan.js";
