import { describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { SmtpEmail } from "@/server/adapters/email/smtp";

describe("SmtpEmail", () => {
  it("sends through a transport built from SMTP_URL", async () => {
    const mail = new SmtpEmail("smtps://user:pass@smtp.example.com:465", "Shop <no-reply@example.com>");
    await mail.send({ to: "a@b.c", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(createTransport).toHaveBeenCalledWith("smtps://user:pass@smtp.example.com:465");
    expect(sendMail).toHaveBeenCalledWith({ from: "Shop <no-reply@example.com>", to: "a@b.c", subject: "Hi", html: "<p>hi</p>", text: "hi" });
  });
});
