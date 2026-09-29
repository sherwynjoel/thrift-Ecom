import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const readGuestToken = vi.fn();
const ensureGuestToken = vi.fn();

vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("@/server/cart-cookie", () => ({ readGuestToken: () => readGuestToken(), ensureGuestToken: () => ensureGuestToken(), clearGuestToken: vi.fn(), CART_COOKIE: "cart_token" }));

import { resolveCartRef } from "@/server/cart-ref";

describe("resolveCartRef", () => {
  beforeEach(() => {
    authMock.mockReset();
    readGuestToken.mockReset();
    ensureGuestToken.mockReset();
  });

  it("prefers the logged-in user", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    expect(await resolveCartRef({ create: false })).toEqual({ userId: "u1" });
    expect(ensureGuestToken).not.toHaveBeenCalled();
  });

  it("reads the guest cookie without creating one when create is false", async () => {
    authMock.mockResolvedValue(null);
    readGuestToken.mockResolvedValue("g1");
    expect(await resolveCartRef({ create: false })).toEqual({ guestToken: "g1" });
    readGuestToken.mockResolvedValue(null);
    expect(await resolveCartRef({ create: false })).toBeNull();
    expect(ensureGuestToken).not.toHaveBeenCalled();
  });

  it("mints a guest token when create is true", async () => {
    authMock.mockResolvedValue(null);
    ensureGuestToken.mockResolvedValue("fresh");
    expect(await resolveCartRef({ create: true })).toEqual({ guestToken: "fresh" });
  });
});
