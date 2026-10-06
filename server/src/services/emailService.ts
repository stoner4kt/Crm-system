import { Resend } from 'resend';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { renderTemplate, type EmailTemplateName } from '../templates/emails.js';
import type { Store } from '../store/Store.js';
import type { EmailLogInput } from '../store/Store.js';

export interface SendEmailInput {
  userId: string;
  toEmail: string;
  template: EmailTemplateName;
  vars: {
    businessName: string;
    replyToEmail?: string;
    [key: string]: unknown;
  };
  leadId?: string;
  clientId?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: 'resend' | 'console';
  messageId?: string;
  logId?: string;
}

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!config.resend.configured) return null;
  if (!resend) resend = new Resend(config.resend.apiKey);
  return resend;
}

// ---------------------------------------------------------------------------
// Email service — sends professional emails through Resend. When Resend is not
// configured, falls back to logging the rendered email to the console so the
// system remains fully usable in development.
// ---------------------------------------------------------------------------
export async function sendEmail(store: Store, input: SendEmailInput): Promise<SendEmailResult> {
  const html = renderTemplate(input.template, input.vars);
  const subject = buildSubject(input.template, input.vars);

  const client = getResend();
  if (!client) {
    logger.info('Resend not configured — email logged to console', {
      to: input.toEmail,
      subject,
      template: input.template,
    });
    // Pretty-print the HTML so it's readable in dev logs without the clutter.
    const pretty = html.replace(/\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
    logger.debug(`[console-email] To: ${input.toEmail} | Subject: ${subject} | ${pretty.slice(0, 2000)}`);

    const logEntry: EmailLogInput = {
      toEmail: input.toEmail,
      subject,
      template: input.template,
      status: 'sent',
      provider: 'console',
      leadId: input.leadId,
      clientId: input.clientId,
    };
    const log = await store.logEmail(input.userId, logEntry);
    return { ok: true, provider: 'console', logId: log.id };
  }

  try {
    const { data, error } = await client.emails.send({
      from: input.fromEmail || config.resend.fromEmail,
      to: [input.toEmail],
      subject,
      html,
      ...(input.replyTo || config.resend.replyTo ? { reply_to: [input.replyTo || config.resend.replyTo] } : {}),
    });
    if (error || !data) {
      throw new Error(error?.message || 'Resend send failed');
    }

    const logEntry: EmailLogInput = {
      toEmail: input.toEmail,
      subject,
      template: input.template,
      status: 'sent',
      provider: 'resend',
      leadId: input.leadId,
      clientId: input.clientId,
    };
    const log = await store.logEmail(input.userId, logEntry);
    logger.info('Email sent via Resend', { id: data.id, to: input.toEmail, template: input.template });
    return { ok: true, provider: 'resend', messageId: data.id, logId: log.id };
  } catch (err) {
    logger.error('Resend send failed', { err: (err as Error).message, to: input.toEmail });
    await store.logEmail(input.userId, {
      toEmail: input.toEmail,
      subject,
      template: input.template,
      status: 'failed',
      provider: 'resend',
      leadId: input.leadId,
      clientId: input.clientId,
    });
    return { ok: false, provider: 'resend' };
  }
}

function buildSubject(name: EmailTemplateName, vars: Record<string, unknown>): string {
  const biz = String(vars.businessName || '');
  switch (name) {
    case 'lead_welcome':
      return `Thanks for reaching out — ${biz}`;
    case 'quote_status':
      return `Quote update from ${biz}`;
    case 'project_update':
      return `Project update from ${biz}`;
    default:
      return `Update from ${biz}`;
  }
}