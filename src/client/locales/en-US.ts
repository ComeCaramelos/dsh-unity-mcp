/**
 * English copy — the dictionary every other tag falls back to.
 *
 * Every string the card renders lives here; the widget itself stays
 * copy-free. Add a locale by dropping a sibling file and registering it in
 * ./index.ts.
 *
 * No key describes an "automatic" state, because there is no auto mode: what
 * the saved-executable rows list is what can be picked, and the only automatic
 * step is the host seeding a never-configured host once.
 */
export const en = {
    title: "DSH Unity MCP",
    description: "DSH Unity MCP server (unity-ai-relay) settings and status",
    executableLabel: "Unity relay executable",
    executableHint: "The saved executable the bridge launches with. Applying a different one restarts the connection.",
    executableNone: "No Unity relay executable detected",
    executableRows: "Saved executables",
    executableIdLabel: "Executable path",
    executableIdPlaceholder: "Path to a Unity relay executable",
    executableNameLabel: "Display name",
    namePlaceholder: "Display name",
    addExecutable: "Add executable",
    removeExecutable: "Delete executable",
    fetchExecutables: "Fetch executables",
    fetching: "Fetching…",
    executableEmpty: "No executables saved. Use “Fetch executables”, or add the relay path by hand.",
    dialogExecutablesTitle: "Choose executables to add",
    dialogExecutablesDescription: "These are the Unity relay executables this host's last run answered for. Choose the ones to add.",
    dialogEmpty: "Nothing matches your search.",
    searchExecutables: "Search executables",
    selectAll: "Select all",
    addSelected: "Add selected",
    candidateSaved: "Saved",
    close: "Close",
    cancel: "Cancel",
    unavailableSuffix: "not runnable",
    wslWindowsTitle: "Windows executable under WSL",
    wslWindowsNote:
        "This host runs inside Windows Subsystem for Linux and the selected executable is the Windows relay, launched through the interop mount. It works: the relay speaks MCP over stdio, so nothing about the connection changes. Keep the relay's own arguments (its --log-dir, and --project-path when you pin a Unity project) in the Windows spelling — the relay resolves them on the Windows side.",
    probing: "Checking the executables…",
    versionLabel: "Probed version:",
    probeJustNow: "just now",
    probeSecondsAgo: "seconds ago",
    probeMinutesAgo: "minutes ago",
    probeHoursAgo: "hours ago",
    flagsTitle: "Extra flags",
    flagsHint: "The extra flags the relay launches with, after the --mcp mode flag. One flag per row — applying them restarts the connection.",
    flagsEmpty: "No extra flags saved. Add one by hand.",
    flagsRows: "Saved flags",
    flagsValueLabel: "Extra flag",
    flagsValuePlaceholder: "e.g. --project-path=/path/to/Project",
    addFlag: "Add flag",
    removeFlag: "Delete flag",
    flagsRestore: "Restore defaults",
    flagsRestoreTitle: "Keep every flag the rows carry and append the defaults that are still missing",
    reduceLabel: "Reduce log output",
    reduceTitle: "Capture the bridge's stderr into the plugin's log file",
    reduceHint: "Captures stderr into the plugin's log file. Turn it off to debug the raw bridge output; switching restarts the bridge connection.",
    // The staged form's own copy: nothing is written until **Apply** lands every
    // staged edit, so the card announces what a save would store and what it
    // could not land.
    apply: "Apply",
    discard: "Discard",
    saving: "Applying…",
    unsaved: "Unsaved",
    saveFailed: "The last save was not accepted.",
    docsMessage: "Open the Unity MCP documentation for the relay's install path, the running-Editor requirement, and the relay's client options.",
    docsLinkLabel: "Unity MCP documentation",
    statusError: "Error",
    statusOk: "OK",
    unityMissing: "Unity relay executable not found",
    readOnly: "Settings are read-only in this deployment.",
    expand: "Expand",
    collapse: "Collapse"
};
