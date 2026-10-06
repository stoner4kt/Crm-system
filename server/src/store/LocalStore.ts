import bcrypt from 'bcryptjs';
import { idOf, slugify } from '../utils/slug.js';
import { Mutex } from './lock.js';
import type {
  Client,
  DashboardStats,
  EmailCapture,
  EmailLog,
  Lead,
  Project,
  Settings,
  User,
} from '../types/domain.js';
import {
  LEAD_STATUSES,
  PROJECT_STATUSES,
} from '../types/domain.js';
import type {
  ClientFilters,
  EmailLogInput,
  LeadFilters,
  NewClientInput,
  NewEmailCaptureInput,
  NewLeadInput,
  NewProjectInput,
  ProjectFilters,
  Store,
} from './Store.js';

interface LocalUser extends User {
  passwordHash: string;
}

type Row =
  | { kind: 'user'; data: LocalUser }
  | { kind: 'client'; data: Client }
  | { kind: 'lead'; data: Lead }
  | { kind: 'project'; data: Project }
  | { kind: 'capture'; data: EmailCapture }
  | { kind: 'log'; data: EmailLog }
  | { kind: 'settings'; data: Settings };

// ---------------------------------------------------------------------------
// LocalStore — in-memory implementation of Store.
// Used automatically when SUPABASE_* env vars are absent (local dev/tests).
// ---------------------------------------------------------------------------
export class LocalStore implements Store {
  private mutex = new Mutex();
  private seq = 1;
  private rows: Row[] = [];
  private users = new Map<string, LocalUser>();

  private userKey(userId: string): void {
    if (!userId) throw new Error('userId is required');
  }

  private now(): string {
    return new Date().toISOString();
  }

  // ---- Auth ---------------------------------------------------------------

  async findByEmail(email: string): Promise<User | null> {
    const lower = email.toLowerCase();
    const u = [...this.users.values()].find((x) => x.email.toLowerCase() === lower);
    return u ? stripPassword(u) : null;
  }

  async findById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? stripPassword(u) : null;
  }

  async createUser(input: {
    email: string;
    password: string;
    fullName?: string;
    businessName?: string;
    businessType?: string;
    phone?: string;
  }): Promise<User> {
    return this.mutex.run(async () => {
      const lower = input.email.toLowerCase();
      const existing = [...this.users.values()].find((x) => x.email.toLowerCase() === lower);
      if (existing) {
        const err = new Error('User with this email already exists');
        (err as Error & { code?: string }).code = 'DUPLICATE_EMAIL';
        throw err;
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      const ts = this.now();
      const user: LocalUser = {
        id: idOf(),
        email: lower,
        fullName: input.fullName ?? '',
        businessName: input.businessName ?? '',
        businessType: (input.businessType as User['businessType']) ?? '',
        phone: input.phone ?? '',
        passwordHash,
        createdAt: ts,
        updatedAt: ts,
      };
      this.users.set(user.id, user);
      this.rows.push({ kind: 'settings', data: defaultSettings(user.id, user.businessName, lower) });
      return stripPassword(user);
    });
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'businessName' | 'businessType' | 'phone'>>,
  ): Promise<User | null> {
    return this.mutex.run(async () => {
      const u = this.users.get(id);
      if (!u) return null;
      if (patch.fullName !== undefined) u.fullName = patch.fullName;
      if (patch.businessName !== undefined) u.businessName = patch.businessName;
      if (patch.businessType !== undefined) u.businessType = patch.businessType;
      if (patch.phone !== undefined) u.phone = patch.phone;
      u.updatedAt = this.now();
      return stripPassword(u);
    });
  }

  async verifyPassword(user: { id: string }, password: string): Promise<boolean> {
    const u = this.users.get(user.id);
    if (!u) return false;
    return bcrypt.compare(password, u.passwordHash);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    return this.mutex.run(async () => {
      const u = this.users.get(id);
      if (!u) return;
      u.passwordHash = await bcrypt.hash(newPassword, 10);
      u.updatedAt = this.now();
    });
  }

  // ---- Leads --------------------------------------------------------------

  async listLeads(userId: string, filters: LeadFilters = {}): Promise<Lead[]> {
    this.userKey(userId);
    let out = this.rows
      .filter((r) => r.kind === 'lead' && r.data.userId === userId)
      .map((r) => ({ ...(r as { kind: 'lead'; data: Lead }).data }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filters.status) {
      out = out.filter((l) => l.status === filters.status);
    }
    if (filters.source) {
      out = out.filter((l) => l.source === filters.source);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      out = out.filter(
        (l) =>
          l.firstName.toLowerCase().includes(q) ||
          l.lastName.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.phone.includes(q),
      );
    }
    if (filters.offset) out = out.slice(filters.offset);
    if (filters.limit) out = out.slice(0, filters.limit);
    return out;
  }

  async getLead(userId: string, leadId: string): Promise<Lead | null> {
    const r = this.rows.find((r) => r.kind === 'lead' && r.data.id === leadId && r.data.userId === userId);
    return r && r.kind === 'lead' ? { ...r.data } : null;
  }

  async createLead(userId: string, input: NewLeadInput): Promise<Lead> {
    return this.mutex.run(async () => {
      this.userKey(userId);
      const ts = this.now();
      const lead: Lead = {
        id: idOf(),
        userId,
        firstName: input.firstName ?? '',
        lastName: input.lastName ?? '',
        email: input.email.toLowerCase().trim(),
        phone: input.phone ?? '',
        service: input.service ?? '',
        message: input.message ?? '',
        source: input.source ?? 'manual',
        status: input.status ?? 'new',
        estimatedValue: input.estimatedValue ?? 0,
        capturedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      };
      this.rows.push({ kind: 'lead', data: lead });
      return lead;
    });
  }

  async updateLead(
    userId: string,
    leadId: string,
    patch: Partial<NewLeadInput>,
  ): Promise<Lead | null> {
    return this.mutex.run(async () => {
      const r = this.rows.find((r) => r.kind === 'lead' && r.data.id === leadId && r.data.userId === userId);
      if (!r || r.kind !== 'lead') return null;
      const lead = r.data;
      if (patch.firstName !== undefined) lead.firstName = patch.firstName;
      if (patch.lastName !== undefined) lead.lastName = patch.lastName;
      if (patch.email !== undefined) lead.email = patch.email.toLowerCase().trim();
      if (patch.phone !== undefined) lead.phone = patch.phone;
      if (patch.service !== undefined) lead.service = patch.service;
      if (patch.message !== undefined) lead.message = patch.message;
      if (patch.source !== undefined) lead.source = patch.source;
      if (patch.status !== undefined) lead.status = patch.status;
      if (patch.estimatedValue !== undefined) lead.estimatedValue = patch.estimatedValue;
      lead.updatedAt = this.now();
      return lead;
    });
  }

  async deleteLead(userId: string, leadId: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const idx = this.rows.findIndex(
        (r) => r.kind === 'lead' && r.data.id === leadId && r.data.userId === userId,
      );
      if (idx === -1) return false;
      this.rows.splice(idx, 1);
      return true;
    });
  }

  // ---- Clients ------------------------------------------------------------

  async listClients(userId: string, filters: ClientFilters = {}): Promise<Client[]> {
    this.userKey(userId);
    let out = this.rows
      .filter((r) => r.kind === 'client' && r.data.userId === userId)
      .map((r) => ({ ...(r as { kind: 'client'; data: Client }).data }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      out = out.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }
    if (filters.offset) out = out.slice(filters.offset);
    if (filters.limit) out = out.slice(0, filters.limit);
    return out;
  }

  async getClient(userId: string, clientId: string): Promise<Client | null> {
    const r = this.rows.find((r) => r.kind === 'client' && r.data.id === clientId && r.data.userId === userId);
    return r && r.kind === 'client' ? { ...r.data } : null;
  }

  async createClient(userId: string, input: NewClientInput): Promise<Client> {
    return this.mutex.run(async () => {
      const ts = this.now();
      const client: Client = {
        id: idOf(),
        userId,
        firstName: input.firstName,
        lastName: input.lastName ?? '',
        email: input.email.toLowerCase().trim(),
        phone: input.phone ?? '',
        address: input.address ?? '',
        city: input.city ?? '',
        state: input.state ?? '',
        zip: input.zip ?? '',
        propertyType: (input.propertyType as Client['propertyType']) ?? '',
        notes: input.notes ?? '',
        createdAt: ts,
        updatedAt: ts,
      };
      this.rows.push({ kind: 'client', data: client });
      return client;
    });
  }

  async updateClient(
    userId: string,
    clientId: string,
    patch: Partial<NewClientInput>,
  ): Promise<Client | null> {
    return this.mutex.run(async () => {
      const r = this.rows.find(
        (r) => r.kind === 'client' && r.data.id === clientId && r.data.userId === userId,
      );
      if (!r || r.kind !== 'client') return null;
      const client = r.data;
      if (patch.firstName !== undefined) client.firstName = patch.firstName;
      if (patch.lastName !== undefined) client.lastName = patch.lastName;
      if (patch.email !== undefined) client.email = patch.email.toLowerCase().trim();
      if (patch.phone !== undefined) client.phone = patch.phone;
      if (patch.address !== undefined) client.address = patch.address;
      if (patch.city !== undefined) client.city = patch.city;
      if (patch.state !== undefined) client.state = patch.state;
      if (patch.zip !== undefined) client.zip = patch.zip;
      if (patch.propertyType !== undefined) client.propertyType = patch.propertyType as Client['propertyType'];
      if (patch.notes !== undefined) client.notes = patch.notes;
      client.updatedAt = this.now();
      return client;
    });
  }

  async deleteClient(userId: string, clientId: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const idx = this.rows.findIndex(
        (r) => r.kind === 'client' && r.data.id === clientId && r.data.userId === userId,
      );
      if (idx === -1) return false;
      // Leave projects orphaned — the route layer rejects deleting a client with projects.
      this.rows.splice(idx, 1);
      return true;
    });
  }

  // ---- Projects -----------------------------------------------------------

  async listProjects(userId: string, filters: ProjectFilters = {}): Promise<Project[]> {
    this.userKey(userId);
    const clients = new Map(
      this.rows
        .filter((r) => r.kind === 'client' && r.data.userId === userId)
        .map((r) => [(r as { kind: 'client'; data: Client }).data.id, (r as { kind: 'client'; data: Client }).data]),
    );
    const leads = new Map(
      this.rows
        .filter((r) => r.kind === 'lead' && r.data.userId === userId)
        .map((r) => [(r as { kind: 'lead'; data: Lead }).data.id, (r as { kind: 'lead'; data: Lead }).data]),
    );

    let out = this.rows
      .filter((r) => r.kind === 'project' && r.data.userId === userId)
      .map((r) => (r as { kind: 'project'; data: Project }).data)
      .map((p) => enrichProject(p, clients, leads));

    if (filters.status) out = out.filter((p) => p.status === filters.status);
    if (filters.clientId) out = out.filter((p) => p.clientId === filters.clientId);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      out = out.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.clientName ?? '').toLowerCase().includes(q) ||
          p.scope.toLowerCase().includes(q),
      );
    }
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filters.offset) out = out.slice(filters.offset);
    if (filters.limit) out = out.slice(0, filters.limit);
    return out;
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const r = this.rows.find(
      (r) => r.kind === 'project' && r.data.id === projectId && r.data.userId === userId,
    );
    if (!r || r.kind !== 'project') return null;
    return enrichProject(r.data, this.clientMap(), this.leadMap());
  }

  private clientMap(): Map<string, Client> {
    return new Map(
      this.rows
        .filter((r) => r.kind === 'client')
        .map((r) => [(r as { kind: 'client'; data: Client }).data.id, (r as { kind: 'client'; data: Client }).data]),
    );
  }

  private leadMap(): Map<string, Lead> {
    return new Map(
      this.rows
        .filter((r) => r.kind === 'lead')
        .map((r) => [(r as { kind: 'lead'; data: Lead }).data.id, (r as { kind: 'lead'; data: Lead }).data]),
    );
  }

  async createProject(userId: string, input: NewProjectInput): Promise<Project> {
    return this.mutex.run(async () => {
      const ts = this.now();
      const project: Project = {
        id: idOf(),
        userId,
        clientId: input.clientId,
        leadId: input.leadId ?? null,
        title: input.title.trim(),
        slug: slugify(input.title),
        scope: input.scope ?? '',
        status: input.status ?? 'new',
        priority: input.priority ?? 'normal',
        requestedDate: input.requestedDate ?? null,
        scheduledDate: input.scheduledDate ?? null,
        completionDate: input.completionDate ?? null,
        estValue: input.estValue ?? 0,
        notes: input.notes ?? '',
        createdAt: ts,
        updatedAt: ts,
      };
      this.rows.push({ kind: 'project', data: project });
      return enrichProject(project, this.clientMap(), this.leadMap());
    });
  }

  async updateProject(
    userId: string,
    projectId: string,
    patch: Partial<NewProjectInput>,
  ): Promise<Project | null> {
    return this.mutex.run(async () => {
      const r = this.rows.find(
        (r) => r.kind === 'project' && r.data.id === projectId && r.data.userId === userId,
      );
      if (!r || r.kind !== 'project') return null;
      const p = r.data;
      if (patch.clientId !== undefined) p.clientId = patch.clientId;
      if (patch.leadId !== undefined) p.leadId = patch.leadId ?? null;
      if (patch.title !== undefined) {
        p.title = patch.title.trim();
        p.slug = slugify(patch.title);
      }
      if (patch.scope !== undefined) p.scope = patch.scope;
      if (patch.status !== undefined) p.status = patch.status;
      if (patch.priority !== undefined) p.priority = patch.priority;
      if (patch.requestedDate !== undefined) p.requestedDate = patch.requestedDate ?? null;
      if (patch.scheduledDate !== undefined) p.scheduledDate = patch.scheduledDate ?? null;
      if (patch.completionDate !== undefined) p.completionDate = patch.completionDate ?? null;
      if (patch.estValue !== undefined) p.estValue = patch.estValue;
      if (patch.notes !== undefined) p.notes = patch.notes;
      p.updatedAt = this.now();
      return enrichProject(p, this.clientMap(), this.leadMap());
    });
  }

  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const idx = this.rows.findIndex(
        (r) => r.kind === 'project' && r.data.id === projectId && r.data.userId === userId,
      );
      if (idx === -1) return false;
      this.rows.splice(idx, 1);
      return true;
    });
  }

  // ---- Settings -----------------------------------------------------------

  async getSettings(userId: string): Promise<Settings | null> {
    const r = this.rows.find((r) => r.kind === 'settings' && r.data.userId === userId);
    return r && r.kind === 'settings' ? r.data : null;
  }

  async upsertSettings(userId: string, patch: Partial<Settings>): Promise<Settings> {
    return this.mutex.run(async () => {
      const r = this.rows.find((r) => r.kind === 'settings' && r.data.userId === userId);
      if (r && r.kind === 'settings') {
        const s = r.data;
        if (patch.businessName !== undefined) s.businessName = patch.businessName;
        if (patch.businessType !== undefined) s.businessType = patch.businessType;
        if (patch.replyToEmail !== undefined) s.replyToEmail = patch.replyToEmail;
        if (patch.currency !== undefined) s.currency = patch.currency;
        if (patch.emailNotifications !== undefined) s.emailNotifications = patch.emailNotifications;
        s.updatedAt = this.now();
        return s;
      }
      const s = defaultSettings(userId, patch.businessName ?? '', patch.replyToEmail ?? '');
      if (patch.businessType !== undefined) s.businessType = patch.businessType;
      if (patch.currency !== undefined) s.currency = patch.currency;
      if (patch.emailNotifications !== undefined) s.emailNotifications = patch.emailNotifications;
      this.rows.push({ kind: 'settings', data: s });
      return s;
    });
  }

  // ---- Captures & email logs ----------------------------------------------

  async saveEmailCapture(userId: string, input: NewEmailCaptureInput): Promise<EmailCapture> {
    return this.mutex.run(async () => {
      const capture: EmailCapture = {
        id: idOf(),
        userId,
        email: input.email.toLowerCase().trim(),
        captureSource: input.captureSource ?? 'website',
        fullName: input.fullName ?? '',
        phone: input.phone ?? '',
        message: input.message ?? '',
        ipAddress: input.ipAddress ?? '',
        userAgent: input.userAgent ?? '',
        leadId: null,
        createdAt: this.now(),
      };
      this.rows.push({ kind: 'capture', data: capture });
      return capture;
    });
  }

  async listEmailCaptures(userId: string, limit = 50): Promise<EmailCapture[]> {
    return this.rows
      .filter((r) => r.kind === 'capture' && r.data.userId === userId)
      .map((r) => (r as { kind: 'capture'; data: EmailCapture }).data)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async logEmail(userId: string, input: EmailLogInput): Promise<EmailLog> {
    return this.mutex.run(async () => {
      const log: EmailLog = {
        id: idOf(),
        userId,
        leadId: input.leadId ?? null,
        clientId: input.clientId ?? null,
        toEmail: input.toEmail,
        subject: input.subject,
        template: input.template,
        status: input.status,
        provider: input.provider,
        sentAt: this.now(),
      };
      this.rows.push({ kind: 'log', data: log });
      return log;
    });
  }

  async listEmailLogs(userId: string, limit = 50): Promise<EmailLog[]> {
    return this.rows
      .filter((r) => r.kind === 'log' && r.data.userId === userId)
      .map((r) => (r as { kind: 'log'; data: EmailLog }).data)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, limit);
  }

  // ---- Analytics ----------------------------------------------------------

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    const leads = await this.listLeads(userId);
    const projects = await this.listProjects(userId);
    const clients = await this.listClients(userId);
    const logs = await this.listEmailLogs(userId, 10000);

    return {
      totalLeads: leads.length,
      newLeads: leads.filter((l) => l.status === 'new').length,
      wonLeads: leads.filter((l) => l.status === 'won').length,
      lostLeads: leads.filter((l) => l.status === 'lost').length,
      activeProjects: projects.filter((p) => ['new', 'scheduled', 'in_progress'].includes(p.status)).length,
      completedProjects: projects.filter((p) => p.status === 'completed').length,
      totalClients: clients.length,
      emailsSent: logs.length,
      recentLeads: leads.slice(0, 5),
      recentProjects: projects.slice(0, 5),
    };
  }

  // ---- Misc ---------------------------------------------------------------

  async convertLeadToClient(userId: string, leadId: string): Promise<{ clientId: string; projectId: string }> {
    return this.mutex.run(async () => {
      const r = this.rows.find((r) => r.kind === 'lead' && r.data.id === leadId);
      if (!r || r.kind !== 'lead' || r.data.userId !== userId) {
        throw new Error('lead not found');
      }
      const lead = r.data;

      const existing = this.rows.find(
        (row) =>
          row.kind === 'client' &&
          row.data.userId === userId &&
          row.data.email.toLowerCase() === lead.email.toLowerCase(),
      );

      let clientId: string;
      if (existing && existing.kind === 'client') {
        clientId = existing.data.id;
      } else {
        const client = await this.createClient(userId, {
          firstName: lead.firstName || 'Website',
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          notes: `Converted from lead ${lead.service}`.trim(),
          propertyType: '',
        });
        clientId = client.id;
      }

      const already = this.rows.find(
        (row) => row.kind === 'project' && row.data.leadId === lead.id && row.data.userId === userId,
      );
      if (already && already.kind === 'project') {
        return { clientId, projectId: already.data.id };
      }

      const project = await this.createProject(userId, {
        clientId,
        leadId: lead.id,
        title: `${lead.firstName || lead.email} ${lead.lastName} — ${lead.service || 'general'} job`,
        scope: lead.message,
        status: 'new',
        estValue: lead.estimatedValue,
      });
      return { clientId, projectId: project.id };
    });
  }
}

function stripPassword(u: LocalUser): User {
  const { passwordHash: _ignored, ...rest } = u;
  return rest as User;
}

function defaultSettings(userId: string, businessName: string, email: string): Settings {
  return {
    id: idOf(),
    userId,
    businessName,
    businessType: '',
    replyToEmail: email,
    currency: 'USD',
    emailNotifications: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function enrichProject(
  p: Project,
  clients: Map<string, Client>,
  leads: Map<string, Lead>,
): Project {
  const client = clients.get(p.clientId);
  const lead = p.leadId ? leads.get(p.leadId) : undefined;
  return {
    ...p,
    clientName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Unknown client',
    leadEmail: lead?.email,
  };
}

export { LEAD_STATUSES, PROJECT_STATUSES };