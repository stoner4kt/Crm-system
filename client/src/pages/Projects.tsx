import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError } from '../lib/api.js';
import type { Client, Project, ProjectPriority, ProjectStatus } from '../types/api.js';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../components/ui.js';
import { Modal } from '../components/Modal.js';
import { PROJECT_PRIORITIES, PROJECT_STATUSES, PriorityBadge, ProjectStatusBadge, fmtDate, fmtMoney } from '../components/badges.js';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.listProjects(params);
      setProjects(res.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">Jobs on your board — scheduled, in progress, and done.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New project</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', ...PROJECT_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === 'all' ? '' : s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              (statusFilter === '' && s === 'all') || statusFilter === s
                ? 'bg-teal-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {projects === null ? (
        <Spinner label="Loading projects…" />
      ) : projects.length === 0 ? (
        <EmptyState title="No projects on your board" hint="Win a lead to auto-create a project, or add one manually." action={<Button onClick={() => setShowCreate(true)}>New project</Button>} />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onChanged={load} onError={setError} />
          ))}
          <p className="text-center text-xs text-slate-400">{projects.length} project{projects.length === 1 ? '' : 's'}</p>
        </div>
      )}

      {showCreate ? <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} /> : null}
    </div>
  );
}

function ProjectCard({ project, onChanged, onError }: { project: Project; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sendBox, setSendBox] = useState(false);
  const [message, setMessage] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'busy' | 'done'>('idle');

  const advance = async (patch: Partial<Project>) => {
    try {
      await api.updateProject(project.id, patch);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update project');
    }
  };

  const sendUpdate = async () => {
    if (!message.trim()) return;
    setSendState('busy');
    try {
      await api.sendProjectUpdate(project.id, message.trim());
      setSendState('done');
      setTimeout(() => setSendState('idle'), 2500);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to send update');
      setSendState('idle');
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete project "${project.title}"?`)) return;
    try {
      await api.deleteProject(project.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete project');
    }
  };

  return (
    <Card className="transition hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{project.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {project.clientName ?? 'Unknown client'}
            {project.scheduledDate ? ` · scheduled ${fmtDate(project.scheduledDate)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={project.priority} />
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>

      {project.scope ? <p className="mt-3 line-clamp-2 text-sm text-slate-600">{project.scope}</p> : null}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{project.estValue > 0 ? fmtMoney(project.estValue) : '—'}</span>
        <span>Requested: {fmtDate(project.requestedDate)}</span>
        <span>Completed: {fmtDate(project.completionDate)}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_STATUSES.filter((s) => s !== 'cancelled').map((s) => (
            <button
              key={s}
              onClick={() => void advance({ status: s })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                project.status === s
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSendBox((v) => !v)}>Email client</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={del}>Delete</Button>
        </div>
      </div>

      {sendBox ? (
        <div className="mt-4 flex items-end gap-2 rounded-xl bg-slate-50 p-3">
          <Field label="Message to client">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. We'll be there Thursday 8am." onKeyDown={(e) => e.key === 'Enter' && void sendUpdate()} />
          </Field>
          <Button size="sm" onClick={sendUpdate} disabled={sendState === 'busy' || !message.trim()}>
            {sendState === 'busy' ? 'Sending…' : sendState === 'done' ? 'Sent ✓' : 'Send'}
          </Button>
        </div>
      ) : null}

      {open ? (
        <EditProjectModal project={project} onClose={() => setOpen(false)} onChanged={async () => { setOpen(false); await onChanged(); }} onError={onError} />
      ) : null}
    </Card>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listClients().then((r) => setClients(r.clients)).catch(() => setClients([]));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const clientId = String(f.get('clientId') ?? '');
    if (!clientId) {
      setError('Please choose a client');
      setBusy(false);
      return;
    }
    const payload: Record<string, unknown> = {
      clientId,
      title: String(f.get('title') ?? ''),
      scope: String(f.get('scope') ?? ''),
      status: String(f.get('status') ?? 'new'),
      priority: String(f.get('priority') ?? 'normal'),
    };
    for (const k of ['requestedDate', 'scheduledDate', 'completionDate'] as const) {
      const v = String(f.get(k) ?? '');
      if (v) payload[k] = v;
    }
    const val = Number(f.get('estValue'));
    if (val > 0) payload.estValue = val;
    try {
      await api.createProject(payload);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Client">
          <Select name="clientId" required>
            <option value="">Choose a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.email}</option>)}
          </Select>
        </Field>
        <Field label="Title"><Input name="title" required placeholder="Water heater replacement" /></Field>
        <Field label="Scope"><Textarea name="scope" placeholder="Details of the work…" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Select name="status" defaultValue="new">
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue="normal">
              {PROJECT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Requested"><Input name="requestedDate" type="date" /></Field>
          <Field label="Scheduled"><Input name="scheduledDate" type="date" /></Field>
          <Field label="Completed"><Input name="completionDate" type="date" /></Field>
        </div>
        <Field label="Estimated value"><Input name="estValue" type="number" min={0} step="100" placeholder="5000" /></Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create project'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditProjectModal({ project, onClose, onChanged, onError }: { project: Project; onClose: () => void; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listClients().then((r) => setClients(r.clients)).catch(() => setClients([]));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      clientId: String(f.get('clientId') ?? ''),
      title: String(f.get('title') ?? ''),
      scope: String(f.get('scope') ?? ''),
      status: String(f.get('status') ?? ''),
      priority: String(f.get('priority') ?? ''),
    };
    for (const k of ['requestedDate', 'scheduledDate', 'completionDate'] as const) {
      const v = String(f.get(k) ?? '');
      payload[k] = v ? v : null;
    }
    const val = Number(f.get('estValue'));
    payload.estValue = val > 0 ? val : 0;
    try {
      await api.updateProject(project.id, payload);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit — ${project.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Client">
          <Select name="clientId" required defaultValue={project.clientId}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </Select>
        </Field>
        <Field label="Title"><Input name="title" defaultValue={project.title} required /></Field>
        <Field label="Scope"><Textarea name="scope" defaultValue={project.scope} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Select name="status" defaultValue={project.status}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select name="priority" defaultValue={project.priority}>
              {PROJECT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Requested"><Input name="requestedDate" type="date" defaultValue={project.requestedDate ?? ''} /></Field>
          <Field label="Scheduled"><Input name="scheduledDate" type="date" defaultValue={project.scheduledDate ?? ''} /></Field>
          <Field label="Completed"><Input name="completionDate" type="date" defaultValue={project.completionDate ?? ''} /></Field>
        </div>
        <Field label="Estimated value"><Input name="estValue" type="number" min={0} step="100" defaultValue={project.estValue || ''} /></Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}