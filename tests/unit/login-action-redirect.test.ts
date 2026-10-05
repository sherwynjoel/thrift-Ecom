import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "7.7.7.7" }) }));
const signIn = vi.fn();
vi.mock("@/server/auth", () => ({ signIn: (...a: unknown[]) => signIn(...a), signOut: vi.fn(), auth: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
const readGuestToken = vi.fn(async (): Promise<string | null> => null);
const clearGuestToken = vi.fn(async () => {});
vi.mock("@/server/cart-cookie", () => ({ readGuestToken: () => readGuestToken(), clearGuestToken: () => clearGuestToken() }));
const mergeGuestCartIntoUser = vi.fn(async () => {});
vi.mock("@/server/services/cart", () => ({ mergeGuestCartIntoUser: (...a: unknown[]) => mergeGuestCartIntoUser(...(a as [])) }));
vi.mock("@/server/services/auth", () => ({
  findUserIdByEmail: async () => "user-1",
  registerUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

import { AuthError } from "next-auth";
import { loginAction } from "@/app/(auth)/actions";

const form = (email: string, password: string, next: string) => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  fd.set("next", next);
  return fd;
};

// Behind the proxy Next follows an action's redirect with an internal fetch; an absolute hop to the public origin
// dropped the new session cookie and the shopper got the login page back. The action must redirect relatively.
describe("loginAction redirect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs in without Auth.js redirecting and goes straight to the relative next path", async () => {
    await expect(loginAction({}, form("a@b.co", "password-123", "/account"))).rejects.toMatchObject({ to: "/account" });
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@b.co", password: "password-123", redirect: false });
    expect(redirect).toHaveBeenCalledWith("/account");
  });

  it("merges the guest bag into the account and clears the guest cookie", async () => {
    readGuestToken.mockResolvedValueOnce("guest-tok");
    await expect(loginAction({}, form("a@b.co", "password-123", "/checkout"))).rejects.toMatchObject({ to: "/checkout" });
    expect(mergeGuestCartIntoUser).toHaveBeenCalledWith("guest-tok", "user-1");
    expect(clearGuestToken).toHaveBeenCalled();
  });

  it("still logs in when the bag merge fails", async () => {
    readGuestToken.mockResolvedValueOnce("guest-tok");
    mergeGuestCartIntoUser.mockRejectedValueOnce(new Error("P2025"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await expect(loginAction({}, form("a@b.co", "password-123", "/account"))).rejects.toMatchObject({ to: "/account" });
  });

  it("keeps the typed email and shows the error on a wrong password", async () => {
    signIn.mockRejectedValueOnce(new AuthError("CredentialsSignin"));
    const state = await loginAction({}, form("a@b.co", "wrong-password", "/account"));
    expect(state).toEqual({ email: "a@b.co", error: "Incorrect email or password" });
  });

  it("refuses an off-site next URL", async () => {
    await expect(loginAction({}, form("a@b.co", "password-123", "https://evil.example/x"))).rejects.toMatchObject({ to: "/" });
  });
});
