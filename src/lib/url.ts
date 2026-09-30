/** Client-safe: no `@/server/*` imports. True only for well-formed http/https URLs (never javascript:, mailto:, data:, etc). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
