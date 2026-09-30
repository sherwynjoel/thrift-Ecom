import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { POST } from "@/app/api/cron/[job]/route";

const call = (job: string, auth?: string) =>
  POST(new NextRequest(`http://localhost:3000/api/cron/${job}`, { method: "POST", headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ job }) });

describe("POST /api/cron/[job]", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to run without a configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("expire-orders", "Bearer anything")).status).toBe(503);
  });

  it("checks the bearer secret and the job name, then runs the job", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await call("expire-orders")).status).toBe(401);
    expect((await call("expire-orders", "Bearer wrong")).status).toBe(401);
    expect((await call("nope", "Bearer test-cron-secret")).status).toBe(404);
    const ok = await call("expire-orders", "Bearer test-cron-secret");
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ job: "expire-orders", result: { expired: 0 } });
  });

  it("gives the same 401 for a missing, wrong-length or wrong secret, and checks auth before the job name", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const bodies = await Promise.all(
      [undefined, "Bearer test-cron-secre", "Bearer test-cron-secreT", "test-cron-secret", "Basic test-cron-secret"].map(async (auth) => {
        const r = await call("expire-orders", auth);
        expect(r.status).toBe(401);
        return r.json();
      }),
    );
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect((await call("nope", "Bearer wrong")).status).toBe(401);
  });

  it("runs reconcile-payments", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const ok = await call("reconcile-payments", "Bearer test-cron-secret");
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ job: "reconcile-payments", result: { checked: 0, paid: 0, attention: 0, errors: 0 } });
  });
});
