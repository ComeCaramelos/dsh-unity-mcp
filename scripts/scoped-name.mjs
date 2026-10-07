/**
 * The scoping digest the CSS-modules step uses to name one stylesheet's
 * class map (scripts/build-client.mjs).
 *
 * Kept in its own module — build-client.mjs runs the whole build at import —
 * so a test can pin the digest's shape without driving esbuild.
 */

/**
 * The stable 6-character scope of one stylesheet: derived from the
 * repo-relative source path, so a class name never drifts with the absolute
 * path of the checkout a build happened to run in.
 *
 * The first character is always a letter. A CSS class selector cannot begin
 * with a digit (`1otoya_card` is an invalid class selector in CSS — the whole
 * rule is silently dropped), and a raw base-36 digest lands on a digit about
 * a third of the time, which would strip every scoped rule out of the emitted
 * sheet with no build or console error. Remapping only the leading character
 * keeps the scope deterministic per path.
 */
export function scopedName(sourcePath) {
    let hash = 0x811c9dc5 >>> 0;
    for (let index = 0; index < sourcePath.length; index++) {
        hash ^= sourcePath.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(6, "0").slice(0, 6).replace(/^[0-9]/, (digit) => String.fromCharCode(97 + Number(digit)));
}
