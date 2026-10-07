/**
 * Stylesheet check — every custom property the card reads is one the theme
 * publishes.
 *
 * A custom property the theme never defines resolves to nothing: the whole
 * declaration is dropped at computed-value time and the property silently falls
 * back to `inherit`. Nothing throws, no console line marks it, so an invented
 * name is only ever visible as wrong color.
 *
 * This sheet was inherited from the reference plugin, and the reference carries
 * exactly one invented name (`--dsw-alias-label-error` in the footer error
 * rule), so the set is pinned against the whitelist below. A name is only ever
 * added here once it is a token `@deepseek-ai/dsh-client-ui-theme` actually
 * publishes — read it there, not from a guess.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scopedName } from "../scripts/scoped-name.mjs";

/** The custom properties the card is allowed to read (all theme-published). */
const ALLOWED_TOKENS = new Set([
    "--dsw-alias-bg-layer-1",
    "--dsw-alias-bg-layer-2",
    "--dsw-alias-bg-layer-3",
    "--dsw-alias-bg-module-platform",
    "--dsw-alias-border-l2",
    "--dsw-alias-border-l3",
    "--dsw-alias-border-l4",
    "--dsw-alias-brand-primary",
    "--dsw-alias-interactive-bg-hover",
    "--dsw-alias-interactive-bg-hover-danger",
    "--dsw-alias-label-dimmed",
    "--dsw-alias-label-primary",
    "--dsw-alias-label-secondary",
    "--dsw-alias-label-tertiary",
    "--dsw-alias-state-error-primary"
]);

const sheet = readFileSync(
    fileURLToPath(new URL("../src/client/styles/UnityMcpCard.module.css", import.meta.url)),
    "utf8"
);
// The checks below are about what the sheet *does*, so comments (which record
// what it used to do) are dropped before they run.
const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = [...new Set([...rules.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))].sort();
assert.ok(tokens.length >= 15, "the sheet is expected to read a dozen theme tokens, found " + tokens.length);
for (const token of tokens) {
    assert.ok(ALLOWED_TOKENS.has(token), "token not published by the theme: " + token);
}

// A read of an undefined token: the footer error line must read the same error
// state every other error line on the card reads.
assert.equal(/var\(--dsw-alias-label-error\)/.test(rules), false, "the footer error line must not read a token the theme never publishes");
assert.match(rules, /\.footerError\s*\{[^}]*color: var\(--dsw-alias-state-error-primary\)/s, "the footer error line is red like the rest");

// The separator between the body's blocks: the card can serve a block that is
// not a catalog (the WSL + Windows-executable notice, a read-only line) between
// two catalogs, so a rule keyed on two catalogs being adjacent stops applying
// to everything that follows it. And no rule may name a class the card never
// renders — `linkButtonRow` was the reference's two-actions wrapper.
assert.equal(/\.catalog \+ \.catalog/.test(rules), false, "the separator must not depend on two catalogs being adjacent");
assert.match(rules, /\.catalog:not\(:first-child\)\s*\{[^}]*border-top/s, "every block but the first keeps its separator");
assert.equal(/linkButtonRow/.test(rules), false, "the sheet may not style a class the card never renders");

// The class scope itself: every scoped selector must be able to *begin* a CSS
// class name. A scope whose first character is a digit is an invalid selector,
// the browser drops every rule carrying it, and the build passes silently —
// so the digest is pinned to start with a letter.
for (const sourcePath of [
    "src/client/styles/UnityMcpCard.module.css",
    "src/client/card/UnityMcpCard.module.css",
    "src/client/styles/index.module.css",
    "src/styles/Card.module.css",
    "a/b/c/d.e.module.css"
]) {
    const digest = scopedName(sourcePath);
    assert.match(digest, /^[a-z][0-9a-z]{5}$/, "the class scope of " + sourcePath + " cannot lead a CSS class selector: " + digest);
}
assert.equal(scopedName("src/client/styles/UnityMcpCard.module.css"), scopedName("src/client/styles/UnityMcpCard.module.css"), "the scope is stable per source path");

console.log("test/styles.test.mjs: all assertions passed");
