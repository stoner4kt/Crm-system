// ---------------------------------------------------------------------------
// Professional HTML email templates rendered for Resend.
// Each template takes simple params and returns a full HTML document.
// ---------------------------------------------------------------------------

interface TemplateVars {
  businessName: string;
  replyToEmail?: string;
  [key: string]: unknown;
}

export interface LeadWelcomeVars extends TemplateVars {
  firstName?: string;
  service?: string;
  canContactByPhone?: boolean;
  phone?: string;
}

export interface QuoteStatusVars extends TemplateVars {
  firstName?: string;
  projectTitle?: string;
  status?: string;
  estValue?: number;
  currency?: string;
}

export interface ProjectUpdateVars extends TemplateVars {
  firstName?: string;
  projectTitle?: string;
  message?: string;
}

const ACCENT = '#0f766e';
const LIGHT = '#f4f6f8';
const MUTED = '#6b7280';

function shell(body: string, vars: TemplateVars): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(vars.businessName || 'TradePro CRM')}</title>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,${ACCENT},#115e59);padding:28px 32px;">
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
                ${escapeHtml(vars.businessName || 'TradePro CRM')}
              </div>
              <div style="color:#99f6e4;font-size:13px;margin-top:4px;">Service Professionals</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #eef2f6;background-color:#fafbfc;">
              <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;">
                &copy; ${new Date().getFullYear()} ${escapeHtml(vars.businessName || 'TradePro CRM')}. All rights reserved.<br />
                You received this email because of your inquiry with ${escapeHtml(vars.businessName || 'us')}.
                ${vars.replyToEmail ? `<br />Questions? Reply to ${escapeHtml(vars.replyToEmail)}.` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderLeadWelcome(v: LeadWelcomeVars): string {
  const name = v.firstName ? escapeHtml(v.firstName) : 'there';
  const service = v.service ? escapeHtml(v.service) : 'your project';
  return shell(
    `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Thanks for reaching out, ${name}</h1>
      <p>Thank you for contacting <strong>${escapeHtml(v.businessName)}</strong> about <strong>${service}</strong>.</p>
      <p>Your request has been received. A member of our team will review the details and get back to you with
         next steps and a quote within <strong>one business day</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:8px;background-color:${ACCENT};">
            <a href="#"
               style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              View request status
            </a>
          </td>
        </tr>
      </table>
      <p style="color:${MUTED};font-size:13px;">For urgent matters${v.canContactByPhone && v.phone ? `, call us at <a href="tel:${escapeHtml(v.phone)}" style="color:${ACCENT};">${escapeHtml(v.phone)}</a>` : ', please call or reply to this email'}.</p>
    `,
    v,
  );
}

export function renderQuoteStatus(v: QuoteStatusVars): string {
  const firstName = v.firstName ? escapeHtml(v.firstName) : 'there';
  const projectTitle = v.projectTitle ? escapeHtml(v.projectTitle) : 'your project';
  const status = v.status ? escapeHtml(v.status) : 'updated';
  const value = v.estValue ? new Intl.NumberFormat('en-US', { style: 'currency', currency: v.currency || 'USD' }).format(Number(v.estValue)) : null;

  return shell(
    `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Quote Update for ${firstName}</h1>
      <p>Here's the latest on <strong>${projectTitle}</strong>:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px 0 0 8px;background-color:#f9fafb;color:${MUTED};font-size:13px;">Status</td>
          <td style="padding:14px 16px;border:1px solid #e5e7eb;border-left:none;border-radius:0 8px 8px 0;font-weight:600;color:#111827;">${status}</td>
        </tr>
        ${value !== null ? `
        <tr style="height:8px;"><td colspan="2"></td></tr>
        <tr>
          <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px 0 0 8px;background-color:#f9fafb;color:${MUTED};font-size:13px;">Estimated cost</td>
          <td style="padding:14px 16px;border:1px solid #e5e7eb;border-left:none;border-radius:0 8px 8px 0;font-weight:600;color:${ACCENT};">${value}</td>
        </tr>` : ''}
      </table>
      <p style="color:${MUTED};font-size:13px;">If you have any questions about this update, just reply to this email.</p>
    `,
    v,
  );
}

export function renderProjectUpdate(v: ProjectUpdateVars): string {
  const firstName = v.firstName ? escapeHtml(v.firstName) : 'there';
  const projectTitle = v.projectTitle ? escapeHtml(v.projectTitle) : 'your project';
  const message = v.message ? escapeHtml(v.message) : 'We wanted to keep you updated on your project.';
  return shell(
    `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Project Update: ${projectTitle}</h1>
      <p style="font-size:15px;">${message}</p>
      <p style="color:${MUTED};font-size:13px;margin-top:20px;">Thank you for trusting ${escapeHtml(v.businessName)} with your work. Feel free to reply with any questions.</p>
    `,
    v,
  );
}

export type EmailTemplateName = 'lead_welcome' | 'quote_status' | 'project_update';

export function renderTemplate(name: EmailTemplateName, vars: TemplateVars): string {
  switch (name) {
    case 'lead_welcome':
      return renderLeadWelcome(vars as LeadWelcomeVars);
    case 'quote_status':
      return renderQuoteStatus(vars as QuoteStatusVars);
    case 'project_update':
      return renderProjectUpdate(vars as ProjectUpdateVars);
    default:
      throw new Error(`Unknown template: ${name}`);
  }
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}