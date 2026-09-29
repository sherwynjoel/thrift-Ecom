/** Returns a same-origin path (path + search + hash) for a post-login redirect, or "/" for anything else. */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return "/";
    if (!url.pathname.startsWith("/")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
