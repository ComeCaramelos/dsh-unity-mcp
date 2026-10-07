/**
 * The extra-flags editor — the one catalog block the reference card has no
 * equivalent for (it carries no free-form list field). It is the flags half of
 * the two halves `./rows.ts` renders: the same rows, read through the single
 * field a flag actually has — the value itself — instead of the executable
 * block's path + display name. Nothing about the list's rules changes on the
 * way here: a blur/Enter commits the whole list, a delete persists on the spot,
 * and a blank added row is local until it carries text.
 *
 * The block keeps the shape the reference's catalogs carry: the two-row field
 * (title with the configuration-guide link inline, hint below) and then the
 * rows, folded behind the same collapsed `<details>` disclosure the executable
 * block uses, so the two catalogs read as one widget shape.
 *
 * The write goes through `saveFlags` (the host validates the list, then
 * restarts the bridge connection in place). An empty row is never persisted:
 * the write side rejects an empty flag, so a row with no text is dropped on the
 * way out — the same rule the executable rows follow with an id-less row.
 *
 * The **Restore defaults** control is the list's own action: it keeps every
 * flag the rows already carry and appends only the defaults still missing (the
 * host serves the defaults list, so the card carries no copy of it), writing
 * the merged list exactly the way any other row write does — defaults are
 * recovered, nothing that is there is dropped.
 *
  */

/// <reference path="../shell-modules.d.ts" />
import { jsx, jsxs } from "react/jsx-runtime";
import { CONFIGURATION_URL } from "../plugin-meta.js";
import STYLES from "../styles/UnityMcpCard.module.css";
import { DOCS_PATHS } from "./icons.js";
import { RowList } from "./rows.js";

/** One flag list per row: the single field, held as one column. */
function rowsOf(flags: readonly string[]): string[][] {
    return flags.map((flag: string) => [flag]);
}

/** The rows as a plain flags list: trimmed, with a row still without a value
 * dropped rather than persisted (the write side rejects an empty flag) and
 * duplicates folded — first row wins, the rule the saved executable rows
 * already follow for a repeated id. */
function flagsOf(rows: readonly string[][]): string[] {
    var flags: string[] = [];
    for (const row of rows) {
        var flag = typeof row === "undefined" || row === null ? "" : String(row[0] ?? "").trim();
        if (flag === "") continue;
        if (flags.indexOf(flag) !== -1) continue;
        flags.push(flag);
    }
    return flags;
}

export function ExtraFlagsEditor(props: any): any {
    var t = props.t;
    var writable = props.writable;
    var flags: string[] = Array.isArray(props.flags) ? props.flags : [];
    var defaults: string[] = Array.isArray(props.defaultFlags) ? props.defaultFlags : [];
    var save = (next: string[][]) => {
        if (typeof props.saveFlags !== "function") return Promise.resolve();
        return Promise.resolve(props.saveFlags(flagsOf(next)));
    };
    /**
     * Restore defaults without dropping anything: every flag the rows carry is
     * kept, and only the host-served defaults still missing are appended. The
     * write is an ordinary whole-list row write, so the local view and the
     * saved list never disagree.
     */
    var restoreAction = (visible: string[][]) => {
        var current = flagsOf(visible);
        var merged = current.concat(defaults.filter((flag: string) => current.indexOf(flag) === -1));
        return jsx("button", {
            type: "button",
            className: STYLES.linkButton,
            // The defaults list is host-served — with nothing to recover there
            // is nothing to do.
            disabled: !writable || defaults.length === 0,
            title: t("flagsRestoreTitle"),
            onClick: () => {
                if (!writable) return;
                save(merged.map((flag: string) => [flag]));
            },
            children: t("flagsRestore")
        });
    };
    /** The list's one append action rides its own slot on the list's action
     * line. */
    var renderActions = (visible: string[][]) => restoreAction(visible);
    return jsxs("div", {
        className: STYLES.catalog,
        children: [
            jsxs("div", {
                className: STYLES.field,
                children: [
                    jsxs("div", {
                        className: STYLES.fieldRow,
                        children: [
                            jsx("span", { className: STYLES.fieldTitle, children: t("flagsTitle") }),
                            // The guide link rides the same field row the picker's
                            // pill occupies.
                            jsxs("a", {
                                className: STYLES.docsLink,
                                href: CONFIGURATION_URL,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                title: t("docsMessage"),
                                children: [
                                    jsx("svg", {
                                        className: STYLES.docsIcon,
                                        width: 14,
                                        height: 14,
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: 2,
                                        strokeLinecap: "round",
                                        strokeLinejoin: "round",
                                        "aria-hidden": "true",
                                        children: DOCS_PATHS.map((d: string, at: number) => jsx("path", { d: d }, at))
                                    }),
                                    jsx("span", { className: STYLES.docsLinkLabel, children: t("docsLinkLabel") })
                                ]
                            })
                        ]
                    }),
                    jsx("div", { className: STYLES.fieldDesc, children: t("flagsHint") })
                ]
            }),
            // One row per saved flag: the single field is the flag itself, and
            // the one append control rides the list's action line.
            jsx(RowList, {
                values: rowsOf(flags),
                labels: [t("flagsValueLabel")],
                placeholders: [t("flagsValuePlaceholder")],
                writable: writable,
                save: save,
                renderAction: renderActions,
                emptyText: t("flagsEmpty"),
                rowsLabel: t("flagsRows"),
                addLabel: t("addFlag"),
                removeLabel: t("removeFlag"),
                rowClassName: STYLES.catalogRowSingle,
                inputClassName: STYLES.catalogInputMono,
                disclosure: true
            })
        ]
    });
}
