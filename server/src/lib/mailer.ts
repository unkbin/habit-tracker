import { config } from "../config.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type EmailTransport = (email: Email) => Promise<void> | void;

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendTransport(apiKey: string, from: string): EmailTransport {
  return async (email) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
    }
  };
}

// Without an API key (local development) emails are printed so reset links can be clicked.
const consoleTransport: EmailTransport = (email) => {
  console.info(`\n--- email to ${email.to}: ${email.subject} ---\n${email.text}\n---\n`);
};

let transport: EmailTransport =
  config.RESEND_API_KEY && config.EMAIL_FROM
    ? createResendTransport(config.RESEND_API_KEY, config.EMAIL_FROM)
    : consoleTransport;

/** Tests swap in a transport that records emails. */
export function setEmailTransport(next: EmailTransport): void {
  transport = next;
}

export async function sendEmail(email: Email): Promise<void> {
  await transport(email);
}
