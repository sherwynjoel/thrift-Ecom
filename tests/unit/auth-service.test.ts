import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import {
  changePassword, createPasswordResetToken, registerUser, resetPassword, updateProfile, verifyCredentials,
} from "@/server/services/auth";
import { ConflictError, UnauthorizedError, ValidationError } from "@/server/errors";

describe("auth service", () => {
  beforeEach(resetDb);

  it("registers a customer with a hashed password and normalized email", async () => {
    const u = await registerUser({ name: "Asha", email: "  Asha@Example.com ", password: "hunter2hunter2" });
    expect(u.email).toBe("asha@example.com");
    expect(u.role).toBe("CUSTOMER");
    const row = await db.user.findUnique({ where: { id: u.id } });
    expect(row?.passwordHash).not.toBe("hunter2hunter2");
    await expect(registerUser({ name: "Dup", email: "asha@example.com", password: "hunter2hunter2" })).rejects.toBeInstanceOf(ConflictError);
    await expect(registerUser({ name: "X", email: "bad", password: "short" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("verifies credentials case-insensitively and rejects wrong passwords or Google-only users", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect((await verifyCredentials("ASHA@example.com", "hunter2hunter2"))?.email).toBe("asha@example.com");
    expect(await verifyCredentials("asha@example.com", "nope")).toBeNull();
    await db.user.create({ data: { email: "g@example.com" } });
    expect(await verifyCredentials("g@example.com", "anything")).toBeNull();
  });

  it("issues a single-use reset token that expires and changes the password", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect(await createPasswordResetToken("nobody@example.com")).toBeNull();
    const issued = await createPasswordResetToken("asha@example.com");
    expect(issued?.token.length).toBeGreaterThan(20);
    await resetPassword(issued!.token, "newpassword123");
    expect(await verifyCredentials("asha@example.com", "newpassword123")).not.toBeNull();
    await expect(resetPassword(issued!.token, "again12345")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("updates profile and changes password only with the current one", async () => {
    const u = await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    expect((await updateProfile(u.id, { name: "Asha K" })).name).toBe("Asha K");
    await expect(changePassword(u.id, "wrong", "newpassword123")).rejects.toBeInstanceOf(UnauthorizedError);
    await changePassword(u.id, "hunter2hunter2", "newpassword123");
    expect(await verifyCredentials("asha@example.com", "newpassword123")).not.toBeNull();
  });
});
