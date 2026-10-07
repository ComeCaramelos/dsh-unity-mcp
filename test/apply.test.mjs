// Runtime-wiring tests for apply(ctx, config): the `tools/post-execute` capture
// must write Unity-tool failures into the base-layer lastError (and clear them
// on the next success), a flags write must hot-restart the bridge, the
// "Reduce log output" toggle must re-spawn with/without the stderr wrapper, and
// the executable action must re-run discovery exactly once per request.
// Run: node test/apply.test.mjs (needs `npm run build` first).
import assert from "node:assert/strict";
import { apply } from "../lib/index.js";

const config = {
    serverName: "unity",
    command: "",
    extraFlags: ["--log-level=debug"],
    relayPath: "",
    // No candidate list that could find anything on this host: every run must
    // answer the same way wherever the suite happens to run.
    relayPaths: ["/no/such/relay_linux", "/no/such/relay_mac_arm64"],
    env: {},
    cwd: "",
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    // "console" so this stub's argv assertion sees the logical invocation
    // unwrapped (the default "log" capture wrapper is covered by the
    // buildBridgeSpawn assertions in bridge-stderr.test.mjs).
    bridgeStderr: "console",
    bridgeStderrLog: "",
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 }
};

/** Stubbed host ctx surface consumed by apply(). */
function stub(options = {}) {
    const state = { logs: [], bridges: [], updates: [], toolHandler: void 0, entry: void 0, hooks: void 0 };
    const logger = { trace() {}, debug() {}, info: log, warn: log, error: log, fatal() {} };
    function log(...args) { state.logs.push(args); }
    const settingsCtx = {
        settings: {
            installSection(_ctx, _ns, _schema, entry, hooks) {
                state.entry = entry;
                state.hooks = hooks;
                // The settings service hands back the resolved value: the
            // base-layer entry plus the persisted user layer.
            hooks.setSource(() => ({ ...entry, ...(options.user ?? {}) }));
                hooks.onChange();
            }
        }
    };
    state.ctx = {
        logger,
        get(key) {
            // A settings service is only "up" (and thus readable/persistable)
            // when the stub says so: without it the host reads row config and
            // cannot persist a seeded selection.
            if (key === "settings" && options.settings) return options.settings;
            // The host resolves the launch environment through this slot, and it
            // is how a test pins "are we under WSL?" without depending on the
            // machine running the suite: a supplied map answers for the whole
            // environment, so an empty one is plain Linux.
            if (key === "launchEnvironment" && options.env !== void 0) {
                const values = options.env;
                return { get: (name) => (Object.prototype.hasOwnProperty.call(values, name) ? { value: values[name] } : void 0) };
            }
            return void 0;
        },
        on(event, handler) {
            if (event === "tools/post-execute") state.toolHandler = handler;
        },
        extend() {
            return {
                plugin(_ctor, bridgeCfg) {
                    state.bridges.push(bridgeCfg);
                    return { update: (cfg) => { state.updates.push(cfg); } };
                }
            };
        },
        inject(deps, callback) {
            if (deps.includes("settings")) callback(settingsCtx);
        },
        effect(execute) {
            execute();
            return { dispose: () => {} };
        }
    };
    return state;
}

const settled = async () => ({ kind: "accept" });
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

// ── registration ────────────────────────────────────────────────────────────
{
    const state = stub({ env: {} });
    apply(state.ctx, config);
    assert.equal(typeof state.toolHandler, "function", "tools/post-execute listener registered");
    assert.equal(state.bridges.length, 1, "one bridge mounted");
    assert.equal(state.bridges[0].serverName, "unity", "the bridge carries the row-config serverName");
    assert.equal(state.bridges[0].transport, "stdio", "the bridge is a stdio bridge");
    assert.deepEqual(state.bridges[0].args, ["--mcp", "--log-level=debug"], "the logical invocation is `<relay> --mcp [extraFlags]`");

    await tick();
    const entry = state.entry;
    assert.equal(entry.executableDiscoveryRevision, 1, "registration ran one executable run");
    assert.deepEqual(entry.executableStatus, [], "nothing found → no answers to render");
    assert.deepEqual(entry.executables, [], "nothing merged → no saved rows");
    assert.equal(entry.relayVersion, "", "an empty selection answered no version");
    assert.equal(entry.effectiveRelayPath, "", "nothing resolved → no effective path");
    assert.equal(entry.effectiveSource, "", "nothing resolved → no source");
    assert.deepEqual(entry.defaultExtraFlags, [], "the relay has no canonical default flags");
    assert.equal(entry.wslWindowsExecutable, false, "plain Linux never flags the WSL state");
    // Nothing configured and nothing found is the known executable-missing
    // state, reported on the card rather than silently launched empty.
    assert.match(entry.lastError, /Unity relay executable not found/u, "an empty host reports the known error");
    assert.equal(entry.unityMissing, true, "and sets the known-error flag");

    // ── tool-call status capture ────────────────────────────────────────────
    await state.toolHandler(
        { name: "mcp__unity__get_unity_scene_diff" },
        { isError: true, content: [{ type: "text", text: "No Unity Editor connected" }] },
        settled
    );
    assert.equal(entry.lastError, "get_unity_scene_diff failed: No Unity Editor connected", "a failed Unity-tool call surfaces on the card");
    assert.equal(entry.unityMissing, true, "the absent-Editor wording flags the known error");

    await state.toolHandler({ name: "mcp__unity__get_unity_project_path" }, { content: [{ type: "text", text: "/home/u/game" }] }, settled);
    assert.equal(entry.lastError, "", "a success clears the note");
    assert.equal(entry.unityMissing, false, "a Unity-tool success clears the known-error flag");

    // Calls outside this server's namespace must not touch the status.
    entry.lastError = "keep me";
    await state.toolHandler({ name: "bash" }, { isError: true, content: [{ type: "text", text: "boom" }] }, settled);
    assert.equal(entry.lastError, "keep me", "non-Unity tools ignored");

    // The listener passes the tool decision through unchanged.
    const decision = await state.toolHandler({ name: "mcp__unity__menu_item" }, { isError: true, content: [{ type: "text", text: "MCP error -32602" }] }, settled);
    assert.equal(decision.kind, "accept", "decision passes through");
    assert.equal(entry.lastError, "menu_item failed: MCP error -32602", "a validation failure surfaces too");
    assert.equal(entry.unityMissing, false, "a validation failure is not the known error");
}

// ── a persisted selection wins over the row config ──────────────────────────
{
    const state = stub({
        env: {},
        user: { relayPath: "/persisted/relay_linux", extraFlags: ["--name=Game"] },
        settings: { document: { "unity-mcp": { relayPath: "/persisted/relay_linux", extraFlags: ["--name=Game"] } } }
    });
    apply(state.ctx, config);
    const entry = state.entry;
    assert.equal(entry.effectiveRelayPath, "/persisted/relay_linux", "the persisted selection reaches the first spawn");
    assert.equal(entry.effectiveSource, "selected", "and is reported as the selection");
    assert.deepEqual(state.bridges[0].args, ["--mcp", "--name=Game"], "the persisted flags launch the first connection");
    assert.equal(entry.wslWindowsExecutable, false, "a Linux relay under plain Linux is not the flagged state");
}

// ── a Windows relay selected on a WSL host is stated, not blocked ───────────
{
    const state = stub({
        env: { WSL_DISTRO_NAME: "Ubuntu" },
        user: { relayPath: "/mnt/c/Users/nope/.unity/relay/relay_win.exe" },
        settings: { document: { "unity-mcp": { relayPath: "/mnt/c/Users/nope/.unity/relay/relay_win.exe" } } }
    });
    apply(state.ctx, config);
    const entry = state.entry;
    assert.equal(entry.effectiveRelayPath, "/mnt/c/Users/nope/.unity/relay/relay_win.exe", "the interop-spelled relay is what runs");
    assert.equal(entry.wslWindowsExecutable, true, "the state the card's notice speaks to");
    const joined = state.logs.flat().map((arg) => String(arg)).join(" ");
    assert.match(joined, /Windows spelling/u, "and it is announced once in the log");
}

// ── a hot flags edit restarts the connection in place ───────────────────────
{
    const state = stub({ env: {} });
    apply(state.ctx, config);
    const entry = state.entry;
    entry.extraFlags = ["--log-level=debug", "--debug"];
    state.hooks.onChange();
    // The switch is chained onto the fiber's readiness, so it lands one
    // microtask turn after the commit is routed.
    await tick(5);
    assert.equal(state.updates.length, 1, "one bridge update after a flags change");
    assert.deepEqual(state.updates[0].args, ["--mcp", "--log-level=debug", "--debug"], "the new argv carries the added flag");
    assert.equal(entry.executableDiscoveryRevision, 1, "a flags change does not re-run discovery");
}

// ── the stderr toggle re-spawns with/without the wrapper ────────────────────
{
    const state = stub({ env: {}, user: { relayPath: "/no/such/relay_linux" } });
    apply(state.ctx, config);
    const entry = state.entry;
    await tick(10);

    // The first switch: "log" wraps the spawn in the stderr redirecting script.
    const beforeLog = state.updates.length;
    entry.stderrMode = "log";
    state.hooks.onChange();
    await tick(5);
    assert.equal(state.updates.length, beforeLog + 1, "the toggle restarts the bridge connection");
    const logSpawn = state.updates[state.updates.length - 1];
    // `sh -c <script> unity-ai-relay <relay> <log> --mcp [flags]`: the logical
    // invocation survives inside the wrapper's argv tail.
    assert.equal(logSpawn.command, "/bin/sh", "log mode spawns the POSIX wrapper");
    assert.equal(logSpawn.args[2], "unity-ai-relay", "the wrapper names the bridge for the failure message");
    assert.equal(logSpawn.args[3], "/no/such/relay_linux", "the wrapper execs the selected relay");
    assert.deepEqual(logSpawn.args.slice(-2), ["--mcp", "--log-level=debug"], "the logical invocation is preserved");

    // The way back: the raw spawn, stderr inherited by the console.
    const beforeConsole = state.updates.length;
    entry.stderrMode = "console";
    state.hooks.onChange();
    await tick(5);
    assert.equal(state.updates.length, beforeConsole + 1, "switching back restarts again");
    const consoleSpawn = state.updates[state.updates.length - 1];
    assert.equal(consoleSpawn.command, "/no/such/relay_linux", "console mode spawns the relay directly");
    assert.deepEqual(consoleSpawn.args, ["--mcp", "--log-level=debug"], "and hands it the logical invocation");
}

// ── **Search executables** re-runs discovery exactly once ───────────────────
{
    const state = stub({ env: {} });
    apply(state.ctx, config);
    const entry = state.entry;
    await tick(20);
    const revisionBefore = entry.executableDiscoveryRevision;
    entry.lastError = "Unity relay executable not found: /nope/relay_linux";
    entry.unityMissing = true;
    entry.refreshExecutablesNonce = Date.now();
    state.hooks.onChange();
    await tick(60);
    assert.equal(entry.executableDiscoveryRevision, revisionBefore + 1, "one run per search request");
    assert.equal(state.bridges.length, 1, "a search run does not re-mount the bridge");
    // A run that finds nothing keeps the card in the known missing state — the
    // absence is what was discovered, so the answer is always the same story.
    assert.match(entry.lastError, /Unity relay executable not found/u, "an empty run reports the known error");
    assert.equal(entry.unityMissing, true, "and the known-error flag stays set");
}

// ── the UI write gate rejects what must never reach the bridge ──────────────
{
    const state = stub({ env: {} });
    apply(state.ctx, config);
    const entry = state.entry;
    assert.throws(() => state.hooks.validate({ ...entry, extraFlags: ["--mcp"] }), /sets the relay mode/u, "the mode flag is rejected at the write gate");
    assert.throws(() => state.hooks.validate({ ...entry, extraFlags: ["--a\n--b"] }), /control characters/u, "a control character is rejected");
    assert.throws(() => state.hooks.validate({ ...entry, stderrMode: "verbose" }), /stderrMode/u, "an unknown stderr mode is rejected");
    assert.throws(() => state.hooks.validate({ ...entry, relayPath: "/ok/relay_linux\nrm -rf" }), /control characters/u, "a control character in a path is rejected");
    assert.throws(
        () => state.hooks.validate({ ...entry, executables: [{ id: "/ok/relay_linux\n", name: "" }] }),
        /control characters/u,
        "a control character in a row id is rejected"
    );
    assert.equal(state.hooks.validate({ ...entry, extraFlags: ["--name=Game"], relayPath: "/home/u/.unity/relay/relay_linux" }), undefined, "an ordinary write passes the gate");
}

console.log("test/apply.test.mjs: all assertions passed");
