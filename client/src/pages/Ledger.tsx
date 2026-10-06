import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';
import type { EmailCapture, EmailLog } from '../types/api.js';
import { Alert, Card, EmptyState, Spinner } from '../components/ui.js';
import { timeAgo } from '../components/badges.js';

export default function LedgerPage() {
  const [captures, setCaptures] = useState<EmailCapture[] | null>(null);
  const [logs, setLogs] = useState<EmailLog[] | null>(null);
  const [tab, setTab] = useState<'captures' | 'emails'>('captures');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.listCaptures().then((r) => setCaptures(r.captures)).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load captures'));
    void api.listEmailLogs().then((r) => setLogs(r.emailLogs)).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load email log'));
  }, []);

  const capturesNull = captures ?? [];
  const logsNull = logs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activity ledger</h1>
        <p className="mt-1 text-sm text-slate-500">Website form captures and every email your CRM has sent.</p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <button onClick={() => setTab('captures')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === 'captures' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200'}`}>
          Captures ({capturesNull.length})
        </button>
        <button onClick={() => setTab('emails')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === 'emails' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200'}`}>
          Emails ({logsNull.length})
        </button>
      </div>

      {tab === 'captures' ? (
        captures === null ? (
          <Spinner label="Loading captures…" />
        ) : captures.length === 0 ? (
          <EmptyState
            title="No form captures yet"
            hint="Embed the public email-capture endpoint in your website's contact form and submissions will show up here."
            action={<Link to="/settings" className="text-sm font-semibold text-teal-600">Capture setup</Link>}
          />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {captures.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{c.fullName || c.email}</p>
                    <p className="truncate text-xs text-slate-500">
                      {c.email}{c.phone ? ` · ${c.phone}` : ''}{c.message ? ` · ${c.message}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{c.captureSource}</span>
                    {c.leadId ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">lead ✓</span> : null}
                    <span>{timeAgo(c.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : logs === null ? (
        <Spinner label="Loading email log…" />
      ) : logs.length === 0 ? (
        <EmptyState title="No emails sent yet" hint="Welcome emails and project updates you send will be recorded here." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {logs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{m.subject}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="capitalize">{m.template.replace('_', ' ')}</span> → {m.toEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${m.provider === 'resend' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                    {m.provider}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${m.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {m.status}
                  </span>
                  <span className="text-slate-400">{timeAgo(m.sentAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}