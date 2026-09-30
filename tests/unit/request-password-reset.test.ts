import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleEmail } from "@/server/adapters/email/console";

const outbox = new ConsoleEmail();
vi.mock("@/server/adapters/email", () => ({ getEmail: () => outbox }));

import { db } from "@/server/db";
import { registerUser, requestPasswordReset } from "@/server/services/auth";
import { resetDb } from "../helpers/db";

describe("requestPasswordReset", () => {
  beforeEach(async () => {
    await resetDb();
    outbox.sent.length = 0;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  it("emails a reset link containing a stored token", async () => {
    await registerUser({ name: "Asha", email: "asha@example.com", password: "hunter2hunter2" });
    await requestPasswordReset("Asha@Example.com");
    expect(outbox.sent).toHaveLength(1);
    const msg = outbox.sent[0];
    expect(msg.to).toBe("asha@example.com");
    const token = msg.html.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(await db.verificationToken.findUnique({ where: { token: token! } })).not.toBeNull();
  });

  it("stays silent for unknown emails", async () => {
    await requestPasswordReset("nobody@example.com");
    expect(outbox.sent).toHaveLength(0);
  });

  it("escapes the user's name in the email html", async () => {
    await registerUser({ name: "<b>Evil</b>", email: "evil@example.com", password: "hunter2hunter2" });
    await requestPasswordReset("evil@example.com");
    expect(outbox.sent).toHaveLength(1);
    const msg = outbox.sent[0];
    expect(msg.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(msg.html).not.toContain("<b>Evil</b>");
  });
});
