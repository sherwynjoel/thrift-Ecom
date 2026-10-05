import { describe, expect, it, vi } from "vitest";
import { ConsoleEmail } from "@/server/adapters/email/console";

describe("ConsoleEmail", () => {
  it("records messages instead of sending", async () => {
    const e = new ConsoleEmail();
    await e.send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>" });
    expect(e.sent).toHaveLength(1);
    expect(e.sent[0].subject).toBe("Hi");
  });
});

describe("DisabledEmail (EMAIL_DRIVER=disabled)", () => {
  it("fails the send so callers never record a skipped mail as sent", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    const { DisabledEmail, EmailDisabledError } = await import("@/server/adapters/email/disabled");
    await expect(new DisabledEmail().send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>" })).rejects.toBeInstanceOf(EmailDisabledError);
  });
});
