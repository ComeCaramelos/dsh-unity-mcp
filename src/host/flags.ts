/**
 * Extra-flags helpers shared by the bridge argv builder, the executable scan
 * and the settings validation hook.
 *
 * Flags are execve'd as argv entries — never through a shell — so validation
 * rejects control characters only. The mode flag is the one entry the bridge
 * owns: the relay does not speak MCP without it, so it is always prepended and
 * an extra-flags list may not carry it (a second `--mcp` changes nothing and a
 * stray `--relay` would take the server out of MCP mode).
 */
import { CONTROL_PATTERN, MCP_MODE_FLAG } from "./constants.js";

/**
 * Validate a user-authored extraFlags list: a plain array of flag strings
 * carrying no control characters (argv is execve'd without a shell), and no
 * mode flag — the mode is the bridge's decision, so letting a flag set it
 * would put a second source of truth over the bridge argv. Throws with the
 * offending entry so the settings layer can surface it.
 * @param value - candidate flags array.
 * @returns true when valid.
 */
export function validateExtraFlags(value: unknown): true {
    if (!Array.isArray(value)) {
        throw new Error("extraFlags must be an array of strings");
    }
    for (const flag of value) {
        if (typeof flag !== "string" || flag === "") {
            throw new Error("extraFlags entries must be non-empty strings");
        }
        if (CONTROL_PATTERN.test(flag)) {
            throw new Error(`extraFlags entry "${flag}" contains control characters`);
        }
        if (carriesModeFlag(flag)) {
            throw new Error(
                `extraFlags entry "${flag}" sets the relay mode — the bridge always launches the relay in MCP mode, drop this entry`
            );
        }
    }
    return true;
}

/** True when one flag is the mode flag, with or without `=`. */
export function carriesModeFlag(flag: string): boolean {
    return typeof flag === "string" && flag.trim().split(/=/u)[0] === MCP_MODE_FLAG;
}

/** True when a flags list already names the mode flag (row-config fold). */
export function flagsCarryMode(flags: unknown): boolean {
    return Array.isArray(flags) && flags.some((flag) => typeof flag === "string" && carriesModeFlag(flag));
}

/**
 * Strip the mode flag out of a row-config flags list so it never reaches argv
 * twice: {@link buildServerArgs} always prepends it. The flag's `=` spelling
 * consumes nothing; a bare flag drops the entry alone.
 */
export function stripModeFlag(flags: unknown): string[] {
    if (!Array.isArray(flags)) return [];
    return flags.filter((flag) => typeof flag === "string" && !carriesModeFlag(flag));
}

/** True when two flags lists are element-wise equal (flags are arrays). */
export function sameFlags(a: unknown, b: unknown): boolean {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((flag, index) => flag === (b as string[])[index]);
}
