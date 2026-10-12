export type BusinessType =
  | ''
  | 'plumbing'
  | 'electrical'
  | 'roofing'
  | 'hvac'
  | 'landscaping'
  | 'general'
  | 'other';

export type LeadSource = 'website' | 'widget' | 'manual' | 'import' | 'other';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
export type ProjectStatus = 'new' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'normal' | 'high' | 'urgent';

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

export interface Lead {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  source: LeadSource;
  status: LeadStatus;
  estimatedValue: number;
  capturedAt: string;
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
  propertyType: '' | 'residential' | 'commercial';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  leadId?: string | null;
  leadEmail?: string;
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
}

export interface Settings {
  id: string;
  userId: string;
  businessName: string;
  businessType: BusinessType;
  replyToEmail: string;
  currency: string;
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
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
  status: string;
  provider: 'resend' | 'console';
  sentAt: string;
}

// ---- ReviewFlow integration (combined dashboard only) ----
export interface ReviewLeadInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  service: string | null;
  status: string;
  created_at: string | null;
  completed_at: string | null;
  review_send_after: string | null;
}
export interface ReviewFlowStatus {
  email: string;
  found: boolean;
  matchedAt: string | null;
  leads: ReviewLeadInfo[];
}
export type ReviewStatusPayload = { status: ReviewFlowStatus | null };
export type SendReviewPayload = { ok: boolean; status?: number; error?: string };

// ---- ReviewFlow admin (combined dashboard, single login) ----
export interface ReviewFlowSettings {
  id: string;
  business_name: string;
  google_review_url: string;
  review_from_name: string;
  review_from_email: string;
  review_reply_to_email: string;
  auto_send_enabled: boolean;
  auto_send_delay_hours: number;
  widget_api_key: string;
  email_subject_template: string;
  email_intro_text: string;
  email_button_text: string;
  email_brand_color: string;
  created_at: string;
  updated_at: string;
}

export type ReviewFlowLeadStatus = 'new' | 'in_progress' | 'complete' | 'review_sent' | 'cancelled';

export interface ReviewFlowLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service: string | null;
  message: string | null;
  source: string;
  status: ReviewFlowLeadStatus;
  external_id: string | null;
  completed_at: string | null;
  review_send_after: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewFlowReviewRequest {
  id: string;
  lead_id: string;
  recipient_email: string;
  recipient_name: string | null;
  email_subject: string | null;
  resend_message_id: string | null;
  status: 'sent' | 'delivered' | 'bounced' | 'failed';
  triggered_by: 'auto' | 'manual';
  sent_at: string;
  created_at: string;
}

export interface ReviewFlowOverview {
  settings: ReviewFlowSettings | null;
  leads: ReviewFlowLead[];
  review_requests: ReviewFlowReviewRequest[];
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  activeProjects: number;
  completedProjects: number;
  totalClients: number;
  emailsSent: number;
  recentLeads: Lead[];
  recentProjects: Project[];
}

export interface ActivityFeed {
  captures: EmailCapture[];
  emailLogs: EmailLog[];
}