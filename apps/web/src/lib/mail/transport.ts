import 'server-only';

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { getEnv } from '@/lib/env';

/**
 * The one place this application talks SMTP.
 *
 * ## Why the sender is an injected function, not a module the outbox imports
 *
 * The outbox's job is the delivery *policy* — claim, retry, back off, give up.
 * SMTP is the transport. Splitting them means the policy is testable without a
 * mail server and the transport is swappable (a provider SDK, an in-memory
 * recorder in tests) without touching the retry logic.
 *
 * ## Configuration
 *
 * Defaults target Mailpit on `localhost:1025`: plain SMTP, no auth, every
 * message visible in a web UI. That is the development and CI path. A real
 * provider sets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and, on
 * port 465, `SMTP_SECURE=true`. Production refuses to boot without a host —
 * see the refinement in `lib/env.ts`.
 */

/** The minimum a transport needs to know. Kept separate from the outbox row. */
export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailSender = (mail: OutgoingMail) => Promise<void>;

let transporter: Transporter | null = null;

function buildTransporter(): Transporter {
  const env = getEnv();

  const host = env.SMTP_HOST ?? 'localhost';
  const port = env.SMTP_PORT ?? 1025;

  /**
   * `secure` and STARTTLS are different things and confusing them is the classic
   * mail misconfiguration: `secure: true` means TLS from the first byte (465),
   * while 587 and 1025 negotiate STARTTLS on a plaintext connection. Nodemailer
   * upgrades on 587 by itself when the server advertises it.
   */
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;

  /**
   * Timeouts are mandatory, not defensive tuning. Without them a firewall that
   * accepts the TCP connection and never speaks SMTP leaves the dispatcher hung
   * on `await` forever, which stalls every later message in the same run.
   */
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/**
 * Sends one message through SMTP.
 *
 * `envelope.from` comes from configuration, never from the message: the `to`
 * address and every interpolated value in the body are user-controlled data,
 * and letting any of them shape the envelope is how header injection starts.
 * Nodemailer additionally rejects CRLF in addresses.
 */
export function getMailSender(): MailSender {
  return async (mail) => {
    const env = getEnv();
    transporter ??= buildTransporter();

    await transporter.sendMail({
      from: env.EMAIL_FROM ?? 'VulDetected <no-reply@localhost>',
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  };
}

/** Test seam: drop the pooled connection so the next send rebuilds it. */
export function resetMailTransportForTesting(): void {
  transporter?.close();
  transporter = null;
}
