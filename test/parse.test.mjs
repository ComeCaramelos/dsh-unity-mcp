// Host-half pure-function tests for @comecaramelos/dsh-unity-mcp.
// Run: node test/parse.test.mjs (needs `npm run build` first).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
    bridgeConfig,
    buildServerArgs,
    carriesModeFlag,
    checkUnity,
    defaultRelayPaths,
    DEFAULT_EXTRA_FLAGS,
    DEFAULT_RELAY_PATHS,
    discoverUnity,
    entryIds,
    entryLabel,
    expandHomePaths,
    findEntry,
    flagsCarryMode,
    isUnityMissing,
    isValidEntryId,
    isWindowsExecutablePath,
    isWindowsExecutableUnderWsl,
    isWindowsSubsystemForLinux,
    MCP_MODE_FLAG,
    mergeEntries,
    name,
    normalizeEntries,
    readPersistedFlags,
    readPersistedRelayPath,
    readPersistedStderrMode,
    relayCandidates,
    resolveEffectiveRelayPath,
    resolveEnvFlags,
    resolveStderrMode,
    sameFlags,
    scanUnityExecutables,
    stripModeFlag,
    toolResultNote,
    validateExtraFlags,
    windowsProfileRelayPaths
} from "../lib/index.js";

// ── identity ────────────────────────────────────────────────────────────────
assert.equal(name, "unity-mcp", "cordis plugin name");

// ── validateExtraFlags ──────────────────────────────────────────────────────
// Flags are execve'd as argv entries (no shell), so only control characters and
// the mode flag are rejected — the bridge owns the relay mode.
assert.equal(validateExtraFlags(["--log-level=debug", "--project-path=/home/roberto/game"]), true, "accepts ordinary flags");
assert.equal(validateExtraFlags([]), true, "accepts an empty list");
assert.equal(validateExtraFlags(["--name=Project \"two\""]), true, "accepts a value with spaces (argv is exec'd without a shell)");
assert.throws(() => validateExtraFlags("--log-level=debug"), /must be an array/u, "rejects a bare string");
assert.throws(() => validateExtraFlags(["--ok", ""]), /non-empty/u, "rejects empty entries");
assert.throws(() => validateExtraFlags(["--a\n--b"]), /control characters/u, "rejects embedded newlines");
assert.throws(() => validateExtraFlags(["--x\u0000y"]), /control characters/u, "rejects NUL");
// The mode flag is the bridge's: a relay launched without `--mcp` speaks the
// relay protocol instead of MCP, so a flags list may not carry it.
assert.throws(() => validateExtraFlags(["--mcp"]), /sets the relay mode/u, "rejects the mode flag");
assert.throws(() => validateExtraFlags(["--mcp=1"]), /sets the relay mode/u, "rejects the mode flag with a value");

// ── mode-flag helpers ───────────────────────────────────────────────────────
assert.equal(carriesModeFlag("--mcp"), true, "bare mode flag");
assert.equal(carriesModeFlag("--mcp=true"), true, "mode flag with a value");
assert.equal(carriesModeFlag(" --mcp "), true, "mode flag with surrounding space");
assert.equal(carriesModeFlag("--relay"), false, "the other mode flag is not the mode flag");
assert.equal(carriesModeFlag("--mcpx"), false, "a longer flag is not the mode flag");
assert.equal(flagsCarryMode(["--a", "--mcp"]), true, "flagsCarryMode finds it");
assert.equal(flagsCarryMode(["--a"]), false, "flagsCarryMode rejects a clean list");
assert.equal(flagsCarryMode("--mcp"), false, "flagsCarryMode needs an array");
assert.deepEqual(stripModeFlag(["--a", "--mcp", "--b"]), ["--a", "--b"], "stripModeFlag drops the entry");
assert.deepEqual(stripModeFlag(["--a", "--mcp=x", "--b"]), ["--a", "--b"], "stripModeFlag drops the valued spelling too");
assert.deepEqual(stripModeFlag("--mcp"), [], "stripModeFlag needs an array");
assert.equal(sameFlags(["--a"], ["--a"]), true, "sameFlags compares element-wise");
assert.equal(sameFlags(["--a"], ["--b"]), false, "sameFlags rejects a different list");
assert.equal(sameFlags(["--a"], ["--a", "--b"]), false, "sameFlags rejects a longer list");
assert.equal(sameFlags("--a", "--a"), false, "sameFlags needs arrays");
assert.equal(sameFlags(DEFAULT_EXTRA_FLAGS, []), true, "the canonical default list is empty");

// ── buildServerArgs ─────────────────────────────────────────────────────────
// The bridge always leads with the mode flag, so the relay comes up in MCP
// mode whatever the flags list carries.
const relayOnly = { relayPath: "/home/u/.unity/relay/relay_linux" };
assert.deepEqual(buildServerArgs(relayOnly, []), [MCP_MODE_FLAG], "no flags → only the mode flag");
assert.deepEqual(
    buildServerArgs(relayOnly, ["--log-level=debug", "--name=Game"]),
    ["--mcp", "--log-level=debug", "--name=Game"],
    "flags follow the mode flag"
);
assert.deepEqual(
    buildServerArgs(relayOnly, ["--name=Game", "--mcp", "--debug"]),
    ["--mcp", "--name=Game", "--debug"],
    "a carried mode flag is folded, never duplicated (row-config copy)"
);
assert.deepEqual(buildServerArgs(relayOnly, ["", "--a", 1, null]), ["--mcp", "--a"], "non-strings and blanks drop out");

// ── bridgeConfig ────────────────────────────────────────────────────────────
const rowEntry = {
    serverName: "unity",
    command: "",
    relayPath: "/home/u/.unity/relay/relay_linux",
    relayPaths: [],
    extraFlags: [],
    env: {},
    cwd: "",
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
    bridgeStderr: "console",
    bridgeStderrLog: ""
};
const built = bridgeConfig(rowEntry, ["--log-level=debug"], "console");
assert.equal(built.config.serverName, "unity", "serverName passes through");
assert.equal(built.config.transport, "stdio", "stdio transport");
assert.equal(built.config.command, "/home/u/.unity/relay/relay_linux", "the effective relay is the spawn command");
assert.deepEqual(built.config.args, ["--mcp", "--log-level=debug"], "argv is the logical invocation");
assert.deepEqual(Object.keys(built.config).sort(), [
    "args", "cwd", "env", "failOnStartupError", "reconnect", "serverName", "toolCallTimeoutMs", "transport", "command"
].sort(), "only dsh-mcp-client fields travel");
assert.equal(built.redirect, "", "console mode redirects nothing");

// A `command` wrapper prefixes the argv: the relay path stays the logical
// invocation, the wrapper is what gets exec'd.
const wrapped = bridgeConfig({ ...rowEntry, command: "systemd-run --scope" }, [], "console");
assert.equal(wrapped.config.command, "systemd-run --scope", "the row-config wrapper is the spawn command");
assert.deepEqual(wrapped.config.args, ["--mcp"], "the wrapper keeps the logical invocation");

// ── discovery candidate lists ───────────────────────────────────────────────
assert.deepEqual(defaultRelayPaths("linux"), ["~/.unity/relay/relay_linux", "relay_linux"], "linux default locations");
assert.deepEqual(defaultRelayPaths("win32"), ["%USERPROFILE%\\.unity\\relay\\relay_win.exe", "relay_win.exe"], "windows default locations");
assert.deepEqual(defaultRelayPaths("darwin"), [
    "~/.unity/relay/relay_mac_arm64.app/Contents/MacOS/relay_mac_arm64",
    "~/.unity/relay/relay_mac_x64.app/Contents/MacOS/relay_mac_x64",
    "relay_mac_arm64",
    "relay_mac_x64"
], "darwin default locations");
assert.deepEqual(defaultRelayPaths("sunos"), [], "an unknown platform contributes nothing");
assert.deepEqual(DEFAULT_RELAY_PATHS.linux, defaultRelayPaths("linux"), "the table is the source of the default");
assert.deepEqual(defaultRelayPaths(), defaultRelayPaths(process.platform), "the no-arg form answers for this host");

assert.deepEqual(expandHomePaths(["~/.unity/relay/relay_linux"], "/home/u"), ["/home/u/.unity/relay/relay_linux"], "POSIX home marker resolves");
// The Windows marker resolves through `process.env.USERPROFILE`, not the home
// override: it is the Windows profile that names the relay, and an unset marker
// drops the entry rather than probing a literal `%USERPROFILE%\…`.
const savedProfile = process.env.USERPROFILE;
delete process.env.USERPROFILE;
assert.deepEqual(
    expandHomePaths(["%USERPROFILE%\\.unity\\relay\\relay_win.exe"], "/home/u"),
    [],
    "no USERPROFILE → the entry drops instead of probing the literal marker"
);
process.env.USERPROFILE = savedProfile === void 0 ? "" : savedProfile;
const winResolved = expandHomePaths(["%USERPROFILE%\\.unity\\relay\\relay_win.exe"], "/home/u");
assert.equal(
    winResolved.length,
    process.env.USERPROFILE.trim() === "" ? 0 : 1,
    "an answered USERPROFILE resolves the marker"
);
assert.ok(winResolved.every((candidate) => !candidate.includes("%")), "no candidate carries an unresolved marker");
if (savedProfile === void 0) delete process.env.USERPROFILE;
else process.env.USERPROFILE = savedProfile;
assert.deepEqual(expandHomePaths(["/usr/local/bin/relay_linux", "relay_linux"], "/home/u"), ["/usr/local/bin/relay_linux", "relay_linux"], "a markerless candidate travels untouched");

// Windows profiles: every real user directory under the interop mount, minus
// the accounts that never opened a Unity Editor. A profile directory the mount
// does not carry contributes nothing.
const profilesRoot = mkdtempSync(path.join(tmpdir(), "dsh-unity-mcp-profiles-"));
for (const profile of ["Roberto", "ana", "Public", "Default", "all users"]) {
    mkdirSync(path.join(profilesRoot, profile, ".unity", "relay"), { recursive: true });
}
const walked = windowsProfileRelayPaths((candidate) => existsSync(candidate), profilesRoot);
assert.deepEqual(
    walked,
    [
        path.join(profilesRoot, "Roberto", ".unity/relay/relay_win.exe"),
        path.join(profilesRoot, "ana", ".unity/relay/relay_win.exe")
    ].sort((a, b) => a.localeCompare(b)),
    "every real profile contributes the documented relay path"
);
assert.deepEqual(windowsProfileRelayPaths(() => false), [], "no mount → no candidates");

// Order: Windows profiles (under WSL) → row-config list → saved rows → selection.
const candidates = relayCandidates(
    { relayPaths: ["/opt/relay_linux", "relay_linux"] },
    ["/home/u/.unity/relay/relay_linux"],
    "/home/u/.unity/relay/relay_linux",
    { wslHost: true, exists: () => true }
);
assert.ok(candidates.length > 3, "the list carries more than the row config");
assert.ok(candidates.indexOf("/opt/relay_linux") < candidates.indexOf("/home/u/.unity/relay/relay_linux"), "row config precedes the saved rows");
assert.equal(candidates.filter((path) => path === "/home/u/.unity/relay/relay_linux").length, 1, "the selection is not duplicated");
const plain = relayCandidates({ relayPaths: ["relay_linux"] }, [], "", { wslHost: false, exists: () => true });
assert.deepEqual(plain, ["relay_linux"], "off WSL, no profiles are walked");

// ── saved-executable rows ───────────────────────────────────────────────────
assert.equal(isValidEntryId("/home/u/.unity/relay/relay_linux"), true, "an absolute path is a valid id");
assert.equal(isValidEntryId(""), false, "an empty id is not valid");
assert.equal(isValidEntryId("  "), false, "whitespace is not valid");
assert.equal(isValidEntryId("a\nb"), false, "control characters are not valid");
assert.deepEqual(
    normalizeEntries([
        { id: "/a/relay_linux", name: "Home" },
        { id: "/a/relay_linux", name: "Duplicate" },
        { id: "  ", name: "Blank" },
        { id: 1, name: "Not a string" },
        "not-a-row",
        { id: "/c/relay_linux" }
    ]),
    [
        { id: "/a/relay_linux", name: "Home" },
        { id: "/c/relay_linux", name: "" }
    ],
    "rows normalize: first id wins, blanks and non-objects drop, name defaults to \"\""
);
assert.equal(normalizeEntries(void 0).length, 0, "no rows normalize to nothing");
assert.deepEqual(normalizeEntries([{ id: "/a", name: "x".repeat(500) }]), [{ id: "/a", name: "x".repeat(200) }], "a name is capped");
assert.equal(entryLabel({ id: "/a/relay_linux", name: "Home" }), "Home", "a labeled row shows its label");
assert.equal(entryLabel({ id: "/a/relay_linux", name: "" }), "/a/relay_linux", "an unlabeled row shows its path");
assert.deepEqual(entryIds([{ id: "/a", name: "" }, { id: "/b", name: "" }]), ["/a", "/b"], "ids in row order");
assert.deepEqual(entryIds(), [], "no rows → no ids");
assert.equal(findEntry([{ id: "/a", name: "" }], "/a")?.id, "/a", "findEntry finds a row");
assert.equal(findEntry([{ id: "/a", name: "" }], "/z"), void 0, "findEntry answers nothing for an absent row");
const merged = mergeEntries([{ id: "/a", name: "Home" }], ["/b", "/a", "", 1, "/c", "/d"]);
assert.deepEqual(merged.entries, [
    { id: "/a", name: "Home" },
    { id: "/b", name: "" },
    { id: "/c", name: "" },
    { id: "/d", name: "" }
], "a merge keeps saved labels and names, appends the unseen ids, keeps the first per id");
assert.equal(merged.changed, true, "an appended id is a change");
const unchanged = mergeEntries([{ id: "/a", name: "" }], ["/a", "/a"]);
assert.equal(unchanged.changed, false, "the same ids are not a change");
assert.deepEqual(unchanged.entries, [{ id: "/a", name: "" }], "no ids land");

// ── persisted reads ─────────────────────────────────────────────────────────
const ctxWith = (section) => ({
    get: (key) => (key === "settings" && section !== void 0 ? { document: { "unity-mcp": section } } : void 0)
});
assert.deepEqual(readPersistedFlags(ctxWith({ extraFlags: ["--a"] })), ["--a"], "persisted flags read back");
assert.deepEqual(readPersistedFlags(ctxWith({ extraFlags: [] })), [], "a cleared list reads back as cleared, not absent");
assert.equal(readPersistedFlags(ctxWith({ extraFlags: "nope" })), undefined, "a wrong-typed persisted value is ignored");
assert.equal(readPersistedFlags({ get: () => void 0 }), undefined, "no settings service → undefined");
assert.equal(readPersistedRelayPath(ctxWith({ relayPath: "  /home/u/.unity/relay/relay_linux  " })), "/home/u/.unity/relay/relay_linux", "the persisted selection is trimmed");
assert.equal(readPersistedRelayPath(ctxWith({ relayPath: "" })), "", "an empty persisted selection reads as nothing");
assert.equal(readPersistedStderrMode(ctxWith({ stderrMode: "console" })), "console", "the persisted toggle reads back");
assert.equal(readPersistedStderrMode(ctxWith({ stderrMode: "trace" })), "", "an invalid mode reads as unset");
assert.equal(readPersistedStderrMode(ctxWith({})), "", "absent mode reads as unset");

// ── precedence + stderr mode ────────────────────────────────────────────────
assert.equal(resolveEffectiveRelayPath("  /home/u/.unity/relay/relay_linux  ", "/opt/relay_linux"), "/home/u/.unity/relay/relay_linux", "the selection wins over the row config");
assert.equal(resolveEffectiveRelayPath("", "/opt/relay_linux"), "/opt/relay_linux", "the row config is the fallback");
assert.equal(resolveEffectiveRelayPath("", "   "), "", "nothing in either layer resolves to nothing");
assert.equal(resolveEffectiveRelayPath(void 0, void 0), "", "absent layers resolve to nothing");
assert.deepEqual(resolveEnvFlags(["--a"], "  --log-level=debug  --name=Game  "), ["--log-level=debug", "--name=Game"], "env flags split on whitespace");
assert.deepEqual(resolveEnvFlags(["--a"], ""), ["--a"], "an empty env value keeps the row config");
assert.deepEqual(resolveEnvFlags(["--a"], "--mcp"), ["--a"], "an env value carrying the mode flag is rejected");
assert.equal(resolveStderrMode("console", "log"), "console", "the persisted toggle wins");
assert.equal(resolveStderrMode("", "console"), "console", "no toggle falls back to the row config");
assert.equal(resolveStderrMode("", "log"), "log", "log is the default");
assert.equal(resolveStderrMode("trace", "console"), "console", "an invalid toggle falls back");

// ── platform helpers ────────────────────────────────────────────────────────
assert.equal(isWindowsExecutablePath("C:\\Users\\Roberto\\.unity\\relay\\relay_win.exe"), true, "a drive-letter path is a Windows executable");
assert.equal(isWindowsExecutablePath("/mnt/c/Users/Roberto/.unity/relay/relay_win.exe"), true, "the interop spelling is a Windows executable");
assert.equal(isWindowsExecutablePath("/home/u/.unity/relay/relay_linux"), false, "a POSIX path is not");
assert.equal(isWindowsExecutablePath(""), false, "an empty path is not");
// A supplied source is authoritative: its silence is the answer, so the marker
// file never has to be read (and the probe stays machine-independent).
const envSource = (values) => (name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : void 0);
assert.equal(isWindowsSubsystemForLinux({ platform: "linux", env: envSource({ WSL_DISTRO_NAME: "Ubuntu" }) }), true, "the distro-name variable answers WSL");
assert.equal(isWindowsSubsystemForLinux({ platform: "linux", env: envSource({ WSL_INTEROP: "/run/interop" }) }), true, "the interop variable answers WSL");
assert.equal(isWindowsSubsystemForLinux({ platform: "linux", env: envSource({}) }), false, "a silent source answers not-WSL");
assert.equal(isWindowsSubsystemForLinux({ platform: "win32", env: envSource({ WSL_DISTRO_NAME: "Ubuntu" }) }), false, "the marker only means WSL on Linux");
assert.equal(isWindowsExecutableUnderWsl("/mnt/c/Users/u/.unity/relay/relay_win.exe", { platform: "linux", env: envSource({ WSL_DISTRO_NAME: "Ubuntu" }) }), true, "a Windows relay under WSL");
assert.equal(isWindowsExecutableUnderWsl("/home/u/.unity/relay/relay_linux", { platform: "linux", env: envSource({ WSL_DISTRO_NAME: "Ubuntu" }) }), false, "a Linux relay under WSL is not the flagged state");
assert.equal(isWindowsExecutableUnderWsl("/mnt/c/Users/u/.unity/relay/relay_win.exe", { platform: "linux", env: envSource({}) }), false, "off WSL the state is not flagged");

// ── status helpers ──────────────────────────────────────────────────────────
assert.equal(isUnityMissing("Unity relay executable not found: /nope/relay_linux"), true, "the known executable-missing error");
assert.equal(isUnityMissing("No Unity editor found"), true, "an absent Editor flags the known error");
assert.equal(isUnityMissing("Failed to connect to Unity MCP"), true, "an unreachable bridge flags the known error");
assert.equal(isUnityMissing("tool invocation failed"), false, "an unrelated failure does not");
assert.equal(toolResultNote("mcp__unity__get_unity_scene_diff", { isError: true, content: [{ type: "text", text: "No Editor connected" }] }), "get_unity_scene_diff failed: No Editor connected", "a failed call is summarized");
assert.equal(toolResultNote("mcp__unity__get_unity_scene_diff", { content: [{ type: "text", text: "ok" }] }), null, "success clears");
assert.equal(toolResultNote("mcp__unity__x", null), null, "no result is not a failure");

// A run that probes nothing answers "" — callers must read that as "no
// evidence", never as health.
assert.equal(await checkUnity({ relayPath: "", relayPaths: [] }), "", "no candidates → no evidence");
assert.deepEqual(await scanUnityExecutables([]), [], "scanning nothing answers nothing");
let probed = [];
assert.deepEqual(
    await scanUnityExecutables(["/no/such/relay_linux", "/nope/relay_mac_arm64"], (candidate) => {
        probed.push(candidate);
        return "";
    }),
    [],
    "absent candidates drop out of the answer"
);
assert.equal(probed.length, 2, "every candidate was consulted");
await checkUnity({ relayPath: "/no/such/relay_linux", relayPaths: [] }).then(
    () => assert.fail("a fixed absent path must not answer \"healthy\""),
    (error) => assert.match(String(error.message), /Unity relay executable not found/u, "a fixed absent path reports the known error")
);
assert.ok(
    (await discoverUnity(["/no/such/relay_linux", "/nope/relay_linux"]).catch((error) => error.message)).includes("not found"),
    "a discovery that finds nothing throws the missing-executable error"
);

console.log("test/parse.test.mjs: ok");
