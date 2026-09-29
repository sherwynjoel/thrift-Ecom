export interface EmailMessage { to: string; subject: string; html: string; text?: string }
export interface EmailAdapter { send(msg: EmailMessage): Promise<void> }
