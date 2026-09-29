import nodemailer, { type Transporter } from "nodemailer";
import type { EmailAdapter, EmailMessage } from "./types";

export class SmtpEmail implements EmailAdapter {
  private readonly transport: Transporter;
  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  }
}
