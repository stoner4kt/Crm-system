import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError } from '../lib/api.js';
import type { Client } from '../types/api.js';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../components/ui.js';
import { Modal } from '../components/Modal.js';
import { timeAgo } from '../components/badges.js';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listClients(query ? `?q=${encodeURIComponent(query)}` : '');
      setClients(res.clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients');
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">Your book of business.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add client</Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {clients === null ? (
        <Spinner label="Loading clients…" />
      ) : clients.length === 0 ? (
        <EmptyState title="No clients yet" hint="Clients are usually created automatically when a lead is won." action={<Button onClick={() => setShowCreate(true)}>Add a client</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} onChanged={load} onError={setError} />
          ))}
        </div>
      )}

      {showCreate ? <CreateClientModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} /> : null}
    </div>
  );
}

function ClientCard({ client, onChanged, onError }: { client: Client; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);

  const del = async () => {
    if (!window.confirm(`Delete client ${client.firstName} ${client.lastName}? This cannot be undone.`)) return;
    try {
      await api.deleteClient(client.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete client');
    }
  };

  return (
    <>
      <Card className="transition hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{client.firstName} {client.lastName}</p>
            <p className="truncate text-xs text-slate-500">{client.email}</p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">{timeAgo(client.createdAt)}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-slate-400">Phone</dt>
            <dd className="font-medium text-slate-700">{client.phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Type</dt>
            <dd className="font-medium capitalize text-slate-700">{client.propertyType || '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-400">Address</dt>
            <dd className="font-medium text-slate-700">
              {[client.address, client.city, client.state, client.zip].filter(Boolean).join(', ') || '—'}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="danger" onClick={del}>Delete</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
        </div>
      </Card>
      {open ? (
        <EditClientModal client={client} onClose={() => setOpen(false)} onChanged={async () => { setOpen(false); await onChanged(); }} onError={onError} />
      ) : null}
    </>
  );
}

function ClientFields({ client }: { client?: Partial<Client> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><Input name="firstName" defaultValue={client?.firstName} required /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={client?.lastName} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email"><Input name="email" type="email" defaultValue={client?.email} required /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={client?.phone} /></Field>
      </div>
      <Field label="Address"><Input name="address" defaultValue={client?.address} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City"><Input name="city" defaultValue={client?.city} /></Field>
        <Field label="State"><Input name="state" defaultValue={client?.state} /></Field>
        <Field label="Zip"><Input name="zip" defaultValue={client?.zip} /></Field>
      </div>
      <Field label="Property type">
        <Select name="propertyType" defaultValue={client?.propertyType ?? ''}>
          <option value="">—</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </Select>
      </Field>
      <Field label="Notes"><Textarea name="notes" defaultValue={client?.notes} /></Field>
    </>
  );
}

function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f.entries());
    try {
      await api.createClient(payload as Record<string, unknown>);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ClientFields />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save client'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditClientModal({ client, onClose, onChanged, onError }: { client: Client; onClose: () => void; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f.entries());
    try {
      await api.updateClient(client.id, payload);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError && err.fields ? Object.values(err.fields).flat().join(', ') : err instanceof Error ? err.message : 'Failed to update client');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit ${client.firstName} ${client.lastName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ClientFields client={client} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}