import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/server/cart-cookie", () => ({ readGuestToken: vi.fn(async () => null), clearGuestToken: vi.fn(async () => {}) }));
vi.mock("@/server/services/cart", () => ({ mergeGuestCartIntoUser: vi.fn(async () => {}) }));

import { GET } from "@/app/auth/after-login/route";

// Behind Caddy the Next server sees its container address, not the public one.
const INTERNAL = "http://0.0.0.0:3000";
const PUBLIC = "https://13-203-53-102.sslip.io";

describe("GET /auth/after-login behind a reverse proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("redirects to the public origin, never the container address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PUBLIC);
    const res = await GET(new Request(`${INTERNAL}/auth/after-login?next=%2Fadmin`));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin`);
  });

  it("keeps an absolute public callback URL instead of falling back to the home page", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PUBLIC);
    const res = await GET(new Request(`${INTERNAL}/auth/after-login?next=${encodeURIComponent(`${PUBLIC}/admin/orders?tab=ship`)}`));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/admin/orders?tab=ship`);
  });

  it("still refuses an off-site next URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PUBLIC);
    const res = await GET(new Request(`${INTERNAL}/auth/after-login?next=${encodeURIComponent("https://evil.example/phish")}`));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/`);
  });
});
