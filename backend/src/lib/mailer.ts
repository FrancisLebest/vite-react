import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

/** Hook for tests to capture outgoing mails. */
export const sentMails: { to: string; subject: string; text: string }[] = [];

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (config.isTest) {
    sentMails.push({ to, subject, text });
    return;
  }
  if (!transporter) {
    logger.warn({ to, subject }, `SMTP not configured, email content follows:\n${text}`);
    return;
  }
  try {
    await transporter.sendMail({ from: config.MAIL_FROM, to, subject, text });
  } catch (err) {
    logger.error({ err, to }, 'Failed to send email');
  }
}
