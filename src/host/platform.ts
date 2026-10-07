/**
 * Host half — where the plugin is running: is this Linux host a Windows
 * Subsystem for Linux instance, and does one executable path name a Windows
 * binary rather than a Linux one.
 *
 * For the Unity relay this is **informational, never a block**: the relay is a
 * console binary whose MCP transport is plain stdio, and WSL's interop layer
 * carries stdio to a Windows binary (verified 2026-10-07 against
 * `unity-ai-relay v1.0.12-build.99`, whose `--version` answers across the
 * mount). The Chrome case was different: it inherited file descriptors, not a
 * stdio pair, and read the debugging port off a loopback WSL2 NAT cannot
 * reach. A Windows relay chosen on a WSL host therefore *launches*, and the
 * relay↔Editor connection stays entirely Windows-side.
 *
 * It is surfaced on the card as a state rather than an error because the two
 * answers do combine into something a user should know: the relay process runs
 * on the Windows side, so anything the relay itself opens (its log directory,
 * its `--project-path` argument) must be spelled the Windows way.
 *
 * Both probes stay pure and injectable (`platform`, `env`, `exists`) so the
 * tests never depend on the machine they run on.
 */
import { existsSync } from "node:fs";

import { WINDOWS_EXE_PATTERN, WSL_ENV_VARS, WSL_INTEROP_MARKER } from "./constants.js";

/** Everything {@link isWindowsSubsystemForLinux} consults; each field defaults
 * to what the running process actually is. */
export type PlatformProbe = {
    /** Defaults to `process.platform`. */
    platform?: NodeJS.Platform;
    /** Variable lookup; defaults to `process.env`. When a source is supplied its
     * silence is the answer — the marker file is then not consulted, so a host
     * that resolves its launch environment gets one deterministic answer
     * instead of one that depends on the machine it booted on. */
    env?: (name: string) => unknown;
    /** File-presence lookup used only when `env` is not supplied (a bare call
     * with no host to resolve against); defaults to the interop marker. */
    exists?: (path: string) => boolean;
};

/**
 * True when `path` names a Windows binary — one that lives on the interop mount
 * (`/mnt/<drive>/…`, spelled `/mnt/c/...`), in a Windows spelling (`\\host\…`,
 * `C:\…`), or simply carries the PE suffix. A Linux path is never Windows-side.
 * @param path - one executable path as selected.
 */
export function isWindowsExecutablePath(path: unknown): boolean {
    if (typeof path !== "string") return false;
    const candidate = path.trim();
    if (candidate === "") return false;
    if (/^\/mnt\/[a-z]\//iu.test(candidate)) return true;
    if (/^(?:\\\\[\w.-]+\\|[a-z]:[\\/])/iu.test(candidate)) return true;
    return WINDOWS_EXE_PATTERN.test(candidate);
}

/**
 * True when the current process runs inside Windows Subsystem for Linux: a
 * Linux kernel plus the WSL markers. A non-Linux platform (a plain Windows
 * host) is never "under WSL", whatever its environment says.
 * @param probe - what to consult (defaults to this process).
 */
export function isWindowsSubsystemForLinux(probe: PlatformProbe = {}): boolean {
    const platform = probe.platform ?? process.platform;
    if (platform !== "linux") return false;
    if (probe.env !== void 0) {
        return WSL_ENV_VARS.some((name) => {
            const value = probe.env!(name);
            return typeof value === "string" && value.trim() !== "";
        });
    }
    return (probe.exists ?? ((candidate: string) => existsSync(candidate)))(WSL_INTEROP_MARKER);
}

/**
 * The Windows-side answer the card surfaces: we are under WSL **and** what is
 * selected is a Windows executable. Both halves are required — a Linux binary
 * selected on a Windows host is simply nothing to say. Unlike the same pair
 * reported for the Chrome plugin this is not a broken selection: the relay does
 * launch. It is the configuration the user should not have to rediscover.
 * @param path - the effective executable path.
 * @param probe - what to consult for the environment (defaults to this process).
 */
export function isWindowsExecutableUnderWsl(path: unknown, probe: PlatformProbe = {}): boolean {
    return isWindowsSubsystemForLinux(probe) && isWindowsExecutablePath(path);
}
