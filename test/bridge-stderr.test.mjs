// Tests for bridge-stderr capture (lib/index.js buildBridgeSpawn /
// bridgeStderrLogPath / resolveStderrMode / readPersistedStderrMode). The console
// noise is the relay's own progress lines: the MCP stdio transport spawns the
// relay with inherited stderr, so every line lands on the dsh console. The
// wrapper must preserve the logical `<relay> --mcp [extraFlags]` invocation
// while sending only stderr to a log file (stdout stays the protocol stream).
// Run: node test/bridge-stderr.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bridgeStderrLogPath, buildBridgeSpawn, readPersistedStderrMode, resolveStderrMode } from "../lib/index.js";

// ── effective-mode resolution: UI toggle > row config, never a third state ──
assert.equal(resolveStderrMode("log", "console"), "log", "explicit log override wins over row config console");
assert.equal(resolveStderrMode("console", "log"), "console", "explicit console override wins over row config log");
assert.equal(resolveStderrMode("", "console"), "console", "untouched toggle falls back to row config");
assert.equal(resolveStderrMode("", "log"), "log", "untouched toggle + default row config = capture");
assert.equal(resolveStderrMode(void 0, "log"), "log", "missing override falls back");
assert.equal(resolveStderrMode("bogus", "log"), "log", "invalid override is ignored, not trusted");
{
    const settings = (section) => ({ get: (name) => (name === "settings" ? { document: { "unity-mcp": section } } : void 0) });
    assert.equal(readPersistedStderrMode(settings({ stderrMode: "console" })), "console", "persisted console selection");
    assert.equal(readPersistedStderrMode(settings({ stderrMode: "log" })), "log", "persisted log selection");
    assert.equal(readPersistedStderrMode(settings({ stderrMode: "" })), "", "empty persisted value means auto");
    assert.equal(readPersistedStderrMode(settings({ stderrMode: "bogus" })), "", "invalid persisted value ignored");
    assert.equal(readPersistedStderrMode(settings({})), "", "absent field means auto");
    assert.equal(readPersistedStderrMode(settings(void 0)), "", "absent section means auto");
    assert.equal(readPersistedStderrMode({ get: () => void 0 }), "", "no settings service means auto (onChange applies later)");
}

const relay = "/home/roberto/.unity/relay/relay_linux";
const target = { command: relay, args: ["--mcp", "--log-level=debug"] };
const options = { platform: "linux", exists: (candidate) => candidate === "/bin/sh", tmpdir: "/tmp", pid: 4321 };

// Default mode: wrapped in sh -c, the logical argv preserved, stderr → log file.
let built = buildBridgeSpawn(target, options);
assert.equal(built.command, "/bin/sh");
assert.equal(built.args[0], "-c");
assert.equal(built.args[2], "unity-ai-relay");
assert.equal(built.args[3], relay);
assert.equal(built.args[4], "/tmp/dsh-unity-mcp-bridge-bridge-4321.log");
assert.deepEqual(built.args.slice(5), target.args);
assert.equal(built.redirect, "/tmp/dsh-unity-mcp-bridge-bridge-4321.log");
assert.equal(built.fallback, "");

// The script keeps stdout (the protocol stream) and only routes stderr.
assert.match(built.args[1], /exec "\$BRIDGE" "\$@" 2>"\$LOG"/);
// A missing executable fails loud with 127 + a message ON stderr.
assert.match(built.args[1], /exit 127/);
assert.match(built.args[1], /bridge executable not found/);

// console mode: raw command/args, no redirect, no fallback.
built = buildBridgeSpawn({ ...target, stderr: "console" }, options);
assert.equal(built.command, relay);
assert.deepEqual(built.args, target.args);
assert.equal(built.redirect, "");
assert.equal(built.fallback, "");

// Platform without a known POSIX shell: identity + platform fallback.
built = buildBridgeSpawn(target, { ...options, platform: "win32" });
assert.equal(built.command, relay);
assert.deepEqual(built.args, target.args);
assert.equal(built.fallback, "platform");

// No sh found: identity + shell fallback.
built = buildBridgeSpawn(target, { ...options, exists: () => false });
assert.equal(built.command, relay);
assert.deepEqual(built.args, target.args);
assert.equal(built.fallback, "shell");

// logPath override wins over the default.
built = buildBridgeSpawn({ ...target, logPath: "/custom/path/bridge.log" }, options);
assert.equal(built.args[4], "/custom/path/bridge.log");
assert.equal(built.redirect, "/custom/path/bridge.log");

// serverName shapes the default path.
assert.equal(bridgeStderrLogPath("unity-ai", { tmpdir: "/tmp", pid: 7 }), "/tmp/dsh-unity-mcp-unity-ai-bridge-7.log");
assert.equal(bridgeStderrLogPath("bad/name", { tmpdir: "/tmp", pid: 7 }), "/tmp/dsh-unity-mcp-bad-name-bridge-7.log", "an unsafe serverName is flattened");

// Default derivation (no tmpdir override) must NOT be a predictable name in the
// world-writable temp namespace: it lands inside a private directory created
// exclusively for this host process.
{
    const first = bridgeStderrLogPath("unity", {});
    const second = bridgeStderrLogPath("unity", {});
    assert.equal(first, second, "the sink path is stable for the host process — no directory churn per spawn");
    assert.equal(first.includes("-bridge.log"), true, "the sink name carries no pid anyone can predict");
    const sinkDir = path.dirname(first);
    assert.equal(sinkDir !== path.resolve(os.tmpdir()), true, "the sink lives inside a directory of its own, not in the temp root");
    assert.equal(path.basename(sinkDir).startsWith("dsh-unity-mcp-"), true, "the private directory carries the plugin prefix");
    assert.equal(path.basename(first), "unity-bridge.log", "one log per bridge inside the private directory");
    if (process.platform === "linux" || process.platform === "darwin") {
        const dirMode = fs.statSync(sinkDir).mode & 0o777;
        assert.equal(dirMode, 0o700, "the private directory is owner-only — nothing can be planted next to the sink");
    }
    if (fs.existsSync(sinkDir) && fs.readdirSync(sinkDir).length === 0) fs.rmdirSync(sinkDir);
}

// ── Integration: a real sh spawn keeps stdout clean and writes stderr to the
// log file, proving the transport-visible protocol stream survives and only
// stderr is diverted.
if (process.platform === "linux" || process.platform === "darwin") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-um-stderr-"));
    try {
        const logPath = path.join(dir, "bridge.log");
        const fake = path.join(dir, "relay_linux");
        fs.writeFileSync(fake, "#!/bin/sh\nprintf 'PROTO-OK\\n'\nprintf 'NOISE-LINE\\n' >&2\nexit 0\n");
        fs.chmodSync(fake, 0o755);
        const wrapped = buildBridgeSpawn({ command: fake, args: ["--mcp", "--name=Game"], stderr: "log", logPath });
        let stdout = "";
        const code = await new Promise((resolve) => {
            const child = spawn(wrapped.command, wrapped.args, { stdio: ["ignore", "pipe", "ignore"] });
            child.stdout.on("data", (chunk) => (stdout += String(chunk)));
            child.once("close", resolve);
            child.once("error", () => resolve(-1));
        });
        assert.equal(code, 0, "wrapped bridge exited 0");
        assert.equal(stdout, "PROTO-OK\n", "stdout (the protocol stream) reaches the transport untouched");
        assert.ok(fs.readFileSync(logPath, "utf8").includes("NOISE-LINE"), "stderr landed in the log file");

        // A missing executable fails with 127 and the reason on stderr.
        const missing = buildBridgeSpawn({ command: path.join(dir, "no-such-relay"), args: ["--mcp"], stderr: "log", logPath: path.join(dir, "missing.log") });
        const missingCode = await new Promise((resolve) => {
            const child = spawn(missing.command, missing.args, { stdio: ["ignore", "ignore", "ignore"] });
            child.once("close", resolve);
            child.once("error", () => resolve(-1));
        });
        assert.equal(missingCode, 127, "the wrapper reports a missing executable as 127");

        // argv preserved verbatim across the wrapper.
        const argvFake = path.join(dir, "argv-echo");
        const argvLog = path.join(dir, "argv.log");
        fs.writeFileSync(argvFake, "#!/bin/sh\nprintf '%s\\n' \"$@\"\nexit 0\n");
        fs.chmodSync(argvFake, 0o755);
        const argvWrapped = buildBridgeSpawn({ command: argvFake, args: ["--mcp", "--project-path=/home/roberto/my game"], stderr: "log", logPath: argvLog });
        const echoed = await new Promise((resolve, reject) => {
            const child = spawn(argvWrapped.command, argvWrapped.args, { stdio: ["ignore", "pipe", "ignore"] });
            let out = "";
            child.stdout.on("data", (chunk) => (out += String(chunk)));
            child.once("close", () => resolve(out));
            child.once("error", reject);
        });
        assert.equal(echoed, "--mcp\n--project-path=/home/roberto/my game\n", "argv preserved verbatim (a space inside one flag value stays a single entry)");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log("bridge-stderr.test.mjs: all assertions passed");
