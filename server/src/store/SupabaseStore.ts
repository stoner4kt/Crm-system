import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
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

interface SbLead extends Omit<Lead, 'capturedAt'> {
  captured_at: string;
  estimated_value: number;
}

const LEAD_COLUMNS =
  'id,user_id,first_name,last_name,email,phone,service,message,source,status,estimated_value,captured_at,created_at,updated_at';
const CLIENT_COLUMNS =
  'id,user_id,first_name,last_name,email,phone,address,city,state,zip,property_type,notes,created_at,updated_at';
const PROJECT_COLUMNS =
  'id,user_id,client_id,lead_id,title,slug,scope,status,priority,requested_date,scheduled_date,completion_date,est_value,notes,created_at,updated_at';
const CAPTURE_COLUMNS =
  'id,user_id,email,capture_source,full_name,phone,message,ip_address,user_agent,lead_id,created_at';
const LOG_COLUMNS =
  'id,user_id,lead_id,client_id,to_email,subject,template,status,provider,sent_at';
const SETTINGS_COLUMNS =
  'id,user_id,business_name,business_type,reply_to_email,currency,email_notifications,created_at,updated_at';

// ---------------------------------------------------------------------------
// SupabaseStore — production data layer on top of Supabase REST + Supabase
// Auth. Uses the service-role key so RLS remains enabled and all rows are
// owned by auth.uid().
// ---------------------------------------------------------------------------
export class SupabaseStore implements Store {
  readonly sb: SupabaseClient;
  readonly supabaseUrl: string;
  private readonly serviceKey: string;

  constructor(url = config.supabase.url, serviceKey = config.supabase.serviceKey) {
    this.supabaseUrl = url;
    this.serviceKey = serviceKey;
    this.sb = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { headers: { 'x-application-name': 'tradepro-crm' } },
    });
  }

  private assertSet(): void {
    if (!config.supabase.configured) {
      throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
    }
  }

  // ---- Auth ---------------------------------------------------------------
  // NOTE: Supabase Auth account creation/login is handled directly via the
  // supabase.auth endpoints in the auth service. These read methods look up
  // the profiles table.

  async findByEmail(email: string): Promise<User | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('profiles')
      .select('id,full_name,business_name,business_type,phone,email,created_at,updated_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) {
      logger.warn('Supabase findByEmail failed', { error: error.message });
      return null;
    }
    return data ? mapProfile(data) : null;
  }

  async findById(id: string): Promise<User | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('profiles')
      .select('id,full_name,business_name,business_type,phone,email,created_at,updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.warn('Supabase findById failed', { error: error.message });
      return null;
    }
    return data ? mapProfile(data) : null;
  }

  // Local/supabase-js auth path — the auth service adds users through
  // Supabase Auth directly and then inserts into auth-facing profile tables
  // via trigger. This method is a no-op when auth.createUser is used.
  async createUser(_input: { email: string; password: string }): Promise<User> {
    throw new Error('createUser is handled by Supabase Auth signUp in the auth service');
  }

  async updateProfile(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'businessName' | 'businessType' | 'phone'>>,
  ): Promise<User | null> {
    this.assertSet();
    const body: Record<string, unknown> = {};
    if (patch.fullName !== undefined) body.full_name = patch.fullName;
    if (patch.businessName !== undefined) body.business_name = patch.businessName;
    if (patch.businessType !== undefined) body.business_type = patch.businessType;
    if (patch.phone !== undefined) body.phone = patch.phone;

    const { data, error } = await this.sb
      .from('profiles')
      .update(body)
      .eq('id', id)
      .select(CLIENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`updateProfile failed: ${error.message}`);
    return data ? mapProfile(data) : null;
  }

  async verifyPassword(_user: User, _password: string): Promise<boolean> {
    // Login goes through supabase.auth.signInWithPassword directly.
    throw new Error('verifyPassword is handled by Supabase Auth signInWithPassword in the auth service');
  }

  async updatePassword(_id: string, _newPassword: string): Promise<void> {
    throw new Error('updatePassword is handled by supabase.auth.updateUser in the auth service');
  }

  // ---- Leads --------------------------------------------------------------

  async listLeads(userId: string, filters: LeadFilters = {}): Promise<Lead[]> {
    this.assertSet();
    let q = this.sb.from('leads').select(LEAD_COLUMNS).eq('user_id', userId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.source) q = q.eq('source', filters.source);
    if (filters.q) q = q.ilike('email', `%${filters.q}%`);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(`listLeads failed: ${error.message}`);
    return (data ?? []).map((d) => mapLead(d));
  }

  async getLead(userId: string, leadId: string): Promise<Lead | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('leads')
      .select(LEAD_COLUMNS)
      .eq('id', leadId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data ? mapLead(data) : null;
  }

  async createLead(userId: string, input: NewLeadInput): Promise<Lead> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('leads')
      .insert({
        user_id: userId,
        first_name: input.firstName ?? '',
        last_name: input.lastName ?? '',
        email: input.email.toLowerCase().trim(),
        phone: input.phone ?? '',
        service: input.service ?? '',
        message: input.message ?? '',
        source: input.source ?? 'manual',
        status: input.status ?? 'new',
        estimated_value: input.estimatedValue ?? 0,
      })
      .select(LEAD_COLUMNS)
      .single();
    if (error) throw new Error(`createLead failed: ${error.message}`);
    return mapLead(data);
  }

  async updateLead(
    userId: string,
    leadId: string,
    patch: Partial<NewLeadInput>,
  ): Promise<Lead | null> {
    this.assertSet();
    const body: Record<string, unknown> = {};
    if (patch.firstName !== undefined) body.first_name = patch.firstName;
    if (patch.lastName !== undefined) body.last_name = patch.lastName;
    if (patch.email !== undefined) body.email = patch.email.toLowerCase().trim();
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (patch.service !== undefined) body.service = patch.service;
    if (patch.message !== undefined) body.message = patch.message;
    if (patch.source !== undefined) body.source = patch.source;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.estimatedValue !== undefined) body.estimated_value = patch.estimatedValue;

    const { data, error } = await this.sb
      .from('leads')
      .update(body)
      .eq('id', leadId)
      .eq('user_id', userId)
      .select(LEAD_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`updateLead failed: ${error.message}`);
    return data ? mapLead(data) : null;
  }

  async deleteLead(userId: string, leadId: string): Promise<boolean> {
    this.assertSet();
    const { error } = await this.sb.from('leads').delete().eq('id', leadId).eq('user_id', userId);
    if (error) throw new Error(`deleteLead failed: ${error.message}`);
    return true;
  }

  // ---- Clients ------------------------------------------------------------

  async listClients(userId: string, filters: ClientFilters = {}): Promise<Client[]> {
    this.assertSet();
    let q = this.sb.from('clients').select(CLIENT_COLUMNS).eq('user_id', userId);
    if (filters.q) q = q.ilike('email', `%${filters.q}%`);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(`listClients failed: ${error.message}`);
    return (data ?? []).map((d) => mapClient(d));
  }

  async getClient(userId: string, clientId: string): Promise<Client | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('id', clientId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data ? mapClient(data) : null;
  }

  async createClient(userId: string, input: NewClientInput): Promise<Client> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('clients')
      .insert({
        user_id: userId,
        first_name: input.firstName,
        last_name: input.lastName ?? '',
        email: input.email.toLowerCase().trim(),
        phone: input.phone ?? '',
        address: input.address ?? '',
        city: input.city ?? '',
        state: input.state ?? '',
        zip: input.zip ?? '',
        property_type: input.propertyType ?? '',
        notes: input.notes ?? '',
      })
      .select(CLIENT_COLUMNS)
      .single();
    if (error) throw new Error(`createClient failed: ${error.message}`);
    return mapClient(data);
  }

  async updateClient(
    userId: string,
    clientId: string,
    patch: Partial<NewClientInput>,
  ): Promise<Client | null> {
    this.assertSet();
    const body: Record<string, unknown> = {};
    if (patch.firstName !== undefined) body.first_name = patch.firstName;
    if (patch.lastName !== undefined) body.last_name = patch.lastName;
    if (patch.email !== undefined) body.email = patch.email.toLowerCase().trim();
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (patch.address !== undefined) body.address = patch.address;
    if (patch.city !== undefined) body.city = patch.city;
    if (patch.state !== undefined) body.state = patch.state;
    if (patch.zip !== undefined) body.zip = patch.zip;
    if (patch.propertyType !== undefined) body.property_type = patch.propertyType;
    if (patch.notes !== undefined) body.notes = patch.notes;

    const { data, error } = await this.sb
      .from('clients')
      .update(body)
      .eq('id', clientId)
      .eq('user_id', userId)
      .select(CLIENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`updateClient failed: ${error.message}`);
    return data ? mapClient(data) : null;
  }

  async deleteClient(userId: string, clientId: string): Promise<boolean> {
    this.assertSet();
    const { error } = await this.sb.from('clients').delete().eq('id', clientId).eq('user_id', userId);
    if (error) throw new Error(`deleteClient failed: ${error.message}`);
    return true;
  }

  // ---- Projects -----------------------------------------------------------

  async listProjects(userId: string, filters: ProjectFilters = {}): Promise<Project[]> {
    this.assertSet();
    let q = this.sb
      .from('projects')
      .select(`${PROJECT_COLUMNS}, clients(first_name,last_name), leads(email)`)
      .eq('user_id', userId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.clientId) q = q.eq('client_id', filters.clientId);
    const { data, error } = await q.order('updated_at', { ascending: false });
    if (error) throw new Error(`listProjects failed: ${error.message}`);
    return (data ?? []).map((d) => mapProject(d));
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('projects')
      .select(`${PROJECT_COLUMNS}, clients(first_name,last_name), leads(email)`)
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data ? mapProject(data) : null;
  }

  async createProject(userId: string, input: NewProjectInput): Promise<Project> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('projects')
      .insert({
        user_id: userId,
        client_id: input.clientId,
        lead_id: input.leadId ?? null,
        title: input.title.trim(),
        scope: input.scope ?? '',
        status: input.status ?? 'new',
        priority: input.priority ?? 'normal',
        requested_date: input.requestedDate ?? null,
        scheduled_date: input.scheduledDate ?? null,
        completion_date: input.completionDate ?? null,
        est_value: input.estValue ?? 0,
        notes: input.notes ?? '',
      })
      .select(`${PROJECT_COLUMNS}, clients(first_name,last_name), leads(email)`)
      .single();
    if (error) throw new Error(`createProject failed: ${error.message}`);
    return mapProject(data);
  }

  async updateProject(
    userId: string,
    projectId: string,
    patch: Partial<NewProjectInput>,
  ): Promise<Project | null> {
    this.assertSet();
    const body: Record<string, unknown> = {};
    if (patch.clientId !== undefined) body.client_id = patch.clientId;
    if (patch.leadId !== undefined) body.lead_id = patch.leadId ?? null;
    if (patch.title !== undefined) body.title = patch.title.trim();
    if (patch.scope !== undefined) body.scope = patch.scope;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.requestedDate !== undefined) body.requested_date = patch.requestedDate ?? null;
    if (patch.scheduledDate !== undefined) body.scheduled_date = patch.scheduledDate ?? null;
    if (patch.completionDate !== undefined) body.completion_date = patch.completionDate ?? null;
    if (patch.estValue !== undefined) body.est_value = patch.estValue;
    if (patch.notes !== undefined) body.notes = patch.notes;

    const { data, error } = await this.sb
      .from('projects')
      .update(body)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select(`${PROJECT_COLUMNS}, clients(first_name,last_name), leads(email)`)
      .maybeSingle();
    if (error) throw new Error(`updateProject failed: ${error.message}`);
    return data ? mapProject(data) : null;
  }

  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    this.assertSet();
    const { error } = await this.sb.from('projects').delete().eq('id', projectId).eq('user_id', userId);
    if (error) throw new Error(`deleteProject failed: ${error.message}`);
    return true;
  }

  // ---- Settings -----------------------------------------------------------

  async getSettings(userId: string): Promise<Settings | null> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('settings')
      .select(SETTINGS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data ? mapSettings(data) : null;
  }

  async upsertSettings(userId: string, patch: Partial<Settings>): Promise<Settings> {
    this.assertSet();
    const body: Record<string, unknown> = { user_id: userId };
    if (patch.businessName !== undefined) body.business_name = patch.businessName;
    if (patch.businessType !== undefined) body.business_type = patch.businessType;
    if (patch.replyToEmail !== undefined) body.reply_to_email = patch.replyToEmail;
    if (patch.currency !== undefined) body.currency = patch.currency;
    if (patch.emailNotifications !== undefined) body.email_notifications = patch.emailNotifications;

    const { data, error } = await this.sb
      .from('settings')
      .upsert(body, { onConflict: 'user_id' })
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw new Error(`upsertSettings failed: ${error.message}`);
    return mapSettings(data);
  }

  // ---- Captures & email logs ----------------------------------------------

  async saveEmailCapture(userId: string, input: NewEmailCaptureInput): Promise<EmailCapture> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('email_captures')
      .insert({
        user_id: userId,
        email: input.email.toLowerCase().trim(),
        capture_source: input.captureSource ?? 'website',
        full_name: input.fullName ?? '',
        phone: input.phone ?? '',
        message: input.message ?? '',
        ip_address: input.ipAddress ?? '',
        user_agent: input.userAgent ?? '',
      })
      .select(CAPTURE_COLUMNS)
      .single();
    if (error) throw new Error(`saveEmailCapture failed: ${error.message}`);
    return mapCapture(data);
  }

  async listEmailCaptures(userId: string, limit = 50): Promise<EmailCapture[]> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('email_captures')
      .select(CAPTURE_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listEmailCaptures failed: ${error.message}`);
    return (data ?? []).map((d) => mapCapture(d));
  }

  async logEmail(userId: string, input: EmailLogInput): Promise<EmailLog> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('email_logs')
      .insert({
        user_id: userId,
        lead_id: input.leadId ?? null,
        client_id: input.clientId ?? null,
        to_email: input.toEmail,
        subject: input.subject,
        template: input.template,
        status: input.status,
        provider: input.provider,
      })
      .select(LOG_COLUMNS)
      .single();
    if (error) throw new Error(`logEmail failed: ${error.message}`);
    return mapLog(data);
  }

  async listEmailLogs(userId: string, limit = 50): Promise<EmailLog[]> {
    this.assertSet();
    const { data, error } = await this.sb
      .from('email_logs')
      .select(LOG_COLUMNS)
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listEmailLogs failed: ${error.message}`);
    return (data ?? []).map((d) => mapLog(d));
  }

  // ---- Analytics ----------------------------------------------------------

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    this.assertSet();
    const { data, error } = await this.sb.rpc('get_dashboard_stats', { owner_id: userId });
    if (error) throw new Error(`getDashboardStats failed: ${error.message}`);
    return normalizeStats(data);
  }

  // ---- Conversion ---------------------------------------------------------

  async convertLeadToClient(userId: string, leadId: string): Promise<{ clientId: string; projectId: string }> {
    this.assertSet();
    const { data, error } = await this.sb.rpc('convert_lead_to_client', { p_lead_id: leadId });
    if (error) throw new Error(`convertLeadToClient failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return { clientId: row?.client_id as string, projectId: row?.project_id as string };
  }
}

// ---- Mappers ----------------------------------------------------------------

function mapProfile(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    fullName: String(row.full_name ?? ''),
    businessName: String(row.business_name ?? ''),
    businessType: String(row.business_type ?? '') as User['businessType'],
    phone: String(row.phone ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    firstName: String(row.first_name ?? ''),
    lastName: String(row.last_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    service: String(row.service ?? ''),
    message: String(row.message ?? ''),
    source: String(row.source ?? 'website') as Lead['source'],
    status: String(row.status ?? 'new') as Lead['status'],
    estimatedValue: Number(row.estimated_value ?? 0),
    capturedAt: String(row.captured_at ?? row.created_at ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    firstName: String(row.first_name ?? ''),
    lastName: String(row.last_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    zip: String(row.zip ?? ''),
    propertyType: String(row.property_type ?? '') as Client['propertyType'],
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapProject(row: Record<string, unknown>): Project {
  const related = row as typeof row & {
    clients?: { first_name?: string; last_name?: string } | null;
    leads?: { email?: string } | null;
  };
  return {
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    leadId: row.lead_id ? String(row.lead_id) : null,
    title: String(row.title ?? ''),
    slug: String(row.slug ?? ''),
    scope: String(row.scope ?? ''),
    status: String(row.status ?? 'new') as Project['status'],
    priority: String(row.priority ?? 'normal') as Project['priority'],
    requestedDate: row.requested_date ? String(row.requested_date) : null,
    scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
    completionDate: row.completion_date ? String(row.completion_date) : null,
    estValue: Number(row.est_value ?? 0),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    clientName: related.clients
      ? `${related.clients.first_name ?? ''} ${related.clients.last_name ?? ''}`.trim() || 'Unknown client'
      : 'Unknown client',
    leadEmail: related.leads?.email ?? undefined,
  };
}

function mapCapture(row: Record<string, unknown>): EmailCapture {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: String(row.email ?? ''),
    captureSource: String(row.capture_source ?? ''),
    fullName: String(row.full_name ?? ''),
    phone: String(row.phone ?? ''),
    message: String(row.message ?? ''),
    ipAddress: String(row.ip_address ?? ''),
    userAgent: String(row.user_agent ?? ''),
    leadId: row.lead_id ? String(row.lead_id) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapLog(row: Record<string, unknown>): EmailLog {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    leadId: row.lead_id ? String(row.lead_id) : null,
    clientId: row.client_id ? String(row.client_id) : null,
    toEmail: String(row.to_email ?? ''),
    subject: String(row.subject ?? ''),
    template: String(row.template ?? ''),
    status: String(row.status ?? 'sent') as EmailLog['status'],
    provider: String(row.provider ?? 'console') as EmailLog['provider'],
    sentAt: String(row.sent_at ?? ''),
  };
}

function mapSettings(row: Record<string, unknown>): Settings {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    businessName: String(row.business_name ?? ''),
    businessType: String(row.business_type ?? '') as Settings['businessType'],
    replyToEmail: String(row.reply_to_email ?? ''),
    currency: String(row.currency ?? 'USD'),
    emailNotifications: Boolean(row.email_notifications ?? true),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function normalizeStats(raw: unknown): DashboardStats {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    totalLeads: Number(r.total_leads ?? 0),
    newLeads: Number(r.new_leads ?? 0),
    activeProjects: Number(r.active_projects ?? 0),
    completedProjects: Number(r.completed_projects ?? 0),
    wonLeads: Number(r.won_leads ?? 0),
    lostLeads: Number(r.lost_leads ?? 0),
    totalClients: Number(r.total_clients ?? 0),
    emailsSent: Number(r.emails_sent ?? 0),
    recentLeads: (r.recent_leads as Lead[]) ?? [],
    recentProjects: (r.recent_projects as Project[]) ?? [],
  };
}