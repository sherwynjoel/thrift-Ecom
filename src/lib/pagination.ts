export const MAX_PAGE = 1000;

/** A safe 1-based page from any input: `?page=1.5`, `1e400`, `-3` or junk would otherwise reach Prisma's `skip` and 500. */
export function clampPage(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_PAGE) : 1;
}
