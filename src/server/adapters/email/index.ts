import { ConsoleEmail } from "./console";
import { SesEmail } from "./ses";
import { SmtpEmail } from "./smtp";
import type { EmailAdapter } from "./types";

export type { EmailAdapter, EmailMessage } from "./types";
export { ConsoleEmail } from "./console";

let cached: EmailAdapter | undefined;

export function getEmail(): EmailAdapter {
  if (cached) return cached;
  if (process.env.EMAIL_DRIVER === "ses") {
    const from = process.env.EMAIL_FROM;
    const region = process.env.AWS_REGION;
    if (!from || !region) throw new Error("EMAIL_FROM and AWS_REGION are required when EMAIL_DRIVER=ses");
    cached = new SesEmail(from, region);
  } else if (process.env.EMAIL_DRIVER === "smtp") {
    const url = process.env.SMTP_URL;
    const from = process.env.EMAIL_FROM;
    if (!url || !from) throw new Error("SMTP_URL and EMAIL_FROM are required when EMAIL_DRIVER=smtp");
    cached = new SmtpEmail(url, from);
  } else {
    cached = new ConsoleEmail();
  }
  return cached;
}
