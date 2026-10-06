import { z } from 'zod';
import {
  BUSINESS_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
} from '../types/domain.js';

const email = z.string().trim().toLowerCase().email('Valid email required').max(254);

export const zEmail = email;
export const zOptionalString = z.string().trim().max(2000);

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().max(120).optional().default(''),
  businessName: z.string().max(160).optional().default(''),
  businessType: z.enum(BUSINESS_TYPES).optional().default(''),
  phone: z.string().max(40).optional().default(''),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password required').max(128),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().max(120).optional(),
  businessName: z.string().max(160).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  phone: z.string().max(40).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

export const leadCreateSchema = z.object({
  firstName: z.string().max(120).optional().default(''),
  lastName: z.string().max(120).optional().default(''),
  email,
  phone: z.string().max(40).optional().default(''),
  service: z.string().max(60).optional().default(''),
  message: z.string().max(4000).optional().default(''),
  source: z.enum(LEAD_SOURCES).optional().default('manual'),
  status: z.enum(LEAD_STATUSES).optional().default('new'),
  estimatedValue: z.number().min(0).max(1_000_000_000).optional().default(0),
});

export const leadUpdateSchema = leadCreateSchema.partial();

export const clientCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name required').max(120),
  lastName: z.string().max(120).optional().default(''),
  email,
  phone: z.string().max(40).optional().default(''),
  address: z.string().max(300).optional().default(''),
  city: z.string().max(120).optional().default(''),
  state: z.string().max(60).optional().default(''),
  zip: z.string().max(20).optional().default(''),
  propertyType: z.enum(['', 'residential', 'commercial']).optional().default(''),
  notes: z.string().max(4000).optional().default(''),
});

export const clientUpdateSchema = clientCreateSchema.partial();

export const projectCreateSchema = z.object({
  clientId: z.string().uuid('Valid client id required'),
  leadId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, 'Title required').max(200),
  scope: z.string().max(4000).optional().default(''),
  status: z.enum(PROJECT_STATUSES).optional().default('new'),
  priority: z.enum(PROJECT_PRIORITIES).optional().default('normal'),
  requestedDate: z.string().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  completionDate: z.string().nullable().optional(),
  estValue: z.number().min(0).max(1_000_000_000).optional().default(0),
  notes: z.string().max(4000).optional().default(''),
});

export const projectUpdateSchema = projectCreateSchema.partial();

export const captureSchema = z.object({
  email,
  fullName: z.string().max(120).optional().default(''),
  phone: z.string().max(40).optional().default(''),
  message: z.string().max(2000).optional().default(''),
  captureSource: z.enum(['website', 'landing', 'widget', 'promo', 'other']).optional().default('website'),
  businessEmail: z.string().optional().default(''),
});

export const settingsUpdateSchema = z.object({
  businessName: z.string().max(160).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  replyToEmail: email.optional(),
  currency: z.string().max(8).optional(),
  emailNotifications: z.boolean().optional(),
});

export const sendWelcomeSchema = z.object({
  leadId: z.string().uuid('Valid lead id required'),
});

export const sendProjectUpdateSchema = z.object({
  projectId: z.string().uuid('Valid project id required'),
  message: z.string().min(1, 'Message required').max(2000),
});
