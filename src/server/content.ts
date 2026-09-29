import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), "content", "pages");

export async function readPage(slug: string): Promise<{ title: string; body: string } | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = await readFile(join(ROOT, `${slug}.md`), "utf8");
    const lines = raw.split(/\r?\n/);
    const titleIdx = lines.findIndex((l) => l.startsWith("# "));
    const title = titleIdx >= 0 ? lines[titleIdx].slice(2).trim() : slug;
    const body = lines.filter((_, i) => i !== titleIdx).join("\n").trim();
    return { title, body };
  } catch {
    return null;
  }
}
