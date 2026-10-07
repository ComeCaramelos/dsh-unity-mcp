# AGENTS.md

DSH Unity MCP plugin for DeepSeek Harness (DSH). Bridges the **Unity MCP**
server — the `unity-ai-relay` executable the Unity AI Assistant package
(`com.unity.ai.assistant`) installs into `<home>/.unity/relay/<binary>`, launched
as `<relay> --mcp [extraFlags]` — through the nested
`@deepseek-ai/dsh-mcp-client` stdio bridge, plus a Web GUI settings/status card.

## Layout

Two planes, each one entry file stating its surface with the behavior behind it
in dedicated modules — the same shape as the sibling plugins
`dsh-docker-desktop-mcp` and `dsh-chrome-mcp`.

- `src/index.ts` — host half **public surface** (TS, `tsconfig.json`,
  `module: NodeNext`). `npm run build` emits `lib/index.js` (ESM, `main`, plus
  `.d.ts`/maps): identity (`name`, `inject`), the zod `Config`/`SettingsSchema`,
  `apply(ctx, config)`, and the diagnostics/test-facing helpers re-exported from
  `src/host/*`.
- `src/host/*` — host behavior:
  - `apply.ts` — wiring only: controller + settings section.
  - `controller/` — live state. `controller.ts` is the assembly and the only
    place the base layer is built (`createUnityMcpController`,
    `UnityMcpController`, `UnityMcpControllerDeps`); `state.ts` names the shared
    state + context; `notes.ts` the base-layer announcements (selection, stderr,
    the WSL notice); `bridge-run.ts` the bridge switches (config build, restart,
    flags, stderr mode); `runs.ts` the executable run + its serialization;
    `persist.ts` the settings writes a run makes (seed, rows); `captures.ts` the
    bridge-log + tool-result captures; `commits.ts` the settings-commit routing.
    `index.ts` re-exports the public pieces.
  - `settings.ts` — the `unity-mcp` namespace install, the UI write gate
    (flags/stderr/executable/rows validation) and commit routing into the
    controller.
  - `bridge.ts` — the stdio argv (`--mcp` + the flags), the `sh -c` stderr-capture
    spawn wrapper, the bridge config, the log-sink path and the logger wrapper
    that captures the bridge's own lines.
  - `catalog.ts` — the saved-executable rows (`{ id: path, name: label }`): id
    rules, normalize, merge-by-id, label.
  - `discovery/` — `candidates.ts` (the per-platform locations, the Windows
    profile walk a WSL host does, the ordered candidate list), `probe.ts`
    (the bounded `<relay> --version` probe, presence + identity), `scan.ts`
    (the scan, `discoverUnity`, `checkUnity`), re-exported by `index.ts`.
  - `flags.ts` — flags validation + the mode-flag helpers.
  - `platform.ts` — the pure predicates: is this host WSL, is this path a Windows
    binary.
  - `values.ts` — precedence resolution + persisted reads. `status.ts` — error
    classification + the tool-result note. `schema.ts` — the two zod schemas.
    `constants.ts` — identifiers, budgets, patterns. `types/` — the shared types.
- `src/client/*` — the browser half, bundled by esbuild into `lib/client.js`
  (`dsh.client.platform: web`). `apply.ts` is the entry: inject the stylesheet,
  register the locales, bind the `unity-mcp` scope behind the controller, mount
  the card into `settings.plugin.item`.
  - `controller/` — the store, the snapshot projection and the actions the card
    calls (`controller.ts`, `snapshot.ts`, `read.ts`, `budget.ts`).
  - `card/` — the widget. `index.ts` only composes the body; `view.ts` says what
    one served snapshot means; `run-actions.ts` owns the imperative run and its
    busy/dialog/clock state; `picker.ts`, `flags.ts`, `toggle.ts`, `dialog.ts`,
    `rows.ts` render the blocks; `icons.ts` carries the icon paths.
  - `catalog.ts`, `plugin-meta.ts`, `styles/`, `locales/`, `shell-modules.d.ts`.

The client's stylesheet is compiled by `scripts/build-client.mjs` into a scoped
CSS-modules map (`hash_local`; the digest lives in `scripts/scoped-name.mjs`);
`lib/client.js` is loaded through
`window.__ModuleLoader__.load` in a CJS wrapper.

## Hard constraints (do not break)

- **The `--mcp` mode flag is the bridge's.** It is always prepended to the argv
  and never belongs in `extraFlags` — the UI write gate rejects it, and
  `buildServerArgs` folds one out of a row-config list so it is never duplicated.
  A relay launched without it starts as a plain relay server and registers
  nothing.
- **No auto mode.** The saved rows are what can be picked; what was picked stays
  picked; a picked path that later breaks is reported broken, never silently
  re-resolved. `discoverUnity` seeds a **never-configured** host exactly once,
  through the same persisted `relayPath` field.
- **Read the live settings value at commit time** through `state.source()`, never
  a captured value: cordis starts the `settings` injection callback after
  `apply()` returns, so a captured value pins every consumer to the row config.
- **Every base-layer mutation lives in `src/host/controller/*`.** Settings
  commits route *in*, never out.
- **A module plugin has no host→client push channel.** Status travels in the
  served composition base layer, and the one action the card drives travels as
  the persisted `refreshExecutablesNonce` trigger, waited on through the shared
  describe mirror until `executableDiscoveryRevision` advances.
- **The bridge restarts through `fiber.update()`, chained on the fiber's own
  readiness** (`Promise.resolve(fiber).then(...)`): a fiber restarts only from
  `ACTIVE`, so an update issued while the first connection loads would otherwise
  be stored and silently dropped.
- **Windows relays under WSL are supported, not blocked.** A
  `<relay> --version` probe is side-effect free on both a Linux relay and a
  Windows relay reached through the interop mount, so `blockedForPlatform` is a
  seam that answers `""` for every candidate and no candidate is ever excluded.
  The WSL state is reported (`wslWindowsExecutable`) and announced once in the
  log; it is not an error and not a mode switch.
- **Nothing reaches argv through a shell string.** Flags are execve'd as argv
  entries; validation rejects control characters, and the stderr wrapper passes
  the logical argv positionally through `sh -c`.
- **One plugin instance per host**: the settings namespace (`unity-mcp`) is fixed.
  Tool names are `mcp__<serverName>__<tool>`; the captures key off that prefix.

## Client-bundle gotchas (imported from the reference, still true)

- The bundle is loaded in a CJS wrapper by `window.__ModuleLoader__`; it may be
  re-materialized, so the stylesheet injection is keyed by the plugin id and is
  never called from a module body.
- `Menu`/`Switch` arrive from `@deepseek-ai/dsh-client-ui-primitives`; the rest
  of the primitives must not be reached for by name.
- The controller keeps its state in a store created through
  `@deepseek-ai/dsh-client-store`; never `useState` for served state.
- `t()` keys are the only user-visible copy; nothing renders a literal string.
- **Only theme-published custom properties.** The stylesheet may read nothing
  but `--dsw-alias-*` names `@deepseek-ai/dsh-client-ui-theme` publishes: a name
  the theme does not define drops the whole declaration at computed-value time
  and the property silently falls back to `inherit` (the inherited reference
  sheet had exactly one invented name, in the footer error line).
  `test/styles.test.mjs` pins the allowed set; read the token there, never guess.
- **The class scope must be able to lead a selector.** `scopedName` prefixes every
  emitted class name, and a leading digit makes the scoped selectors (`1otoya_card`)
  *invalid* CSS, which drops every rule they carry silently — the build stays clean,
  the DOM classes stay right, and only the whole card's look vanishes. A base-36
  digest lands on a digit about a third of the time, so the digest maps its first
  character onto a letter; `test/styles.test.mjs` pins the shape.
- Every hook runs *before* the `if (!state.available) return null` early exit, so
  an unavailable namespace must not change the hook count.

## Testing conventions

Every suite is a plain `node:assert` script under `test/`, run through
`npm test` (which builds first, since the tests import `lib/`).

- `test/parse.test.mjs` — host pure functions: flags/mode-flag rules, the argv
  builder, candidate lists + the Windows profile walk, rows normalization/merge,
  persisted reads, the platform predicates, status classification.
- `test/bridge-stderr.test.mjs` — the stderr modes, the wrapper's argv shape, the
  private log directory, plus a real `sh` spawn that proves stdout stays the
  protocol stream.
- `test/discovery.test.mjs` — the scan/run against generated stub executables.
- `test/apply.test.mjs` — `apply(ctx, config)` against a stubbed ctx: bridge
  mount, base-layer projection, the tool capture, hot flag/stderr switches, the
  executable run, and the UI write gate.
- `test/client.test.mjs` — materializes `lib/client.js` against a stubbed
  `window.__ModuleLoader__` and exercises registration, the stylesheet, the
  locale dictionary, the render tree, the picker/rows/flags writes, the dialog,
  the toggle and the staged form.
- `test/styles.test.mjs` — the stylesheet surface: every custom property the card
  reads must be one the theme publishes (see the gotcha above).

Determinism rule: no test may consult the machine running the suite. The launch
environment is stubbed through `ctx.get("launchEnvironment")` (an empty map
answers "plain Linux"), candidate lists point at paths that cannot exist, and
`windowsProfileRelayPaths` takes its `exists`/`root` from the test.

## Install / dev notes

```sh
npm install
npm run build     # tsc (host) + tsc/esbuild (client) → lib/index.js, lib/client.js
npm test
```

- `assets/` holds the card icon referenced by the bundle metadata.
- `cordis.patch.yml` is the bundle patch that inserts the plugin row (the row
  `config` is the plugin's `Config`).
- `.githooks/post-checkout` stamps `package.json`'s version on a
  `release/X.Y.Z` branch — see `CONTRIBUTING.md`.
