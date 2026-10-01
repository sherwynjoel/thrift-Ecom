import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { handle } from "@/server/api";
import { ServiceUnavailableError } from "@/server/errors";

// No DB access anywhere here: this only exercises error-to-response mapping in src/server/api.ts.
const req = () => new NextRequest("http://localhost/x");
const ctx = () => ({ params: Promise.resolve({}) });

describe("errorResponse (via handle)", () => {
  it("sends 503 with Retry-After for a ServiceUnavailableError, same as a RateLimitedError", async () => {
    const route = handle(async () => {
      throw new ServiceUnavailableError(5);
    });
    const res = await route(req(), ctx());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect((await res.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
