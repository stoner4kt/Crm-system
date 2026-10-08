// ---------------------------------------------------------------------------
// Domain model shared by the stores, routes and client.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PROJECT_STATUSES = ['new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const BUSINESS_TYPES = ['', 'plumbing', 'electrical', 'roofing', 'hvac', 'landscaping', 'general', 'other'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const PROPERTY_TYPES = ['', 'residential', 'commercial'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LEAD_SOURCES = ['website', 'widget', 'manual', 'import', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface User {
  id: string;
  email: string;
  fullName: string;
  businessName: string;
  businessType: BusinessType;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: PropertyType;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  service: BusinessType | string;
  message: string;
  source: LeadSource;
  status: LeadStatus;
  estimatedValue: number;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  clientId: string;
  leadId: string | null;
  title: string;
  slug: string;
  scope: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  requestedDate: string | null;
  scheduledDate: string | null;
  completionDate: string | null;
  estValue: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields (included by the API)
  clientName?: string;
  clientEmail?: string;
  leadEmail?: string;
}

export interface EmailCapture {
  id: string;
  userId: string;
  email: string;
  captureSource: string;
  fullName: string;
  phone: string;
  message: string;
  ipAddress: string;
  userAgent: string;
  leadId: string | null;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  userId: string;
  leadId: string | null;
  clientId: string | null;
  toEmail: string;
  subject: string;
  template: string;
  status: 'sent' | 'failed' | 'pending';
  provider: 'resend' | 'console';
  sentAt: string;
}

export interface Settings {
  id: string;
  userId: string;
  businessName: string;
  businessType: BusinessType | string;
  replyToEmail: string;
  currency: string;
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  activeProjects: number;
  completedProjects: number;
  wonLeads: number;
  lostLeads: number;
  totalClients: number;
  emailsSent: number;
  recentLeads: Lead[];
  recentProjects: Project[];
}

export interface PublicCaptureResult {
  ok: boolean;
  captureId: string;
  leadId?: string;
  message: string;
}