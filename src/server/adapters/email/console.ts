import type { EmailAdapter, EmailMessage } from "./types";

export class ConsoleEmail implements EmailAdapter {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    console.log(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text ?? msg.html}`);
  }
}
