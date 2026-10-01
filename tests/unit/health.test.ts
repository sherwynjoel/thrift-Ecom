import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { GET } from "@/app/api/health/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports ok with the build version when the database answers", async () => {
    vi.stubEnv("APP_VERSION", "abc1234");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", db: "up", version: "abc1234" });
  });

  it("returns 503 when the database is down", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "error", db: "down", version: "dev" });
  });
});
