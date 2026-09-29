import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getUserByIdMock = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("@/server/services/auth", () => ({ getUserById: (id: string) => getUserByIdMock(id) }));

import { requireAdmin } from "@/server/admin-guard";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

describe("requireAdmin", () => {
  beforeEach(() => {
    authMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it("rejects anonymous visitors", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects customers even if the session claims admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects deleted users", async () => {
    authMock.mockResolvedValue({ user: { id: "gone", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the admin id", async () => {
    authMock.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
    getUserByIdMock.mockResolvedValue({ id: "a1", role: "ADMIN" });
    await expect(requireAdmin()).resolves.toEqual({ userId: "a1" });
  });
});
