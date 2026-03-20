// Outgoing email with nodemailer. MAIL_TRANSPORT decides where it goes:
//   file  development: each message is written as an .eml file to MAIL_DIR (backend/storage/mail),
//         to open in any mail app; nothing leaves the machine
//   smtp  the provider's SMTP server (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
//   off   nothing is sent and the outbox keeps the messages until a transport is set
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

const SAFE_OPTIONS = { disableFileAccess: true, disableUrlAccess: true };

export function createMailer(env) {
  if (env.MAIL_TRANSPORT === 'file') {
    const dir = path.resolve(env.MAIL_DIR);
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows', ...SAFE_OPTIONS });
    return {
      enabled: true,
      kind: 'file',
      dir,
      /** name labels the file (template and outbox row); the address is never in the file name. */
      async send({ to, subject, text, html, messageId, name = 'message' }) {
        const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html, messageId });
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(name).replace(/[^\w-]/g, '')}.eml`);
        await writeFile(file, info.message, { mode: 0o600 });
        return { file };
      },
    };
  }
  if (env.MAIL_TRANSPORT !== 'smtp') return { enabled: false, kind: 'off', send: async () => ({ skipped: true }) };
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // fail fast so one slow provider does not hold the outbox relay
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    ...SAFE_OPTIONS,
  });
  return {
    enabled: true,
    kind: 'smtp',
    /** messageId makes a retried send recognisable to the provider. */
    send: ({ to, subject, text, html, messageId }) => transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html, messageId }),
  };
}
