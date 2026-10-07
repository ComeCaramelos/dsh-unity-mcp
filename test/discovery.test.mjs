// Discovery tests against real executables: the candidate list is what the run
// probes, the scan keeps the answer each one gives (and drops what is not on
// disk), the version is the `Version:` line the relay prints, and a run finds
// the first runnable entry. Everything here runs against generated stub
// executables, never a real relay, so it answers the same way everywhere.
// Run: node test/discovery.test.mjs (needs `npm run build` first).
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
    checkUnity,
    discoverUnity,
    relayCandidates,
    scanUnityExecutables
} from "../lib/index.js";

const root = mkdtempSync(path.join(tmpdir(), "dsh-unity-mcp-discovery-"));
process.on("exit", () => rmSync(root, { recursive: true, force: true }));

/** One stub relay: answers `--version` with what the real relay answers with. */
function relay(name, { version = "1.0.12-build.99", title = "Unity AI Relay Server", missing = false, failing = "" } = {}) {
    const target = path.join(root, name);
    // `missing: true` creates nothing: the candidate points at a path that is
    // simply not there.
    if (missing !== true) {
        const body = failing !== ""
            ? `#!/bin/sh\nprintf '${failing}\\n' >&2\nexit 3\n`
            : `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '${title}\\n'; printf 'Name: unity-ai-relay\\n'; printf 'Version: ${version}\\n'; exit 0; fi\nexit 0\n`;
        writeFileSync(target, body);
        chmodSync(target, 0o755);
    }
    return target;
}

const good = relay("relay_linux");
const other = relay("relay_other", { version: "0.9.0" });
const broken = relay("relay_broken", { failing: "could not load the relay configuration" });
const missingPath = relay("relay_missing_linux", { missing: true });

// ── the scan reports what it found, and drops what is not there ────────────
{
    const statuses = await scanUnityExecutables([good, other, missingPath]);
    assert.equal(statuses.length, 2, "an absent candidate drops out of the answer");
    assert.equal(statuses[0].path, good, "the answer keeps the candidate's own spelling");
    assert.equal(statuses[0].version, "1.0.12-build.99", "the version is the Version: line, not the banner");
    assert.equal(statuses[0].error, "", "a runnable entry carries no error");
    assert.deepEqual(
        statuses.map((status) => status.version),
        ["1.0.12-build.99", "0.9.0"],
        "the answers come back in candidate order"
    );
}

// ── one executable run answers the first runnable entry ────────────────────
{
    assert.equal(await discoverUnity([good, other]), "1.0.12-build.99", "the first runnable candidate answers");
    assert.equal(await discoverUnity([other, good]), "0.9.0", "and it is the first one, not the best one");
    const failed = await discoverUnity([broken]).catch((error) => error.message);
    assert.match(failed, /could not load the relay configuration/u, "an executable that answers non-zero reports its own failure");
    const absent = await discoverUnity([missingPath]).catch((error) => error.message);
    assert.match(absent, /Unity relay executable not found/u, "nothing runnable is the known error");
    assert.equal(await discoverUnity([]), "", "a run with no candidates answers nothing");
}

// ── checkUnity: the fixed-path and the scan shapes ─────────────────────────
{
    assert.equal(await checkUnity({ relayPath: good, relayPaths: [] }), "1.0.12-build.99", "a fixed path answers its version");
    const missing = await checkUnity({ relayPath: missingPath, relayPaths: [] }).catch((error) => error.message);
    assert.match(missing, /Unity relay executable not found: /u, "a fixed path that is gone reports the path");
    assert.equal(await checkUnity({ relayPath: "", relayPaths: [broken] }).catch(() => ""), "", "a broken fixed candidate is not health");
    assert.equal(await checkUnity({ relayPath: "", relayPaths: [] }), "", "no candidates is no evidence");
    // Nothing is ever blocked for the platform: a blocked answer is the only
    // way a candidate is skipped, and the Unity path never supplies one.
    assert.equal(await checkUnity({ relayPath: good, relayPaths: [] }, [], () => "blocked"), "", "a blocked answer skips the probe");
}

// ── the candidate list is what the run probes ──────────────────────────────
{
    const home = path.join(root, "home");
    mkdirSync(home, { recursive: true });
    mkdirSync(path.join(home, ".unity", "relay"), { recursive: true });
    const rowConfig = { relayPaths: ["~/.unity/relay/relay_linux", "relay_linux"] };
    const list = relayCandidates(rowConfig, ["/saved/relay_linux"], "/selected/relay_linux", { wslHost: false, home });
    assert.deepEqual(
        list,
        [path.join(home, ".unity/relay", "relay_linux"), "relay_linux", "/saved/relay_linux", "/selected/relay_linux"],
        "row config first, then the saved rows, then the selection"
    );
    // The current selection is always in the list, even when it is not a row,
    // and every home marker resolves before the list reaches the probe.
    const only = relayCandidates({ relayPaths: [] }, [], "/picked/relay_linux", { wslHost: false, home });
    assert.ok(only.includes("/picked/relay_linux"), "the selection is in the list even without a row");
    assert.equal(new Set(only).size, only.length, "no path is ever listed twice");
    assert.equal(only.includes("~/.unity/relay/relay_linux"), false, "a home marker resolves before anything is probed");
    assert.equal(only.filter((candidate) => candidate !== "").length, only.length, "no empty candidate reaches the probe");
    assert.deepEqual(
        relayCandidates({ relayPaths: ["/a/relay_linux"] }, ["/a/relay_linux"], "/a/relay_linux", { wslHost: false, home }),
        ["/a/relay_linux"],
        "the same path is never listed twice"
    );
}

console.log("test/discovery.test.mjs: all assertions passed");
