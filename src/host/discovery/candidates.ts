/**
 * Relay discovery — the candidate list.
 *
 * Where discovery looks before anything is picked. Unity's relay is not
 * installed into a system location: the Editor installs it **per user**, into
 * `~/.unity/relay/`, when the MCP feature first loads. Every platform therefore
 * contributes a home-relative candidate, not an `/usr/bin` candidate, and the
 * list is expanded through `$HOME` before anything is probed.
 *
 * The second source is the one the Chrome plugin has no equivalent for: on a
 * WSL host the Unity project usually lives on the Linux side while the **Editor
 * runs on Windows**, so the relay the Editor installed sits under a Windows
 * profile. Walking `WINDOWS_PROFILE_ROOT` reaches it (see
 * {@link windowsProfileRelayPaths}) — that is what makes the same picker work
 * from inside WSL without the user spelling anything out.
 *
 * The probes over that list live in ./scan.ts; the `--version` probe itself in
 * ./probe.ts.
 */
import { existsSync, readdirSync } from "node:fs";
import * as os from "node:os";

import { WINDOWS_RELAY_SUBPATH, WINDOWS_PROFILE_ROOT } from "../constants.js";
import type { UnityMcpConfig } from "../types/config.js";

/**
 * The relay locations discovery probes when `relayPath` is empty — the documented
 * per-platform install path (Unity installs `<home>/.unity/relay/<binary>`), plus
 * the bare name so a host that put the binary on `PATH` answers too. Every home
 * spelling is expanded through {@link expandHomePaths}. Unknown platforms
 * contribute nothing.
 */
export const DEFAULT_RELAY_PATHS: Record<string, string[]> = {
    linux: ["~/.unity/relay/relay_linux", "relay_linux"],
    darwin: [
        "~/.unity/relay/relay_mac_arm64.app/Contents/MacOS/relay_mac_arm64",
        "~/.unity/relay/relay_mac_x64.app/Contents/MacOS/relay_mac_x64",
        "relay_mac_arm64",
        "relay_mac_x64"
    ],
    win32: ["%USERPROFILE%\\.unity\\relay\\relay_win.exe", "relay_win.exe"]
};

/** The default discovery candidate list for one platform; [] probes nothing. */
export function defaultRelayPaths(platform: NodeJS.Platform = process.platform): string[] {
    const candidates = DEFAULT_RELAY_PATHS[platform];
    return Array.isArray(candidates) ? [...candidates] : [];
}

/**
 * Resolve the two home spellings discovery emits: `~/…` (POSIX, read through
 * `os.homedir()`) and `%USERPROFILE%\\…` (Windows). A value that carries neither
 * marker travels through untouched, and an unresolvable marker drops the entry
 * rather than probing a literal `~/.unity/…`.
 * @param candidates - candidate paths in either spelling.
 * @param home - home directory override (tests + the launch environment).
 */
export function expandHomePaths(candidates: readonly string[], home = ""): string[] {
    const homeDir = home !== "" ? home : safeHomedir();
    const out: string[] = [];
    for (const candidate of candidates) {
        const path = String(candidate ?? "");
        if (path === "") continue;
        if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
            if (homeDir === "") continue;
            out.push(homeDir + path.slice(1));
            continue;
        }
        const winHome = /^%USERPROFILE%([\\/]|$)/iu.exec(path);
        if (winHome !== null) {
            const profile = process.env.USERPROFILE;
            if (typeof profile !== "string" || profile.trim() === "") continue;
            out.push(profile.trim() + path.slice(winHome[0].length));
            continue;
        }
        out.push(path);
    }
    return out;
}

/** `os.homedir()` never throws, but a bare process can answer "" — then the
 * home-relative candidates simply drop out. */
function safeHomedir(): string {
    try {
        const home = os.homedir();
        return typeof home === "string" ? home.trim() : "";
    } catch {
        return "";
    }
}

/**
 * Every Windows profile's relay, reached through the interop mount: for each
 * directory that looks like a user profile under `WINDOWS_PROFILE_ROOT`, the
 * documented `.unity\relay\relay_win.exe` path spelled with `/mnt/c/...`
 * separators so a WSL `execve` accepts it.
 *
 * This is the one source a plain Windows-spelled candidate cannot be: a WSL
 * host has no `%USERPROFILE%`, and there is more than one profile to choose
 * from (the interactive user, plus whatever else sits there — and a service
 * account that never opened Unity). Every profile is offered; the probe, not the
 * walk, decides which of them actually answered.
 * @param exists - directory/file presence lookup (injected for tests).
 * @param root - the mount root override (tests).
 */
export function windowsProfileRelayPaths(
    exists: (path: string) => boolean = (candidate) => existsSync(candidate),
    root: string = WINDOWS_PROFILE_ROOT
): string[] {
    if (!exists(root)) return [];
    let profiles: string[];
    try {
        profiles = readdirSync(root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => entry.name)
            .filter((name) => name !== "" && !/^(?:all users|default|public|default user)$/iu.test(name));
    } catch {
        // A mount that vanished between the check and the read: no candidates,
        // not an error — the rest of the list still stands.
        return [];
    }
    const tail = WINDOWS_RELAY_SUBPATH.split("\\").join("/");
    return profiles
        .filter((name) => !name.includes("/"))
        .sort((left, right) => left.localeCompare(right))
        .map((name) => `${root}/${name}/${tail}`);
}

/**
 * Every path one executable run probes: the row-config candidate list (default
 * the platform list, with the Windows profiles inserted on a WSL host), then the
 * ids the saved rows carry, then the current selection — deduplicated, in this
 * order, so the list reads "what the host configures, then what the card saved,
 * then what runs".
 * @param entry - validated row config (`relayPaths` is the candidate list).
 * @param savedIds - the saved rows' ids, in row order (see ./catalog.ts).
 * @param effectivePath - the currently selected path, always kept in the list.
 * @param options - `wslHost` inserts the Windows profiles; `exists`/`home` feed
 * the profile walk and the home expansion (tests, and the launch environment).
 */
export function relayCandidates(
    entry: Pick<UnityMcpConfig, "relayPaths">,
    savedIds: readonly string[] = [],
    effectivePath = "",
    options: { wslHost?: boolean; exists?: (path: string) => boolean; home?: string } = {}
): string[] {
    const rowPaths = Array.isArray(entry?.relayPaths) && entry.relayPaths.length > 0
        ? entry.relayPaths
        : defaultRelayPaths();
    const base = expandHomePaths(rowPaths, options.home);
    const seen = new Set<string>();
    const candidates: string[] = [];
    const push = (value: unknown): void => {
        const path = String(value ?? "").trim();
        if (path === "" || seen.has(path)) return;
        seen.add(path);
        candidates.push(path);
    };
    if (options.wslHost === true) {
        for (const path of windowsProfileRelayPaths(options.exists)) push(path);
    }
    for (const path of base) push(path);
    for (const path of Array.isArray(savedIds) ? savedIds : []) push(path);
    push(effectivePath);
    return candidates;
}
