import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { LOCAL_UPLOAD_ROOT } from "@/server/adapters/storage";
import { DESIGN_PRINT_PREFIX } from "@/lib/studio/constants";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const root = resolve(LOCAL_UPLOAD_ROOT);
  const full = resolve(root, ...path);
  if (!full.startsWith(root + sep)) return new Response("Not found", { status: 404 });
  // Print files are only for the print queue: served through the admin-only download route, never publicly.
  if (full.slice(root.length + 1).split(sep).join("/").toLowerCase().startsWith(DESIGN_PRINT_PREFIX)) return new Response("Not found", { status: 404 });
  const type = TYPES[extname(full).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(full);
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
