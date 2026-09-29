import { describe, expect, it } from "vitest";
import { ConsoleEmail } from "@/server/adapters/email/console";

describe("ConsoleEmail", () => {
  it("records messages instead of sending", async () => {
    const e = new ConsoleEmail();
    await e.send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>" });
    expect(e.sent).toHaveLength(1);
    expect(e.sent[0].subject).toBe("Hi");
  });
});
