import type { EmailAdapter, EmailMessage } from "./types";

/** Thrown instead of "sending", so callers that stamp a sent-at never record a mail that didn't go out. */
export class EmailDisabledError extends Error {
  constructor() {
    super("Email is not set up yet (EMAIL_DRIVER=disabled)");
    this.name = "EmailDisabledError";
  }
}

/**
 * EMAIL_DRIVER=disabled: the store runs before an email sender is configured. Nothing is sent and, unlike the
 * console driver, the body is never logged (it can hold addresses or password-reset links) — only that a mail was skipped.
 * Sends fail with EmailDisabledError so jobs release their claims and alerts still go out once email is switched on.
 */
export class DisabledEmail implements EmailAdapter {
  async send(msg: EmailMessage): Promise<void> {
    console.warn(`[email] skipped (EMAIL_DRIVER=disabled): "${msg.subject}"`);
    throw new EmailDisabledError();
  }
}
