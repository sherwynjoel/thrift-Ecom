import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_UPLOAD_ROOT } from "@/server/adapters/storage";
import { GET } from "@/app/api/uploads/[...path]/route";

const call = (path: string[]) => GET(new Request("http://x/api/uploads"), { params: Promise.resolve({ path }) });

describe("uploads route", () => {
  beforeAll(() => {
    mkdirSync(join(LOCAL_UPLOAD_ROOT, "test-route"), { recursive: true });
    writeFileSync(join(LOCAL_UPLOAD_ROOT, "test-route", "ok.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("serves allowed files with hardened headers", async () => {
    const res = await call(["test-route", "ok.png"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it("404s traversal, unknown extensions, and missing files", async () => {
    expect((await call(["..", "..", "package.json"])).status).toBe(404);
    expect((await call(["test-route", "x.svg"])).status).toBe(404);
    expect((await call(["test-route", "missing.png"])).status).toBe(404);
  });
});
