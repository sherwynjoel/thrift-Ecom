/**
 * Dismissing the announcement bar sets this cookie (client-side, no server round trip) so a reload
 * never flashes it: the storefront layout reads the same cookie server-side and skips rendering the
 * bar when the hash matches the current announcement text. Session cookie (no Max-Age) so a new
 * browser session sees the bar again; a new announcement text gets a new hash, so it shows again too.
 */
export const ANN_DISMISSED_COOKIE = "ann_dismissed";

/** Short, stable, non-cryptographic fingerprint; same algorithm on server and client. */
export function announcementHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
