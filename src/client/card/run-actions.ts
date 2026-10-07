/**
 * The card's imperative run logic.
 *
 * The one host action the executable block drives — **Fetch executables** (run
 * the discovery, then open the choose-to-add dialog over what it answered for) —
 * plus the one-run-at-a-time busy overlay and the probe-freshness clock it owns.
 * It is a hook so `./index.ts` stays the composition of the body while the
 * imperative half lives here; the widget owns none of this state by hand.
 */
/// <reference path="../shell-modules.d.ts" />
import * as react from "react";

import type { UnityExecutableStatus } from "../controller/index.js";

/** How often the probe result line re-reads its clock to age the "ago" suffix. */
export const PROBED_AGE_TICK_MS = 10000;

/** One row the fetch dialog offers: a path, what the run said about it, and
 * whether that answer is a failure (an empty version carrying an error). */
export type FetchCandidate = { id: string; note: string; broken: boolean };

/** The shape `runFetch` opens the dialog over. */
export type FetchDialog = { candidates: FetchCandidate[] } | null;

/** The run half `./index.ts` wires into the picker + the dialog. */
export type RunActions = {
    /** A fetch is in flight — the picker's pill reads busy. */
    running: boolean;
    /** The open fetch dialog (null = closed). */
    dialog: FetchDialog;
    /** Fire the fetch action. */
    runFetch: () => void;
    /** Merge the dialog's checked ids into the rows, then close. */
    addFromDialog: (ids: string[]) => void;
    /** Close the dialog. */
    closeDialog: () => void;
    /** When the last fetch settled, for the result line's age suffix. */
    lastProbedAt: number;
    /** The card's local clock, ticked while open so the age stays honest. */
    clock: number;
};

/**
 * Drive the host run, keeping the busy overlay, the fetch dialog and the
 * probe-freshness clock in one place.
 */
export function useRunActions(deps: {
    /** The host executable run, answering with every candidate it looked at. */
    refreshExecutables: () => Promise<UnityExecutableStatus[]>;
    /** Merge dialog ids into the saved rows. */
    addExecutables: (ids: string[]) => Promise<void>;
}): RunActions {
    const runningState = react.useState(false);
    const isRunning = runningState[0];
    const setRunning = runningState[1];
    const dialogRef = react.useState<FetchDialog>(null);
    const dialog = dialogRef[0];
    const setDialog = dialogRef[1];
    // The probe's freshness clock: a run is only visible when the answer
    // differs, so the line ages the last run the card itself ran; the effect
    // keeps the age honest while the card stays open.
    const probedState = react.useState(0);
    const lastProbedAt = probedState[0];
    const setLastProbedAt = probedState[1];
    const clockState = react.useState(() => Date.now());
    const clock = clockState[0];
    const setClock = clockState[1];
    react.useEffect(() => {
        const tick = setInterval(() => setClock(Date.now()), PROBED_AGE_TICK_MS);
        return () => clearInterval(tick);
    }, []);

    /**
     * The fetch action: run the host's executable discovery, then open the
     * choose-to-add dialog over what it answered for. A run that found nothing
     * leaves the card exactly as it was — an empty list has nothing to select —
     * so the dialog opens only when there are candidates.
     */
    const runFetch = () => {
        setRunning(true);
        let promise;
        try {
            promise = deps.refreshExecutables();
        } catch (caught) {
            promise = Promise.reject(caught);
        }
        Promise.resolve(promise).then(
            async (statuses) => {
                setRunning(false);
                const settled = Date.now();
                setLastProbedAt(settled);
                setClock(settled);
                if (!Array.isArray(statuses) || statuses.length === 0) return;
                // The dialog's rows: the whole run's answer list, so every path
                // the machine carries reads with its answer, not only the saved
                // ones. A path the run could not launch keeps its place carrying
                // the failure line.
                const candidates = statuses.map((status) => ({
                    id: status.path,
                    note: status.version !== "" ? status.version : status.error,
                    broken: status.version === "" && status.error !== ""
                }));
                setDialog({ candidates });
            },
            () => {
                setRunning(false);
            }
        );
    };

    /** "Add selected": merge the dialog's checked ids into the rows, then close.
     * The controller owns the merge rules (and skips a no-op write). */
    const addFromDialog = (ids: string[]) => {
        setDialog(null);
        if (typeof deps.addExecutables === "function") Promise.resolve(deps.addExecutables(ids)).catch(() => { });
    };

    return {
        running: isRunning,
        dialog,
        runFetch,
        addFromDialog,
        closeDialog: () => setDialog(null),
        lastProbedAt,
        clock
    };
}
