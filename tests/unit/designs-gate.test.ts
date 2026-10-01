import { describe, expect, it, vi } from "vitest";

// The gate is mocked out entirely, so its callback (body read + parse + createDesignAndAddToCart)
// never runs: this test proves the route is wired through withUploadGate, without touching the
// database or needing a real multipart body. vi.hoisted is required here: vi.mock's factory runs
// before any module-scope `const` would, so a plain top-level variable would still be uninitialized.
const { gate } = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock("@/server/upload-gate", () => ({ withUploadGate: gate }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/designs/route";
import { ServiceUnavailableError } from "@/server/errors";

const ctx = () => ({ params: Promise.resolve({}) });
const req = () => new NextRequest("http://localhost/api/designs", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" } });

describe("POST /api/designs uses the upload gate", () => {
  it("routes the request through withUploadGate", async () => {
    gate.mockResolvedValueOnce({ cartToken: "stub" });
    const res = await POST(req(), ctx());
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate.mock.calls[0][0]).toBeInstanceOf(Function);
    expect(res.status).toBe(201);
  });

  it("turns a busy gate into a 503 with Retry-After, without ever reading the body", async () => {
    gate.mockRejectedValueOnce(new ServiceUnavailableError(5));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
  });
});
