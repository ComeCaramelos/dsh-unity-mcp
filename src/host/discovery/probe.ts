/**
 * Relay discovery — the low-level `--version` probe and the on-disk/identity
 * helpers it rides on.
 *
 * The one place discovery reaches outside the process: `<relay> --version` run
 * through a scrubbed parent env under a bounded timeout, the rule that says
 * whether a path is worth spawning at all (a directory, socket or fifo never
 * reaches a probe — a host with no relay installed runs one scan that launches
 * nothing), and the identity key that folds two spellings of the same binary
 * into one answer. The scan that drives them lives in ./scan.ts.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";

import { CHECK_TIMEOUT_MS, RELAY_VERSION_PATTERN } from "../constants.js";
import { firstLine } from "../status.js";

/**
 * Spawn one `<relay> --version` probe (scrubbed parent env, bounded timeout).
 * The relay answers with three lines — its title, `Name: unity-ai-relay`,
 * `Version: <build>` — so the version is the `Version:` line when the output
 * carries one and the first non-empty line when it does not; a probe that
 * answers nothing rejects, because silence is never an answer.
 */
export function probeExecutable(target: string): Promise<string> {
    return new Promise((resolve, reject) => {
        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(target, ["--version"], {
                env: scrubbedParentEnv(),
                stdio: ["ignore", "pipe", "pipe"],
                timeout: CHECK_TIMEOUT_MS,
                killSignal: "SIGKILL"
            });
        } catch (error) {
            reject(new Error(`could not run "${target} --version": ${String(error)}`));
            return;
        }
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk: Uint8Array) => (stdout += chunk));
        child.stderr?.on("data", (chunk: Uint8Array) => (stderr += chunk));
        child.on("error", (error: NodeJS.ErrnoException) => {
            const code = error && typeof error.code === "string" ? error.code : "";
            if (code === "ENOENT") {
                const missing = new Error(`Unity relay executable not found: ${target}`);
                Object.defineProperty(missing, "code", { value: "ENOENT", writable: true, enumerable: false, configurable: true });
                reject(missing);
                return;
            }
            reject(new Error(`could not run "${target} --version": ${String(error)}`));
        });
        child.on("close", (code: number | null) => {
            if (code === null) {
                reject(new Error(`"${target} --version" timed out after ${String(CHECK_TIMEOUT_MS)}ms`));
                return;
            }
            if (code !== 0) {
                const detail =
                    firstLine(stderr) !== "" ? firstLine(stderr) : firstLine(stdout) !== "" ? firstLine(stdout) : `exit code ${String(code)}`;
                reject(new Error(`"${target} --version" failed: ${detail}`));
                return;
            }
            const version = pickVersion(stdout);
            if (version === "") {
                reject(new Error(`"${target} --version" answered no version`));
                return;
            }
            resolve(version);
        });
    });
}

/**
 * The version half of a `--version` answer: the `Version:` line the relay prints,
 * falling back to the first non-empty line for anything else the probe might
 * have run against (a wrapper that prints its own version banner).
 */
export function pickVersion(output: unknown): string {
    for (const line of String(output ?? "").split(/\r?\n/u)) {
        const match = RELAY_VERSION_PATTERN.exec(line.trim());
        if (match !== null && match[1] !== undefined) return match[1].trim();
    }
    return firstLine(output);
}

/** True when a candidate path can be handed to the OS for a `--version` probe.
 * A path that is absent (or not executable) never reaches the spawn: a relay-less
 * host runs one scan without launching anything. Paths with no directory
 * separator go straight to the spawn so the OS resolves them through `PATH`. */
export function presentOnDisk(candidate: string): boolean {
    if (!candidate.includes("/") && !candidate.includes("\\")) return true;
    try {
        // A directory (or a socket, or a fifo) is not an executable, and
        // spawning one to find out is a side effect we do not want.
        if (!statSync(candidate).isFile()) return false;
        accessSync(candidate, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/** Identity key used to fold two spellings of the same binary (`relay_linux`
 * resolving onto `/home/roberto/.unity/relay/relay_linux`) into one option.
 * Falls back to the path itself when `realpath` cannot resolve it. */
export function identity(candidate: string): string {
    try {
        return realpathSync(candidate);
    } catch {
        return candidate;
    }
}
