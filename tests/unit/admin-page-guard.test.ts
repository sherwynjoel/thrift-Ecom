import { describe, expect, it, vi } from "vitest";

// NOTE: deliberately no `beforeEach(() => requireAdminMock.mockReset())` here. With this Vitest version,
// resetting a mock between tests that give it a *rejecting* implementation via `mockImplementation(() =>
// Promise.reject(...))` (or `mockRejectedValue`) causes that rejection to also be reported as an unhandled
// error on a *later* test, failing it even though `requireAdminPage` correctly caught and handled it. Each
// test below sets its own mock behavior explicitly before using it, so skipping the reset is safe here.
const requireAdminMock = vi.fn();
vi.mock("@/server/admin-guard", () => ({ requireAdmin: () => requireAdminMock() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { requireAdminPage } from "@/app/admin/guard";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

describe("requireAdminPage", () => {
  it("returns the admin id on success", async () => {
    requireAdminMock.mockResolvedValue({ userId: "a1" });
    await expect(requireAdminPage()).resolves.toEqual({ userId: "a1" });
  });

  it("redirects to /login when the visitor is not logged in", async () => {
    requireAdminMock.mockImplementation(() => Promise.reject(new UnauthorizedError()));
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
  });

  it("redirects to /login when the visitor is not an admin", async () => {
    requireAdminMock.mockImplementation(() => Promise.reject(new ForbiddenError()));
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
  });

  it("rethrows any other error instead of redirecting, so it doesn't look like a login problem", async () => {
    requireAdminMock.mockImplementation(() => Promise.reject(new Error("db down")));
    await expect(requireAdminPage()).rejects.toThrow("db down");
  });
});
