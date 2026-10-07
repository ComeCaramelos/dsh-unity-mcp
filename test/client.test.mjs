// Materializes lib/client.js in a stubbed browser environment (the same
// window.__ModuleLoader__.load contract the shell's module system uses) and
// exercises the card: registration, snapshot projection, render tree, the flags
// editor write path, the saved-executable picker (the pill, the rows and the
// search action) and the poll that waits on the host's executable run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

// ── stubs ────────────────────────────────────────────────────────────────
let registration = null;
const window = { __ModuleLoader__: { load: (reg) => (registration = reg) } };
const styles = [];
const document = {
    querySelector: () => null,
    createElement: (tag) => ({ tag, dataset: {}, textContent: "", setAttribute() {} }),
    head: { appendChild: (el) => styles.push(el) }
};
// Stateful useState: the card keeps `open`/`menuOpen` across re-renders, so the
// stub must persist hook values by call slot. Renders reset the slot index.
let hookStates = [];
let hookIndex = 0;
let lastHookCount = null;
const react = {
    useId: () => ":r1:",
    useState: (init) => {
        const i = hookIndex++;
        if (!(i in hookStates)) hookStates[i] = typeof init === "function" ? init() : init;
        const set = (next) => {
            hookStates[i] = typeof next === "function" ? next(hookStates[i]) : next;
        };
        return [hookStates[i], set];
    },
    useRef: (init) => {
        const refs = (react.useRef._refs ??= []);
        const i = (react.useRef._index = (react.useRef._index ?? 0) + 1) - 1;
        if (!(i in refs)) refs[i] = { current: init };
        return refs[i];
    },
    useEffect: () => {}
};
function materialize(type, props, key, kind) {
    return { kind, type, props, key, children: props?.children };
}
const jsxRuntime = {
    jsx: (type, props, key) => materialize(type, props, key, "jsx"),
    jsxs: (type, props, key) => materialize(type, props, key, "jsxs")
};

const storeState = {
    available: false,
    writable: false,
    extraFlags: [],
    lastError: "",
    unityMissing: false,
    executableDiscoveryRevision: 0,
    relayVersion: "",
    executables: [],
    executableStatus: [],
    relayPath: "",
    effectiveRelayPath: "",
    effectiveSource: "",
    stderrMode: "",
    rowStderr: "log",
    defaultExtraFlags: [],
    wslWindowsExecutable: false,
    actionError: "",
    dirty: false,
    saving: false,
    failed: false
};
const listeners = new Set();
const clientStore = {
    createSnapshotStore: (initial) => ({
        getSnapshot: () => storeState,
        subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
        set: (next) => Object.assign(storeState, next)
    })
};
/** The card's shell primitives, stubbed here: the dropdown list, its selection
 * tick and the keyboard handling belong to them, so the assertions only ever
 * see `props` (what was handed in) plus the rendered nodes they produce. */
const menuProps = [];
const primitives = {
    Menu: (props) => {
        menuProps.push(props);
        return props.anchor;
    },
    Switch: (props) => ({ kind: "jsx", type: "Switch", props, children: undefined })
};
const requireStub = (spec) => {
    if (spec === "react") return react;
    if (spec === "react/jsx-runtime") return jsxRuntime;
    if (spec === "@deepseek-ai/dsh-client-store") return clientStore;
    if (spec === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
    throw new Error(`unexpected require: ${spec}`);
};

vm.runInNewContext(bundle, {
    window,
    document,
    require: undefined,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {}
});
assert.ok(registration, "bundle registered with __ModuleLoader__");
assert.equal(registration.id, "@comecaramelos/dsh-unity-mcp", "bundle id is the package name");
const factoryResult = registration.factory(requireStub);
assert.equal(typeof factoryResult.apply, "function", "exports.apply");
assert.equal(JSON.stringify(factoryResult.inject), JSON.stringify(["slots", "locale", "settingsScope"]), "exports.inject");

// ── settings scope stub ──────────────────────────────────────────────────
const scopeSnapshot = {
    status: "ready",
    value: {
        extraFlags: [],
        refreshExecutablesNonce: 0,
        relayPath: "",
        executables: [],
        stderrMode: "",
        lastError: "",
        executableDiscoveryRevision: 0,
        relayVersion: "",
        executableStatus: [],
        effectiveRelayPath: "",
        effectiveSource: ""
    },
    writable: true,
    revision: 1
};
const writes = [];
const scope = {
    getSnapshot: () => scopeSnapshot,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    set: (field, value) => {
        writes.push([field, value]);
        scopeSnapshot.value = { ...scopeSnapshot.value, [field]: value };
        listeners.forEach((fn) => fn());
        return Promise.resolve();
    }
};
const mirror = { loadCalls: 0, load: () => (mirror.loadCalls += 1, Promise.resolve()) };

const registeredSlotEntries = [];
const localeRegistrations = [];
const ctx = {
    effect: (fn) => {
        const disposer = fn();
        return { dispose: () => (disposer?.dispose?.() ?? disposer?.()) };
    },
    locale: {
        register: (ns, dicts) => {
            localeRegistrations.push([ns, dicts]);
        }
    },
    settingsScope: {
        bind: (spec) => (assert.equal(spec.namespace, "unity-mcp"), scope),
        describe: () => mirror
    },
    slots: {
        inject: (slot, registerFn) => {
            assert.equal(slot, "settings.plugin.item", "the card mounts into the plugin-configuration slot");
            registerFn();
        },
        register: (options, Component) => {
            registeredSlotEntries.push([options, Component]);
            return () => {};
        }
    }
};
factoryResult.apply(ctx);

// ── stylesheet + registration ────────────────────────────────────────────
assert.equal(styles.length, 1, "one style tag injected");
assert.equal(styles[0].dataset.pluginCss, "@comecaramelos/dsh-unity-mcp/UnityMcpCard.module.css", "the card's stylesheet is scoped to its package");
const PREFIX = styles[0].textContent.match(/\.([a-z0-9]{6})_/)[1];
const CLS = (local) => PREFIX + "_" + local;

assert.equal(registeredSlotEntries.length, 1, "one settings.plugin.item entry");
const [slotOptions, Component] = registeredSlotEntries[0];
assert.equal(slotOptions.name, "settings.plugin.item");
assert.equal(slotOptions.key, "unity-mcp", "the card is keyed by the host's namespace");
assert.equal(slotOptions.locale, "unityMcp", "and by the client's locale namespace");
assert.equal(typeof Component, "function");

// ── locale dictionary ────────────────────────────────────────────────────
{
    const [ns, dicts] = localeRegistrations[0];
    assert.equal(ns, "unityMcp", "copy registers under the client namespace");
    const required = [
        "title", "description", "executableLabel", "executableHint", "executableNone", "executableRows",
        "executableIdLabel", "executableIdPlaceholder", "executableNameLabel", "namePlaceholder",
        "addExecutable", "removeExecutable", "fetchExecutables", "fetching", "executableEmpty",
        "unavailableSuffix", "dialogExecutablesTitle", "dialogExecutablesDescription", "dialogEmpty",
        "searchExecutables", "selectAll", "addSelected", "candidateSaved", "close", "cancel",
        "flagsTitle", "flagsHint", "flagsEmpty", "flagsRows", "flagsValueLabel", "flagsValuePlaceholder",
        "addFlag", "removeFlag", "flagsRestore", "flagsRestoreTitle",
        "reduceLabel", "reduceTitle", "reduceHint", "docsMessage", "docsLinkLabel",
        "versionLabel", "probing", "probeJustNow", "probeSecondsAgo", "probeMinutesAgo", "probeHoursAgo",
        "wslWindowsTitle", "wslWindowsNote",
        "statusError", "statusOk", "unityMissing", "readOnly", "expand", "collapse",
        "apply", "discard", "saving", "unsaved", "saveFailed"
    ];
    for (const key of required) assert.ok(key in dicts.en, "en has key: " + key);
    assert.equal(required.length, Object.keys(dicts.en).length, "the dictionary holds exactly the card's keys — no orphan copy");
    // Nothing Chrome-shaped survived the port: the Unity card has no Windows
    // prelaunch run and no connect mode.
    for (const key of Object.keys(dicts.en)) {
        assert.equal(/[Cc]hrome/.test(key), false, "no locale key names Chrome: " + key);
    }
}

// ── render helpers ────────────────────────────────────────────────────────
function render(state) {
    hookIndex = 0;
    var hookCount = 0;
    var _useState = react.useState;
    var _useEffect = react.useEffect;
    var _useId = react.useId;
    react.useState = function (init) { ++hookCount; return _useState.call(this, init); };
    react.useEffect = function () { ++hookCount; return _useEffect.call(this); };
    react.useId = function () { ++hookCount; return _useId.call(this); };
    var result = Component({
        t: (k) => k,
        useUnityMcpCard: (sel) => sel(state),
        saveFlags: (v) => scope.set("extraFlags", v),
        toggleStderr: () => {
            var cur = typeof state.stderrMode === "string" && state.stderrMode !== "" ? state.stderrMode : (state.rowStderr === "console" ? "console" : "log");
            return scope.set("stderrMode", cur === "log" ? "console" : "log");
        },
        // Stands in for the controller's executable actions: what the card calls
        // is what the controller writes.
        selectExecutable: (id) => scope.set("relayPath", id),
        saveExecutables: (entries) => scope.set("executables", entries),
        refreshExecutables: () => {
            const found = (state.executableStatus ?? []).slice();
            scope.set("refreshExecutablesNonce", 999);
            return Promise.resolve(found);
        },
        addExecutables: (ids) => scope.set("executables", (state.executables ?? []).concat(ids.map((id) => ({ id, name: "" })))),
        apply: () => Promise.resolve(),
        discard: () => {},
        refresh: () => Promise.resolve()
    });
    react.useState = _useState;
    react.useEffect = _useEffect;
    react.useId = _useId;
    if (lastHookCount !== null) assert.equal(hookCount, lastHookCount, "hook count stable across renders");
    lastHookCount = hookCount;
    expand(result);
    return result;
}
function serve(fields) {
    Object.assign(storeState, fields);
    Object.assign(scopeSnapshot.value, fields);
    return storeState;
}
function expand(node) {
    if (node === null || node === undefined || typeof node !== "object") return;
    if (Array.isArray(node)) {
        node.forEach(expand);
        return;
    }
    if (typeof node.type === "function") {
        const out = node.type(node.props);
        node.children = out;
        expand(out);
        return;
    }
    if (node.children !== undefined) expand(node.children);
}
function walk(node, found = []) {
    if (node === null || node === undefined || typeof node !== "object") return found;
    if (Array.isArray(node)) {
        node.forEach((child) => walk(child, found));
        return found;
    }
    if (node.type !== undefined) {
        found.push(node);
        if (node.children !== undefined) walk(node.children, found);
    }
    return found;
}
const isNode = (type, className) => (n) => n.type === type && n.props?.className === className;
const isLabel = (label) => (n) => n.type === "button" && n.props?.children === label;
const resultLine = (t) => walk(t).find((n) => n.type === "p" && n.props?.className === CLS("result"));
const findPill = (t) => walk(t).find(isNode("button", CLS("selector")));
const rowBoxes = (t) => walk(t).filter((n) => n.type === "div" && n.props?.className === CLS("catalogRow"));
const rowInputs = (t) => walk(t).filter(isNode("input", CLS("catalogInput")));
const flagBoxes = (t) =>
    walk(t).filter((n) => n.type === "div" && n.props?.className === CLS("catalogRow") + " " + CLS("catalogRowSingle"));
const flagFields = (t) =>
    walk(t).filter((n) => n.type === "input" && typeof n.props?.className === "string" && n.props.className.includes(CLS("catalogInputMono")));
const flagTrashes = (t) => walk(t).filter((n) => n.type === "button" && n.props?.title === "removeFlag");
const findTrash = (t) =>
    walk(t).find((n) => n.type === "button" && typeof n.props?.className === "string" && n.props.className.includes(CLS("iconButton")));
const notice = (t) => walk(t).find(isNode("div", CLS("notice")));
function findDot(t) {
    return walk(t).find((n) => n.type === "span" && String(n.props?.className ?? "").startsWith(CLS("dot") + " "));
}

// ── render 1: nothing served ─────────────────────────────────────────────
Object.assign(storeState, { available: false });
assert.equal(render(storeState), null, "renders nothing while the namespace is unavailable");

// ── render 2: collapsed by default ───────────────────────────────────────
Object.assign(storeState, {
    available: true,
    writable: true,
    extraFlags: [],
    lastError: "",
    actionError: "",
    relayVersion: "",
    executableDiscoveryRevision: 0
});
let tree = render(storeState);
assert.ok(tree && tree.type === "li", "card root is an li");
assert.equal(tree.props.className, CLS("card"), "no cardOpen class while collapsed");
let header = walk(tree).find(isNode("button", CLS("header")));
assert.ok(header, "header disclosure button rendered");
assert.equal(header.props["aria-expanded"], false, "card collapsed by default");
assert.equal(header.props["aria-label"], "expand: title", "header aria-label names the action and the card");
assert.equal(walk(tree).find(isNode("div", CLS("body"))), undefined, "no body while collapsed");

header.props.onClick();
tree = render(storeState);
assert.ok(String(tree.props.className).includes(CLS("cardOpen")), "cardOpen class while expanded");
assert.ok(walk(tree).some((n) => n.props?.className === CLS("body")), "the body renders once expanded");
const nodes = walk(tree);

// The configuration-guide link rides beside the flags title.
const link = nodes.find(isNode("a", CLS("docsLink")));
assert.ok(link, "documentation link rendered once expanded");
assert.equal(link.props.target, "_blank", "the guide opens in a new tab");
assert.match(link.props.href, /^https:\/\//u, "and points at a real URL");

// Extra flags: one row per saved flag, nothing free-form.
assert.ok(
    walk(tree).find((n) => n.type === "span" && n.props?.className === CLS("fieldTitle") && n.props.children === "flagsTitle"),
    "flags field title rendered"
);
assert.equal(
    walk(tree).filter((n) => n.type === "details" && n.props?.className === CLS("disclosure")).length,
    2,
    "both row lists — the saved executables and the extra flags — live behind a disclosure"
);
assert.equal(walk(tree).find(isNode("textarea")), undefined, "no free-form editor: rows replaced the textarea");
assert.equal(flagBoxes(tree).length, 0, "no saved flags → no rows");
assert.ok(walk(tree).find(isLabel("addFlag")), "the flags list carries an add-flag control");

// The only Unity-specific notice: a Windows relay selected on a WSL host. The
// card renders it only while that state holds — it is not an always-on blurb.
assert.equal(notice(tree), undefined, "no notice while the state does not hold");
Object.assign(storeState, { wslWindowsExecutable: true });
const noticeTree = render(storeState);
const found = notice(noticeTree);
assert.ok(found, "the WSL + Windows-executable notice renders while the state holds");
assert.equal(walk(found)[1].props.children, "wslWindowsTitle", "the notice head is localizable copy");
Object.assign(storeState, { wslWindowsExecutable: false });

// ── the executable picker ─────────────────────────────────────────────────
// Nothing saved: the pill invites a pick and the empty state says what to do.
const pill = findPill(tree);
assert.ok(pill, "the pill that anchors the dropdown renders");
assert.equal(pill.props.children[0].props.children, "executableNone", "an unresolved selection invites a pick");
assert.equal(pill.props["aria-expanded"], false, "the dropdown starts closed");
assert.equal(pill.props["aria-haspopup"], "menu", "the pill is a menu trigger");
assert.ok(
    walk(tree).find((n) => n.type === "p" && n.props?.className === CLS("empty")),
    "with nothing saved the card says what to do"
);
const search = walk(tree).find(isLabel("fetchExecutables"));
assert.ok(search, "the search-executables action renders");
assert.equal(search.props.disabled, false, "search is available while writable");
assert.equal(walk(tree).find(isLabel("openWindowsChrome")), undefined, "there is no Windows prelaunch action on this card");
assert.equal(walk(tree).find(isLabel("flagsWsl")), undefined, "there is no WSL flags action on this card");

// Rows: the id is what goes on the wire, the name is what the card shows, and a
// probe failure tags its option. There is no "auto" entry to look for.
serve({
    executables: [
        { id: "/home/u/.unity/relay/relay_linux", name: "Home" },
        { id: "/mnt/c/Users/u/.unity/relay/relay_win.exe", name: "" },
        { id: "/broken/relay_linux", name: "broken" }
    ],
    executableStatus: [
        { path: "/home/u/.unity/relay/relay_linux", version: "1.0.12-build.99", error: "" },
        { path: "/mnt/c/Users/u/.unity/relay/relay_win.exe", version: "1.0.12-build.99", error: "" },
        { path: "/broken/relay_linux", version: "", error: "Unity relay executable not found: /broken/relay_linux" }
    ],
    effectiveRelayPath: "/home/u/.unity/relay/relay_linux",
    effectiveSource: "selected"
});
tree = render(storeState);
const menu = menuProps.at(-1);
assert.ok(menu, "the card handed the dropdown primitive its list");
assert.equal(
    JSON.stringify(menu.items.map((item) => item.label)),
    JSON.stringify(["Home", "/mnt/c/Users/u/.unity/relay/relay_win.exe", "broken (unavailableSuffix)"]),
    "a row's label is its saved name, else its path, tagged when its probe failed"
);
assert.equal(
    JSON.stringify(menu.items.map((item) => item.id)),
    JSON.stringify(["/home/u/.unity/relay/relay_linux", "/mnt/c/Users/u/.unity/relay/relay_win.exe", "/broken/relay_linux"]),
    "a row's id is what goes on the wire"
);
assert.equal(menu.selectedId, "/home/u/.unity/relay/relay_linux", "the effective path is ticked");
assert.equal(menu.portal, true, "the list is portalled out of the card row");
const filled = findPill(tree);
assert.equal(filled.props.children[0].props.children, "Home", "the pill shows the saved name, not the version");
assert.equal(filled.props.title, "/home/u/.unity/relay/relay_linux", "the pill's title is the full path");
assert.equal(rowBoxes(tree).length, 3, "one row per saved executable");
assert.equal(rowInputs(tree).length, 6, "each row carries its path and its display name");
assert.ok(findTrash(tree), "a row carries a delete control");
assert.ok(walk(tree).find(isLabel("addExecutable")), "add-executable button rendered");

// What runs is always offered, even without a saved row.
serve({ executables: [], effectiveRelayPath: "/opt/relay_linux", effectiveSource: "row-config" });
tree = render(storeState);
assert.equal(
    JSON.stringify(menuProps.at(-1).items.map((item) => item.id)),
    JSON.stringify(["/opt/relay_linux"]),
    "what runs is offered even without a row"
);
assert.equal(findPill(tree).props.children[0].props.children, "/opt/relay_linux", "with no name saved the pill shows the path");

// Picking a row writes the selection (the host restarts the bridge).
menuProps.length = 0;
findPill(render(storeState)).props.onClick();
walk(render(storeState));
const opened = menuProps.at(-1);
assert.equal(opened.open, true, "clicking the pill opens the list");
writes.length = 0;
opened.onSelect("/opt/relay_linux");
assert.ok(writes.some(([f, v]) => f === "relayPath" && v === "/opt/relay_linux"), "picking a path writes relayPath");

// ── the probe result line ─────────────────────────────────────────────────
// The version line renders only once the host answered with one, so a run is
// more than a label flip.
serve({ effectiveRelayPath: "/home/u/.unity/relay/relay_linux", relayVersion: "" });
assert.equal(resultLine(render(storeState)), undefined, "no version line while nothing answered");
serve({ relayVersion: "1.0.12-build.99" });
const line = resultLine(render(storeState));
assert.ok(line, "the probe line renders once the selection answered");
assert.equal(line.props.children[0], "versionLabel", "the line is prefixed by its copy");
assert.equal(line.props.children[1].props.children, "1.0.12-build.99", "and carries the answer verbatim");

// ── the flags editor ──────────────────────────────────────────────────────
serve({ extraFlags: ["--log-level=debug", "--name=Game"], defaultExtraFlags: [] });
tree = render(storeState);
const rows = flagFields(tree);
assert.equal(rows.length, 2, "one field per saved flag");
assert.equal(rows[0].props.value, "--log-level=debug", "a row field carries the saved flag");
assert.equal(rows[0].props.placeholder, "flagsValuePlaceholder", "the field's placeholder is localizable");
assert.equal(flagTrashes(tree).length, 2, "each flag row carries its own delete control");
// Restore defaults is the list's own action, enabled only while the host
// actually serves a defaults list.
Object.assign(storeState, { defaultExtraFlags: ["--log-level=debug"] });
tree = render(storeState);
const restore = walk(tree).find(isLabel("flagsRestore"));
assert.ok(restore, "restore-defaults button rendered");
assert.equal(restore.props.disabled, false, "restore enabled while the host serves defaults");
assert.equal(restore.props.title, "flagsRestoreTitle", "its tooltip is localizable");
Object.assign(storeState, { defaultExtraFlags: [] });
assert.equal(walk(render(storeState)).find(isLabel("flagsRestore")).props.disabled, true, "no defaults served → nothing to recover");

// A settled edit writes the whole list once; a delete persists on the spot.
writes.length = 0;
flagFields(render(storeState))[0].props.onChange({ target: { value: "--log-level=info" } });
flagFields(render(storeState))[0].props.onBlur();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(writes.length, 1, "a settled edit writes once");
assert.equal(writes[0][0], "extraFlags", "and writes the flags list");
assert.equal(
    JSON.stringify(writes[0][1]),
    JSON.stringify(["--log-level=info", "--name=Game"]),
    "a typed value lands inside the saved list"
);
writes.length = 0;
flagTrashes(render(storeState))[0].props.onClick();
assert.equal(JSON.stringify(writes.map(([f]) => f)), JSON.stringify(["extraFlags"]), "a delete persists on the spot");
assert.equal(JSON.stringify(writes[0][1]), JSON.stringify(["--name=Game"]), "the deleted flag is gone");

// ── the reduce-log-output toggle ──────────────────────────────────────────
// The switch mirrors what the host resolves: the explicit mode, else the row
// config.
writes.length = 0;
serve({ stderrMode: "", rowStderr: "log" });
let toggleTree = render(storeState);
let toggle = walk(toggleTree).find(isNode("Switch", undefined)) ?? walk(toggleTree).find((n) => n.type === "Switch");
assert.ok(toggle, "the reduce-log-output switch renders");
assert.equal(toggle.props.checked, true, "log is the default, so the switch reads as on");
toggle.props.onChange();
assert.ok(writes.some(([f, v]) => f === "stderrMode" && v === "console"), "flipping writes console");
writes.length = 0;
serve({ stderrMode: "", rowStderr: "console" });
toggle = walk(render(storeState)).find((n) => n.type === "Switch");
assert.equal(toggle.props.checked, false, "the row config answers for the effective mode");
toggle.props.onChange();
assert.ok(writes.some(([f, v]) => f === "stderrMode" && v === "log"), "flipping back writes log");

// ── the executable run + the choose-to-add dialog ─────────────────────────
const statusFound = [
    { path: "/home/u/.unity/relay/relay_linux", version: "1.0.12-build.99", error: "" },
    { path: "/opt/relay_linux", version: "", error: "Unity relay executable not found: /opt/relay_linux" }
];
Object.assign(storeState, { executables: [], executableStatus: statusFound, effectiveRelayPath: "", relayPath: "", relayVersion: "" });
Object.assign(scopeSnapshot.value, { executables: [], executableStatus: statusFound, effectiveRelayPath: "", relayPath: "", relayVersion: "" });
dialogBlock: {
    render(storeState);
    writes.length = 0;
    walk(render(storeState)).find(isLabel("fetchExecutables")).props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(writes.some(([f]) => f === "refreshExecutablesNonce"), "the fetch action writes the trigger nonce");
    const dialogTree = render(storeState);
    const dialog = walk(dialogTree).find(isNode("div", CLS("dialogContent")));
    assert.ok(dialog, "the fetch opens the choose-to-add dialog");
    const listed = walk(dialogTree).filter((n) => n.type === "span" && n.props?.className === CLS("candidateId"));
    assert.equal(
        JSON.stringify(listed.map((n) => n.props.children)),
        JSON.stringify(["/home/u/.unity/relay/relay_linux", "/opt/relay_linux"]),
        "the dialog lists every path the run looked at"
    );
    const notes = walk(dialogTree).filter((n) => n.type === "span" && n.props?.className === CLS("candidateNote"));
    assert.equal(
        JSON.stringify(notes.map((n) => n.props.children)),
        JSON.stringify(["1.0.12-build.99", "Unity relay executable not found: /opt/relay_linux"]),
        "and every row carries the answer the run gave for it"
    );
    assert.equal(walk(dialogTree).filter(isNode("input", CLS("candidateSearch"))).length, 1, "the dialog carries a search field");
    // Nothing is pre-checked (no row is saved yet), so the merge lands only
    // what the checks mark. The dialog keeps its own selection draft, so the
    // merge reads the tick *after* it lands — re-render before clicking.
    const boxes = walk(dialogTree).filter((n) => n.type === "input" && n.props?.type === "checkbox");
    assert.equal(boxes.length, 2, "one checkbox per candidate row");
    assert.equal(boxes.every((box) => box.props.disabled === false), true, "no candidate is pre-saved, so none is locked");
    boxes[1].props.onChange({ target: { checked: true } });
    const ticked = render(storeState);
    assert.equal(
        walk(ticked).filter((n) => n.type === "input" && n.props?.type === "checkbox")[1].props.checked,
        true,
        "the check lands on the row"
    );
    const addControl = walk(ticked).find((n) => n.type === "button" && n.props?.children === "addSelected");
    assert.ok(addControl, "the dialog footer carries one add control");
    writes.length = 0;
    addControl.props.onClick();
    assert.ok(
        writes.some(([f, v]) => f === "executables" && Array.isArray(v) && v.some((row) => row.id === "/opt/relay_linux")),
        "add-selected merges the chosen paths into the saved rows"
    );
    assert.equal(walk(render(storeState)).find(isNode("div", CLS("dialogContent"))), undefined, "and closes the dialog");
}

// ── the error dot + staged form ───────────────────────────────────────────
serve({ lastError: "unity-ai-relay: bridge executable not found", unityMissing: false, actionError: "" });
tree = render(storeState);
const dot = findDot(tree);
assert.ok(dot, "the header dot renders while an error is held");
assert.ok(dot.props.className.includes(CLS("dotError")), "and reads as an error");
assert.equal(dot.props["aria-label"], "statusError", "the dot's aria-label states what it means");
assert.equal(dot.props.title, "unity-ai-relay: bridge executable not found", "the tooltip carries the error itself");
assert.ok(walk(tree).find(isNode("p", CLS("error"))), "the body repeats the error line");

// A known missing executable with no message still badges: the dot is the only
// surface the state has.
serve({ lastError: "", unityMissing: true });
dotMissing: {
    const t = render(storeState);
    const d = findDot(t);
    assert.ok(d, "the known missing state badges the header");
    assert.equal(d.props["aria-label"], "statusError", "the dot states the known error");
}

// Staged edits: nothing is written until Apply, and Discard drops the draft.
Object.assign(storeState, { dirty: true, saving: false, failed: false });
tree = render(storeState);
assert.ok(walk(tree).find(isNode("span", CLS("badge"))), "the title announces a staged edit");
const discard = walk(tree).find(isLabel("discard"));
const apply = walk(tree).find((n) => n.type === "button" && n.props?.children === "apply");
assert.ok(discard, "the body carries a discard control");
assert.ok(apply, "and an apply control");
Object.assign(storeState, { dirty: false });
assert.equal(walk(render(storeState)).find(isNode("span", CLS("badge"))), undefined, "no badge with nothing staged");

// A read-only deployment says so once and disables the editing controls.
Object.assign(storeState, { writable: false, available: true });
tree = render(storeState);
assert.ok(walk(tree).find(isNode("p", CLS("readOnly"))), "read-only is stated once");
assert.ok(walk(tree).find(isLabel("fetchExecutables")).props.disabled, "search is disabled read-only");
assert.ok(walk(tree).find(isLabel("addFlag")).props.disabled, "flag editing is disabled read-only");
Object.assign(storeState, { writable: true });

console.log("test/client.test.mjs: all assertions passed");
