import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOBS } from "@/server/jobs";

const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const envKeys = (text: string) => new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe("deploy kit", () => {
  it("schedules every cron job exactly once and nothing unknown", () => {
    const scheduled = [...read("deploy/crontab").matchAll(/run-job\.sh\s+([a-z0-9-]+)/g)].map((m) => m[1]);
    expect([...scheduled].sort()).toEqual(Object.keys(JOBS).sort());
  });

  it("pins the image's prisma CLI and bcryptjs to the installed versions", () => {
    const dockerfile = read("Dockerfile");
    const arg = (name: string) => dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, "m"))?.[1];
    expect(arg("PRISMA_VERSION")).toBe(JSON.parse(read("node_modules/prisma/package.json")).version);
    expect(arg("BCRYPTJS_VERSION")).toBe(JSON.parse(read("node_modules/bcryptjs/package.json")).version);
  });

  it("documents every environment variable the app reads", () => {
    const used = new Set<string>();
    for (const file of walk("src")) for (const m of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(m[1]);
    const documented = envKeys(read("deploy/.env.production.example"));
    const setByCompose = new Set([...read("deploy/docker-compose.prod.yml").matchAll(/^\s+([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
    const exempt = new Set(["NODE_ENV", "NEXT_DIST_DIR", "NEXT_OUTPUT", "NEXT_RUNTIME", "APP_VERSION"]);
    const missing = [...used].filter((k) => !documented.has(k) && !setByCompose.has(k) && !exempt.has(k));
    expect(missing).toEqual([]);
  });

  it("ships no real secrets in the production example", () => {
    const text = read("deploy/.env.production.example");
    for (const key of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SMTP_URL", "GOOGLE_CLIENT_SECRET"]) {
      expect(text).toMatch(new RegExp(`^${key}=(""|)$`, "m"));
    }
    for (const key of ["POSTGRES_PASSWORD", "AUTH_SECRET", "CRON_SECRET"]) expect(text).toMatch(new RegExp(`^${key}=replace-with-`, "m"));
  });

  it("keeps shell scripts, the crontab and the Caddyfile LF-only", () => {
    const files = ["docker/entrypoint.sh", "deploy/crontab", "deploy/Caddyfile", "deploy/cron/start.sh", "deploy/cron/run-job.sh", "deploy/backup/backup.sh", "deploy/create-admin.mjs", "Dockerfile",
      ...readdirSync("deploy").filter((f) => f.endsWith(".sh")).map((f) => `deploy/${f}`)];
    for (const f of files) expect(read(f).includes("\r"), `${f} has CRLF line endings`).toBe(false);
  });
});
