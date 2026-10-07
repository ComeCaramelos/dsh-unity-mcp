/**
 * Host-half fixed identifiers, budgets and validation patterns.
 *
 * The strings are a public contract — the settings namespace is both the
 * persistence key and the Web card's slot key — and the budgets are what the
 * README and the tests quote, so they live here once and every module imports
 * rather than repeats them.
 */

/** Fixed settings namespace; also the client card's slot key. */
export const SETTINGS_NAMESPACE = "unity-mcp";

/** Environment variable that seeds the launch flags for one dsh run. */
export const FLAGS_ENV_VAR = "DSH_UNITY_MCP_FLAGS";

/**
 * Flag entries are appended verbatim to the bridge argv and reach the relay via
 * a direct execve (no shell), so shell metacharacters cannot execute here. What
 * must never reach argv is control characters (newlines, NULs) — they corrupt
 * the argument framing, so entries may not contain any.
 */
export const CONTROL_PATTERN = /[\x00-\x1f\x7f]/u;

/**
 * The mode flag the relay must be launched with for it to speak MCP: without it
 * the relay comes up as a plain relay server and never registers tools. It is
 * prepended ahead of the user flags, so a user flag that repeats it changes
 * nothing (deduped by {@link buildServerArgs}).
 */
export const MCP_MODE_FLAG = "--mcp";

/** Flags every launch carries, ahead of the user's own extra flags. */
export const DEFAULT_EXTRA_FLAGS: string[] = [];

/** Upstream configuration docs surfaced by the client card link. */
export const CONFIGURATION_DOCS_URL =
    "https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.0/manual/unity-mcp-get-started.html";

/** Timeout for one check subprocess (relay executable probe). */
export const CHECK_TIMEOUT_MS = 15000;

/** Max length of a reported error line. */
export const ERROR_CAP = 240;

/**
 * Log lines the bridge emits after a lost connection recovered — clear the
 * captured connection error when one shows up.
 */
export const BRIDGE_RECONNECTED = /reconnected and re-synced tools/u;

/** One bridge log level: the levels the captured wrapper shadows. */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/** Modes accepted by the `stderrMode` user layer: also the empty string
 * ("" → follow the row config `bridgeStderr`). */
export const STDERR_MODE_FIELD_PATTERN = /^(?:log|console)?$/u;

/** Row-config `bridgeStderrLog` accepts "" (the per-spawn default) or a
 * POSIX absolute path; nothing else. */
export const OPTIONAL_PATH_PATTERN = /^(?:\/[^\x00-\x1f\x7f]*|)$/u;

/**
 * Candidate POSIX shells used only to redirect the bridge's stderr (see
 * ./bridge.ts `buildBridgeSpawn`). None found on a bare Windows host → the
 * redirect is impossible and the spawn stays unwrapped with `fallback:
 * "platform"`/`"shell"`.
 */
export const SH_PATH_CANDIDATES = ["/bin/sh", "/usr/bin/sh"] as const;

/**
 * `relayPath` user layer: a filesystem path or a PATH-resolved name. Nothing
 * travels through a shell here either, so the only hard constraint is that no
 * control character reaches it; the length cap keeps one absurd value out of
 * argv and out of the settings document. Windows path spellings (drive letters,
 * backslashes) are legal — a Windows relay launched through the WSL interop
 * mount is a supported configuration.
 */
export const RELAY_PATH_PATTERN = /^[^\x00-\x1f\x7f]{0,4096}$/u;

/** Longest display name a saved-executable row may carry — the `name` half is
 * UI-only (what the pill and the dropdown render), the `id` half is what goes on
 * the wire. */
export const CATALOG_NAME_MAX_LENGTH = 200;

/** Upper bound of the saved-executable rows, merged-list side: the tail drops
 * off, so a scan that keeps discovering new ids cannot grow the persisted
 * catalog without limit. */
export const CATALOG_MAX_LENGTH = 50;

/** The documented Windows relay location, as one Windows-spelled path:
 * `%USERPROFILE%\.unity\relay\relay_win.exe`. Split so the profile half can be
 * swapped for the profile directories discovery walks. */
export const WINDOWS_RELAY_SUBPATH = ".unity\\relay\\relay_win.exe";

/**
 * The Windows-side user root as WSL mounts it. Discovery walks the profiles
 * under this root and probes `<root>\<profile>\<WINDOWS_RELAY_SUBPATH>` for
 * every profile it finds — the same binary the Unity Editor installs, just
 * reached through the interop mount instead of the Windows environment.
 */
export const WINDOWS_PROFILE_ROOT = "/mnt/c/Users";

/**
 * What one probe of the relay answers with, so the probe result can be turned
 * into a version line. `--version` prints three lines (title, `Name:`,
 * `Version:`); the `Version:` one is what the card shows.
 */
export const RELAY_VERSION_PATTERN = /^Version:\s*(.+)$/u;

/**
 * Environment variables WSL exports into every distro session. Their presence
 * answers "are we running inside WSL?" — the first one carries the distro name,
 * `WSL_INTEROP` the interop-path directory (`/run/WSL/<pid>`). Discovery uses
 * this only to decide whether walking the Windows profiles is worth a directory
 * read at all.
 */
export const WSL_ENV_VARS = ["WSL_DISTRO_NAME", "WSL_DISTRO_LABEL", "WSL_INTEROP"] as const;

/**
 * The `binfmt_misc` registration WSL installs for PE binaries: its presence
 * marks a WSL kernel. It is only the **fallback** signal — inside a host the
 * launch environment is authoritative, and an empty one is an answer (see
 * ./platform.ts).
 */
export const WSL_INTEROP_MARKER = "/proc/sys/fs/binfmt_misc/WSLInterop";

/** The PE suffix: a `.exe` answers a probe like any Linux ELF, so it is never
 * a reason to keep a candidate off the probe list. */
export const WINDOWS_EXE_PATTERN = /\.exe$/iu;

/** Schema pattern for `effectiveSource` ("" = nothing resolved yet). */
export const EFFECTIVE_SOURCE_PATTERN = /^(?:selected|row-config)?$/u;
