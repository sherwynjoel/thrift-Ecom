import type { EmailAdapter, EmailMessage } from "./types";

/**
 * EMAIL_DRIVER=disabled: the store runs before an email sender is configured. Nothing is sent and, unlike the
 * console driver, the body is never logged (it can hold addresses or password-reset links) — only that a mail was skipped.
 */
export class DisabledEmail implements EmailAdapter {
  async send(msg: EmailMessage): Promise<void> {
    console.warn(`[email] skipped (EMAIL_DRIVER=disabled): "${msg.subject}"`);
  }
}
