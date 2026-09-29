import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailAdapter, EmailMessage } from "./types";

export class SesEmail implements EmailAdapter {
  private readonly client: SESClient;
  constructor(private readonly from: string, region: string) {
    this.client = new SESClient({ region });
  }
  async send(msg: EmailMessage): Promise<void> {
    await this.client.send(new SendEmailCommand({
      Source: this.from,
      Destination: { ToAddresses: [msg.to] },
      Message: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: { Html: { Data: msg.html, Charset: "UTF-8" }, ...(msg.text ? { Text: { Data: msg.text, Charset: "UTF-8" } } : {}) },
      },
    }));
  }
}
