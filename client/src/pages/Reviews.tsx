import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../lib/api.js';
import type { ReviewFlowLead, ReviewFlowLeadStatus, ReviewFlowOverview, ReviewFlowReviewRequest, ReviewFlowSettings } from '../types/api.js';
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from '../components/ui.js';
import { Modal } from '../components/Modal.js';

// ---- ReviewFlow admin page (combined dashboard, single CRM login) ----
// Every request goes through the authenticated CRM API proxy, so the user
// never needs a separate ReviewFlow account.

type ReviewTab = 'overview' | 'leads' | 'history' | 'email' | 'settings';

const TABS: { id: ReviewTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'leads', label: 'Leads' },
  { id: 'history', label: 'Review History' },
  { id: 'email', label: 'Email Builder' },
  { id: 'settings', label: 'Settings' },
];

const REVIEW_STATUSES: ReviewFlowLeadStatus[] = ['new', 'in_progress', 'complete', 'review_sent', 'cancelled'];

const STATUS_LABELS: Record<ReviewFlowLeadStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  complete: 'Complete',
  review_sent: 'Review Sent',
  cancelled: 'Cancelled',
};

const STATUS_TONES: Record<ReviewFlowLeadStatus, string> = {
  new: 'slate',
  in_progress: 'cyan',
  complete: 'emerald',
  review_sent: 'amber',
  cancelled: 'rose',
};

function statusBadge(status: ReviewFlowLeadStatus) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    cyan: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return tones[STATUS_TONES[status]] ?? tones.slate;
}

function fmtLocal(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return fmtShort(iso);
}

function formatDelay(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (hours % 24 === 0) return `${hours / 24} day${hours / 24 === 1 ? '' : 's'}`;
  return `${hours} hours`;
}

// ---- Shared bits ----

function ReviewPageHeader({ settings }: { settings: ReviewFlowSettings | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ReviewFlow</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review requests &amp; pipeline{settings?.business_name ? ` for ${settings.business_name}` : ''}. Powered by ReviewFlow by Conextsol.
        </p>
      </div>
    </div>
  );
}

// ---- Overview tab ----
function OverviewTab({
  leads,
  reviewRequests,
  onOpenLead,
}: {
  leads: ReviewFlowLead[];
  reviewRequests: ReviewFlowReviewRequest[];
  onOpenLead: (lead: ReviewFlowLead) => void;
}) {
  const values = {
    total: leads.length,
    active: leads.filter((l) => l.status === 'in_progress').length,
    sent: reviewRequests.length,
    awaiting: leads.filter((l) => l.status === 'complete').length,
  };
  const cards = [
    { key: 'total', label: 'Total Leads', value: values.total, color: 'text-slate-600' },
    { key: 'active', label: 'Active Jobs', value: values.active, color: 'text-sky-600' },
    { key: 'sent', label: 'Reviews Sent', value: values.sent, color: 'text-amber-600' },
    { key: 'awaiting', label: 'Awaiting Review', value: values.awaiting, color: 'text-emerald-600' },
  ] as const;

  const recent = [...leads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className={`mt-2 text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <Card title="Recent Leads" subtitle="Latest 5 enquiries across your review pipeline">
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No leads in ReviewFlow yet. Mark a project complete in the CRM to auto-create one.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((lead) => (
              <li key={lead.id}>
                <button
                  onClick={() => onOpenLead(lead)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {lead.first_name} {lead.last_name}
                      {lead.service && <span className="font-normal text-slate-500"> · {lead.service}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(lead.created_at)}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(lead.status)}`}>
                    {STATUS_LABELS[lead.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- Leads board tab ----
function LeadsTab({
  leads,
  onOpenLead,
  onAdd,
  onChanged,
  onToast,
}: {
  leads: ReviewFlowLead[];
  onOpenLead: (lead: ReviewFlowLead) => void;
  onAdd: () => void;
  onChanged: () => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState<ReviewFlowLeadStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = leads.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.service ?? '').toLowerCase().includes(q)
    );
  });

  const groups = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, filtered.filter((l) => l.status === s)])) as Record<ReviewFlowLeadStatus, ReviewFlowLead[]>;

  const hasPending = leads.some((l) => l.status === 'complete' && l.review_send_after && l.review_send_after <= new Date().toISOString());

  const move = async (leadId: string, status: ReviewFlowLeadStatus) => {
    setBusy(true);
    try {
      await api.updateReviewFlowLead(leadId, { status });
      onToast('Lead updated.', 'success');
      await onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to update lead', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or service…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-teal-500"
          />
        </div>
        <div className="flex items-center gap-2.5">
          {hasPending && (
            <Button variant="secondary" onClick={() => onToast('Use the lead rows to send each pending review.', 'info')}>
              Pending reviews ready
            </Button>
          )}
          <Button onClick={onAdd}>+ Add Lead</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {REVIEW_STATUSES.map((status) => {
          const items = groups[status];
          const barColor: Record<ReviewFlowLeadStatus, string> = {
            new: 'bg-slate-400',
            in_progress: 'bg-sky-500',
            complete: 'bg-emerald-500',
            review_sent: 'bg-amber-500',
            cancelled: 'bg-rose-400',
          };
          const headColor: Record<ReviewFlowLeadStatus, string> = {
            new: 'text-slate-500',
            in_progress: 'text-sky-600',
            complete: 'text-emerald-600',
            review_sent: 'text-amber-600',
            cancelled: 'text-rose-500',
          };
          return (
            <div
              key={status}
              className={`flex flex-col rounded-xl border bg-white shadow-sm transition-colors ${dragOver === status ? 'border-teal-400 ring-2 ring-teal-500/20' : 'border-slate-200'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
              onDragLeave={() => setDragOver((d) => (d === status ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/lead-id');
                if (!id || busy) return;
                void move(id, status);
              }}
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-3">
                <span className={`h-2 w-2 rounded-full ${barColor[status]}`} />
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${headColor[status]}`}>{STATUS_LABELS[status]}</h3>
                <span className="ml-auto text-[11px] text-slate-400">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2.5">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">{search ? 'No matches' : `No ${STATUS_LABELS[status].toLowerCase()} leads`}</p>
                ) : (
                  items.map((lead) => (
                    <button
                      key={lead.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/lead-id', lead.id)}
                      onClick={() => onOpenLead(lead)}
                      className="w-full rounded-lg border border-slate-200 border-l-2 border-l-slate-400 bg-white p-3 text-left shadow-sm transition hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {lead.first_name} {lead.last_name}
                          </p>
                          {lead.service && <p className="truncate text-[11px] text-slate-400">{lead.service}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {lead.source}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-xs text-slate-500">{lead.email}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-400">Drag cards between columns to change status. Click a card for details.</p>
    </div>
  );
}

// ---- Review history tab ----
function HistoryTab({
  reviewRequests,
  leads,
  onResend,
  sending,
}: {
  reviewRequests: ReviewFlowReviewRequest[];
  leads: ReviewFlowLead[];
  onResend: (leadId: string) => void;
  sending?: boolean;
}) {
  const [search, setSearch] = useState('');
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const rows = [...reviewRequests].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const lead = leadById.get(r.lead_id);
    const name = `${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`.toLowerCase();
    return r.recipient_email.toLowerCase().includes(q) || name.includes(q) || r.email_subject?.toLowerCase().includes(q);
  });

  const badge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      sent: { label: 'Sent', cls: 'bg-sky-50 text-sky-700' },
      delivered: { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-700' },
      bounced: { label: 'Bounced', cls: 'bg-rose-50 text-rose-700' },
      failed: { label: 'Failed', cls: 'bg-rose-50 text-rose-700' },
    };
    const b = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search review requests…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-teal-500"
        />
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No review requests sent yet</p>
            <p className="mt-1 text-xs text-slate-400">
              {search ? 'Try a different search term.' : 'Review emails will appear here once sent.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recipient</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sent</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Triggered</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const lead = leadById.get(r.lead_id);
                  const canResend = r.status === 'bounced' || r.status === 'failed';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.recipient_name || <span className="text-slate-400">Unknown</span>}</p>
                        <p className="text-xs text-slate-400">{r.recipient_email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtLocal(r.sent_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.triggered_by === 'auto' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                          {r.triggered_by === 'auto' ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{badge(r.status)}</td>
                      <td className="px-4 py-3 text-right">
                        {canResend ? (
                          <button
                            onClick={() => lead && onResend(lead.id)}
                            disabled={sending || !lead}
                            className="text-xs font-medium text-amber-600 hover:text-amber-500 disabled:opacity-50"
                          >
                            Resend
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- Email builder tab ----
function EmailBuilderTab({ settings, onSettingsUpdated, onToast }: {
  settings: ReviewFlowSettings;
  onSettingsUpdated: (s: ReviewFlowSettings) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [subject, setSubject] = useState(settings.email_subject_template);
  const [intro, setIntro] = useState(settings.email_intro_text);
  const [buttonText, setButtonText] = useState(settings.email_button_text);
  const [brandColor, setBrandColor] = useState(settings.email_brand_color);
  const [hexColor, setHexColor] = useState(settings.email_brand_color);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSubject(settings.email_subject_template);
    setIntro(settings.email_intro_text);
    setButtonText(settings.email_button_text);
    setBrandColor(settings.email_brand_color);
    setHexColor(settings.email_brand_color);
  }, [settings]);

  const resolve = (s: string) =>
    s
      .replace(/{{first_name}}/g, 'Jane')
      .replace(/{{business_name}}/g, settings.business_name || 'your business')
      .replace(/{{service}}/g, 'Plumbing repair');

  const html = buildEmailHtml({
    businessName: settings.business_name,
    firstName: 'Jane',
    introText: resolve(intro),
    buttonText,
    reviewUrl: settings.google_review_url || '#',
    brandColor,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateReviewFlowSettings({
        email_subject_template: subject,
        email_intro_text: intro,
        email_button_text: buttonText,
        email_brand_color: brandColor,
      });
      onToast('Email template saved.', 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card title="Email Template" subtitle="Merge tags: {{first_name}}, {{business_name}}, {{service}}">
        <div className="space-y-4">
          <Field label="Subject line">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Thank you for choosing {{business_name}} — we'd love your feedback!" />
          </Field>
          <Field label="Intro paragraph">
            <Textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="This appears above the review button…" />
          </Field>
          <Field label="Button text">
            <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Leave a Google Review" />
          </Field>
          <Field label="Brand colour">
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => { setBrandColor(e.target.value); setHexColor(e.target.value); }}
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent"
              />
              <Input
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                onBlur={() => /^#[0-9a-fA-F]{6}$/.test(hexColor) && setBrandColor(hexColor)}
                className="w-28 font-mono"
              />
            </div>
          </Field>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
        </div>
      </Card>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">Live preview</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{resolve(subject)}</p>
        </div>
        <div className="p-4">
          <div className="overflow-hidden rounded-xl">
            <div className="pointer-events-none w-[125%] origin-top-left scale-[0.8]" dangerouslySetInnerHTML={{ __html: stripDocWrapper(html) }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function stripDocWrapper(doc: string): string {
  return doc
    .replace(/<!DOCTYPE html>/i, '')
    .replace(/<html[^>]*>/i, '')
    .replace(/<\/html>/i, '')
    .replace(/<body[^>]*>/i, '')
    .replace(/<\/body>/i, '')
    .trim();
}

function buildEmailHtml({ businessName, firstName, introText, buttonText, reviewUrl, brandColor }: {
  businessName: string;
  firstName: string;
  introText: string;
  buttonText: string;
  reviewUrl: string;
  brandColor: string;
}) {
  const name = escapeHtml(businessName || '');
  const safeIntro = escapeHtml(introText || '');
  const safeButton = escapeHtml(buttonText || 'Leave a Google Review');
  const safeUrl = escapeHtml(reviewUrl || '#');
  const color = /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#0ea5e9';
  const background = 'linear-gradient(135deg,#0b0f19 0%,#0d1629 50%,#1a2234 100%)';
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#0b0f19;">
    <div style="background:${background};padding:32px 24px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #1a2234;">
          <div style="font-family:Arial,sans-serif;font-size:24px;font-weight:bold;color:#ffffff;">ReviewFlow</div>
          ${name ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;margin-top:4px;">${name}</div>` : ''}
        </div>
        <div style="padding:28px 8px 8px 8px;">
          <p style="font-family:Arial,sans-serif;font-size:16px;color:#e2e8f0;margin:0 0 12px 0;">Hi ${firstName},</p>
          <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#94a3b8;margin:0 0 24px 0;">${safeIntro}</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;padding:14px 32px;border-radius:8px;">${safeButton}</a>
          </div>
          <p style="font-family:Arial,sans-serif;font-size:12px;color:#64748b;text-align:center;margin:8px 0 0 0;">Takes 60 seconds</p>
        </div>
        <div style="text-align:center;padding-top:20px;margin-top:20px;border-top:1px solid #1a2234;">
          <p style="font-family:Arial,sans-serif;font-size:11px;color:#64748b;margin:0;">Sent by ${name || 'this business'} · Powered by ReviewFlow by Conextsol</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Settings tab ----
function ReviewSettingsTab({ settings, onSettingsUpdated, onToast }: {
  settings: ReviewFlowSettings;
  onSettingsUpdated: (s: ReviewFlowSettings) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [delayDraft, setDelayDraft] = useState(settings.auto_send_delay_hours);

  useEffect(() => setDelayDraft(settings.auto_send_delay_hours), [settings.auto_send_delay_hours]);

  const saveField = async (field: keyof ReviewFlowSettings, value: string | number | boolean) => {
    setBusy(field as string);
    try {
      const res = await api.updateReviewFlowSettings({ [field]: value });
      onSettingsUpdated(res.settings);
      onToast('Settings saved.', 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to save settings', 'error');
    } finally {
      setBusy(null);
    }
  };

  const widgets: { url: string; title: string; code: string }[] = useMemo(() => {
    const appUrl = (import.meta.env.VITE_APP_URL as string) || 'https://your-app.pages.dev';
    const widgetSrc = `${appUrl.replace(/\/$/, '')}/widget.js`;
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://<ref>.supabase.co';
    const script = `<!-- Paste this before the closing </body> tag -->
<script src="${widgetSrc}" data-api-key="${settings.widget_api_key}" data-supabase-url="${supabaseUrl}" data-position="bottom-right" data-color="#0ea5e9" data-button-text="Get in Touch"></script>`;
    const capture = `// For use with your existing contact form
ReviewFlow.capture({ first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', phone: '0821234567', service: 'Plumbing repair', message: 'Optional notes' });`;
    return [
      { url: 'script', title: 'Script Tag', code: script },
      { url: 'capture', title: 'Capture Function', code: capture },
    ];
  }, [settings.widget_api_key]);

  const [widgetTab, setWidgetTab] = useState('script');
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    if (!confirmRegen) { setConfirmRegen(true); return; }
    setRegenerating(true);
    try {
      const res = await api.rotateReviewFlowWidgetKey();
      onSettingsUpdated({ ...settings, widget_api_key: res.widget_api_key });
      onToast('API key regenerated. The old key no longer works.', 'success');
      setConfirmRegen(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to regenerate API key', 'error');
      setConfirmRegen(false);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="Business Info">
          <div className="grid gap-4">
            <Field label="Business name">
              <Input defaultValue={settings.business_name} onBlur={(e) => e.target.value !== settings.business_name && void saveField('business_name', e.target.value)} />
            </Field>
            <Field label="Google review URL">
              <Input defaultValue={settings.google_review_url} onBlur={(e) => e.target.value !== settings.google_review_url && void saveField('google_review_url', e.target.value)} placeholder="https://g.page/r/…" />
            </Field>
          </div>
        </Card>

        <Card title="Email Sending">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From display name">
              <Input defaultValue={settings.review_from_name} onBlur={(e) => e.target.value !== settings.review_from_name && void saveField('review_from_name', e.target.value)} />
            </Field>
            <Field label="From email address">
              <Input type="email" defaultValue={settings.review_from_email} onBlur={(e) => e.target.value !== settings.review_from_email && void saveField('review_from_email', e.target.value)} placeholder="reviews@yourbusiness.co.za" />
            </Field>
            <Field label="Reply-to email">
              <Input type="email" defaultValue={settings.review_reply_to_email} onBlur={(e) => e.target.value !== settings.review_reply_to_email && void saveField('review_reply_to_email', e.target.value)} placeholder="hello@yourbusiness.co.za" />
            </Field>
          </div>
          {!settings.review_from_email && <p className="mt-3 text-xs text-amber-600">⚠ From address must be verified in Resend before emails can send.</p>}
        </Card>

        <Card title="Automation">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Auto-send review request</p>
                <p className="text-xs text-slate-500">Send automatically when a job is marked complete</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.auto_send_enabled}
                onClick={() => void saveField('auto_send_enabled', !settings.auto_send_enabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings.auto_send_enabled ? 'bg-teal-600' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.auto_send_enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Send after — {formatDelay(delayDraft)}</p>
              <input
                type="range"
                min={1}
                max={168}
                value={delayDraft}
                onChange={(e) => setDelayDraft(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              {delayDraft !== settings.auto_send_delay_hours && (
                <button
                  onClick={() => void saveField('auto_send_delay_hours', delayDraft)}
                  disabled={busy === 'auto_send_delay_hours'}
                  className="mt-2 rounded-md border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
                >
                  Save delay ({formatDelay(delayDraft)})
                </button>
              )}
              <p className="mt-2 text-xs text-slate-400">The review request will send automatically after this delay. You can still send manually at any time.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Widget &amp; Integration">
          <div className="mb-3 flex flex-wrap gap-2">
            {widgets.map((w) => (
              <button
                key={w.url}
                onClick={() => setWidgetTab(w.url)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${widgetTab === w.url ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                {w.title}
              </button>
            ))}
          </div>
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">{widgets.find((w) => w.url === widgetTab)?.code}</pre>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Widget API key</p>
                <p className="mt-0.5 text-xs text-slate-500">Authenticates widget submissions. Rotating it immediately invalidates the old key.</p>
              </div>
              <button
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  confirmRegen
                    ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-500'
                    : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                }`}
              >
                {confirmRegen ? 'Confirm — old key stops working' : regenerating ? 'Regenerating…' : 'Regenerate API key'}
              </button>
            </div>
            <p className="mt-3 break-all text-[11px] font-mono text-slate-500">{settings.widget_api_key || '—'}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---- Add/Edit lead modal ----
function LeadModal({ lead, onClose, onSaved, onSendReview }: {
  lead: ReviewFlowLead | null;
  onClose: () => void;
  onSaved: () => void;
  onSendReview?: (id: string) => Promise<void>;
}) {
  const initial = lead
    ? { first_name: lead.first_name, last_name: lead.last_name, email: lead.email, phone: lead.phone ?? '', service: lead.service ?? '', message: lead.message ?? '', status: lead.status }
    : { first_name: '', last_name: '', email: '', phone: '', service: '', message: '', status: 'new' as ReviewFlowLeadStatus };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [sendingReview, setSendingReview] = useState(false);

  const handleSendReview = async () => {
    if (!lead || !onSendReview) return;
    setSendingReview(true);
    try {
      await onSendReview(lead.id);
    } finally {
      setSendingReview(false);
    }
  };

  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) { setError('Email is required.'); return; }
    setError(''); setSaving(true);
    try {
      if (lead) await api.updateReviewFlowLead(lead.id, { ...form, email: form.email.toLowerCase().trim() });
      else await api.createReviewFlowLead({ ...form, email: form.email.toLowerCase().trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!showDelete) { setShowDelete(true); return; }
    setSaving(true);
    try {
      await api.deleteReviewFlowLead(lead.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lead.');
      setSaving(false);
    }
  };

  return (
    <Modal title={lead ? 'Lead details' : 'Add lead'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input value={form.first_name} onChange={set('first_name')} placeholder="Jane" />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={set('last_name')} placeholder="Smith" />
          </Field>
        </div>

        <Field label="Email *">
          <Input type="email" required value={form.email} onChange={set('email')} placeholder="jane@example.com" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="0821234567" />
          </Field>
          <Field label="Service">
            <Input value={form.service} onChange={set('service')} placeholder="Plumbing repair" />
          </Field>
        </div>

        <Field label="Notes / message">
          <Textarea rows={3} value={form.message} onChange={set('message')} placeholder="Optional notes from the enquiry" />
        </Field>

        <Field label="Status">
          <select value={form.status} onChange={set('status')} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500">
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        {lead && (lead.status === 'complete' || lead.status === 'review_sent') && onSendReview && (
          <Button type="button" variant="secondary" onClick={() => void handleSendReview()} disabled={sendingReview} className="w-full">
            {sendingReview ? 'Sending…' : 'Send Review Request Now'}
          </Button>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {lead ? (
            <Button type="button" variant={showDelete ? 'danger' : 'secondary'} size="sm" onClick={() => void handleDelete()} disabled={saving}>
              {showDelete ? 'Confirm delete?' : 'Delete'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function ReviewsPage() {
  const [overview, setOverview] = useState<ReviewFlowOverview | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<ReviewTab>('overview');
  const [selected, setSelected] = useState<ReviewFlowLead | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' | 'info' }[]>([]);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.getReviewFlowOverview();
      setOverview(res.overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ReviewFlow');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendReview = useCallback(async (leadId: string) => {
    setSendingId(leadId);
    try {
      await api.sendReviewFlowLeadReview(leadId);
      pushToast('Review request sent.', 'success');
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Failed to send review request', 'error');
    } finally {
      setSendingId(null);
    }
  }, [load, pushToast]);

  if (!api.isReviewsIntegrationEnabled()) {
    return (
      <Alert tone="error">
        ReviewFlow integration is disabled for this build. Set <code>VITE_ENABLE_REVIEWS_INTEGRATION=true</code> in the Pages build env and redeploy.
      </Alert>
    );
  }

  const settings = overview?.settings ?? null;
  const leads = overview?.leads ?? [];
  const reviewRequests = overview?.review_requests ?? [];

  return (
    <div className="space-y-6">
      <ReviewPageHeader settings={settings} />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overview === null && !error ? (
        <Spinner label="Loading ReviewFlow…" />
      ) : (
        <>
          {tab === 'overview' && <OverviewTab leads={leads} reviewRequests={reviewRequests} onOpenLead={setSelected} />}
          {tab === 'leads' && (
            <LeadsTab
              leads={leads}
              onOpenLead={setSelected}
              onAdd={() => setShowAdd(true)}
              onChanged={load}
              onToast={(m, t) => pushToast(m, t ?? 'info')}
            />
          )}
          {tab === 'history' && (
            <HistoryTab
              reviewRequests={reviewRequests}
              leads={leads}
              onResend={sendReview}
              sending={sendingId !== null}
            />
          )}
          {tab === 'email' && settings && (
            <EmailBuilderTab settings={settings} onSettingsUpdated={(s) => setOverview((o) => o ? { ...o, settings: s } : o)} onToast={(m, t) => pushToast(m, t ?? 'info')} />
          )}
          {tab === 'settings' && settings && (
            <ReviewSettingsTab settings={settings} onSettingsUpdated={(s) => setOverview((o) => o ? { ...o, settings: s } : o)} onToast={(m, t) => pushToast(m, t ?? 'info')} />
          )}
        </>
      )}

      {selected && settings && (
        <LeadModal
          lead={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); void load(); }}
          onSendReview={sendReview}
        />
      )}
      {showAdd && (
        <LeadModal
          lead={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); void load(); }}
        />
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
                t.type === 'success' ? 'border-emerald-200 bg-white text-emerald-700' : t.type === 'error' ? 'border-rose-200 bg-white text-rose-700' : 'border-sky-200 bg-white text-sky-700'
              }`}
            >
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}