import type {
  Client,
  DashboardStats,
  EmailCapture,
  EmailLog,
  Lead,
  LeadSource,
  LeadStatus,
  Project,
  ProjectPriority,
  ProjectStatus,
  Settings,
  User,
} from '../types/domain.js';

export interface LeadFilters {
  status?: LeadStatus;
  q?: string;
  source?: LeadSource;
  limit?: number;
  offset?: number;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  q?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}

export interface ClientFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface NewLeadInput {
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  service?: string;
  message?: string;
  source?: LeadSource;
  status?: LeadStatus;
  estimatedValue?: number;
}

export interface NewClientInput {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  notes?: string;
}

export interface NewProjectInput {
  clientId: string;
  leadId?: string | null;
  title: string;
  scope?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  requestedDate?: string | null;
  scheduledDate?: string | null;
  completionDate?: string | null;
  estValue?: number;
  notes?: string;
}

export interface NewEmailCaptureInput {
  email: string;
  fullName?: string;
  phone?: string;
  message?: string;
  captureSource?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface EmailLogInput {
  leadId?: string | null;
  clientId?: string | null;
  toEmail: string;
  subject: string;
  template: string;
  status: 'sent' | 'failed' | 'pending';
  provider: 'resend' | 'console';
}

// ---------------------------------------------------------------------------
// Store interface — one contract, two implementations:
//   * SupabaseStore (production; REST + Supabase Auth)
//   * LocalStore     (development/tests; in-memory with JWT auth)
// ---------------------------------------------------------------------------
export interface AuthStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  createUser(input: {
    email: string;
    password: string;
    fullName?: string;
    businessName?: string;
    businessType?: string;
    phone?: string;
  }): Promise<User>;
  updateProfile(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'businessName' | 'businessType' | 'phone'>> & { businessType?: string },
  ): Promise<User | null>;
  verifyPassword(user: Pick<User, 'id' | 'email'>, password: string): Promise<boolean>;
  updatePassword(id: string, newPassword: string): Promise<void>;
}

export interface CrudStore {
  listLeads(userId: string, filters?: LeadFilters): Promise<Lead[]>;
  getLead(userId: string, leadId: string): Promise<Lead | null>;
  createLead(userId: string, input: NewLeadInput): Promise<Lead>;
  updateLead(userId: string, leadId: string, patch: Partial<NewLeadInput>): Promise<Lead | null>;
  deleteLead(userId: string, leadId: string): Promise<boolean>;

  listClients(userId: string, filters?: ClientFilters): Promise<Client[]>;
  getClient(userId: string, clientId: string): Promise<Client | null>;
  createClient(userId: string, input: NewClientInput): Promise<Client>;
  updateClient(userId: string, clientId: string, patch: Partial<NewClientInput>): Promise<Client | null>;
  deleteClient(userId: string, clientId: string): Promise<boolean>;

  listProjects(userId: string, filters?: ProjectFilters): Promise<Project[]>;
  getProject(userId: string, projectId: string): Promise<Project | null>;
  createProject(userId: string, input: NewProjectInput): Promise<Project>;
  updateProject(userId: string, projectId: string, patch: Partial<NewProjectInput>): Promise<Project | null>;
  deleteProject(userId: string, projectId: string): Promise<boolean>;

  getSettings(userId: string): Promise<Settings | null>;
  upsertSettings(userId: string, patch: Partial<Settings>): Promise<Settings>;
}

export interface CaptureStore {
  saveEmailCapture(userId: string, input: NewEmailCaptureInput): Promise<EmailCapture>;
  listEmailCaptures(userId: string, limit?: number): Promise<EmailCapture[]>;
  logEmail(userId: string, input: EmailLogInput): Promise<EmailLog>;
  listEmailLogs(userId: string, limit?: number): Promise<EmailLog[]>;
}

export interface AnalyticsStore {
  getDashboardStats(userId: string): Promise<DashboardStats>;
}

export interface Store extends AuthStore, CrudStore, CaptureStore, AnalyticsStore {
  convertLeadToClient(userId: string, leadId: string): Promise<{ clientId: string; projectId: string }>;
}