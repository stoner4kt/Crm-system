import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError } from '../lib/api.js';
import type { Lead, LeadStatus } from '../types/api.js';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../components/ui.js';
import { Modal } from '../components/Modal.js';
import { LEAD_STATUSES, LeadStatusBadge, fmtMoney, timeAgo } from '../components/badges.js';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.listLeads(params);
      setLeads(res.leads);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads');
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: leads?.length ?? 0 };
    for (const l of leads ?? []) out[l.status] = (out[l.status] ?? 0) + 1;
    return out;
  }, [leads]);

  const sendWelcome = async (id: string) => {
    try {
      const res = await api.sendLeadWelcome(id);
      await load();
      setNotice(`Welcome email sent via ${res.provider} provider.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send email');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">Capture, qualify and close your pipeline.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add lead</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', ...LEAD_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === 'all' ? '' : s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              (statusFilter === '' && s === 'all') || statusFilter === s
                ? 'bg-teal-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {leads === null ? (
        <Spinner label="Loading leads…" />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads in this view"
          hint="Add a lead manually, or point your website's email capture widget at the public endpoint."
          action={<Button onClick={() => setShowCreate(true)}>Add your first lead</Button>}
        />
      ) : (
        <Card>
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Lead</th>
                  <th className="px-3 py-3 font-semibold">Service</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Value</th>
                  <th className="px-3 py-3 font-semibold">Captured</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} onChanged={load} onError={setError} onWelcome={() => sendWelcome(lead.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showCreate ? <CreateLeadModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} /> : null}
    </div>
  );
}

function LeadRow({ lead, onChanged, onError, onWelcome }: {
  lead: Lead;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
  onWelcome: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer transition hover:bg-slate-50"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button,select,td:last-child')) return;
          setOpen(true);
        }}
      >
        <td className="px-5 py-3">
          <p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p>
          <p className="text-xs text-slate-400">{lead.email}</p>
        </td>
        <td className="px-3 py-3 text-slate-600">{lead.service || '—'}</td>
        <td className="px-3 py-3"><span className="text-xs capitalize text-slate-500">{lead.source}</span></td>
        <td className="px-3 py-3"><LeadStatusBadge status={lead.status} /></td>
        <td className="px-3 py-3 font-medium text-slate-700">{lead.estimatedValue > 0 ? fmtMoney(lead.estimatedValue) : '—'}</td>
        <td className="px-3 py-3 text-xs text-slate-400">{timeAgo(lead.capturedAt)}</td>
        <td className="px-5 py-3">
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
            {lead.status !== 'won' && lead.status !== 'lost' ? (
              <Button size="sm" variant="secondary" onClick={onWelcome}>Email</Button>
            ) : null}
          </div>
        </td>
      </tr>
      {open ? (
        <EditLeadModal
          lead={lead}
          onClose={() => setOpen(false)}
          onChanged={async () => { setOpen(false); await onChanged(); }}
          onError={onError}
        />
      ) : null}
    </>
  );
}

function LeadFormBody({ lead, onStatusChange }: { lead: Partial<Lead>; onStatusChange?: (s: LeadStatus) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><Input name="firstName" required placeholder="Jane" /></Field>
        <Field label="Last name"><Input name="lastName" placeholder="Smith" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email"><Input name="email" type="email" required placeholder="jane@home.com" /></Field>
        <Field label="Phone"><Input name="phone" placeholder="(555) 123-4567" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service needed"><Input name="service" placeholder="Water heater replacement" /></Field>
        <Field label="Status">
          <Select name="status" value={lead.status ?? 'new'} onChange={(e) => onStatusChange?.(e.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Estimated value"><Input name="estimatedValue" type="number" min={0} step="100" placeholder="2500" /></Field>
      <Field label="Message / notes"><Textarea name="message" placeholder="Details about the job…" /></Field>
    </>
  );
}

function CreateLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      firstName: String(f.get('firstName') ?? ''),
      lastName: String(f.get('lastName') ?? ''),
      email: String(f.get('email') ?? ''),
      phone: String(f.get('phone') ?? ''),
      service: String(f.get('service') ?? ''),
      status: String(f.get('status') ?? 'new'),
      message: String(f.get('message') ?? ''),
      source: 'manual',
    };
    const value = Number(f.get('estimatedValue'));
    if (value > 0) payload.estimatedValue = value;
    try {
      await api.createLead(payload);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to create lead');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add lead" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <LeadFormBody lead={{ status: 'new' }} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditLeadModal({ lead, onClose, onChanged, onError }: {
  lead: Lead;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LeadStatus>(lead.status);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { status };
    for (const key of ['firstName', 'lastName', 'email', 'phone', 'service', 'message'] as const) {
      payload[key] = String(f.get(key) ?? '');
    }
    const value = Number(f.get('estimatedValue'));
    payload.estimatedValue = value > 0 ? value : 0;
    try {
      await api.updateLead(lead.id, payload);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit lead — ${lead.firstName} ${lead.lastName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* prefill */}
        <input type="hidden" name="prefill" value={lead.firstName} readOnly />
        <EditLeadFields lead={lead} status={status} onStatusChange={setStatus} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditLeadFields({ lead, status, onStatusChange }: { lead: Lead; status: LeadStatus; onStatusChange: (s: LeadStatus) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><Input name="firstName" defaultValue={lead.firstName} required /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={lead.lastName} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email"><Input name="email" type="email" defaultValue={lead.email} required /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={lead.phone} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service needed"><Input name="service" defaultValue={lead.service} /></Field>
        <Field label="Status" hint="Marking as 'won' converts this lead into a client + project.">
          <Select name="status" value={status} onChange={(e) => onStatusChange(e.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Estimated value"><Input name="estimatedValue" type="number" min={0} step="100" defaultValue={lead.estimatedValue || ''} /></Field>
      <Field label="Message / notes"><Textarea name="message" defaultValue={lead.message} /></Field>
    </>
  );
}