import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_IP = `9.9.9.${Math.floor(Math.random() * 254) + 1}`;
const TEST_EMAIL = `rate-limit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": TEST_IP }),
}));

const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/services/auth", () => ({
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  registerUser: vi.fn(),
  resetPassword: vi.fn(),
}));

// actions.ts imports `signIn` from `@/server/auth`, which otherwise triggers a real
// NextAuth() setup at module-load time; mock it out (see tests/unit/cart-ref.test.ts).
vi.mock("@/server/auth", () => ({ signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }));
// The real `next-auth` package pulls in `next/server` in a way that fails to resolve
// under vitest; actions.ts only needs the `AuthError` class for an instanceof check.
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

import { forgotPasswordAction } from "@/app/(auth)/actions";

describe("forgotPasswordAction rate limiting", () => {
  beforeEach(() => {
    requestPasswordReset.mockClear();
  });

  it("blocks the 4th request for the same email within the window with a rate-limit error", async () => {
    const formData = () => {
      const fd = new FormData();
      fd.set("email", TEST_EMAIL);
      return fd;
    };

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await forgotPasswordAction({}, formData()));
    }

    expect(results[0]).toEqual({ ok: true });
    expect(results[1]).toEqual({ ok: true });
    expect(results[2]).toEqual({ ok: true });
    expect(results[3]).toEqual({ error: "Too many attempts. Please wait a minute and try again." });
  });
});
