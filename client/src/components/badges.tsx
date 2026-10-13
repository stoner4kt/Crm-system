import { Badge } from './ui.js';
import type { LeadStatus, ProjectPriority, ProjectStatus } from '../types/api.js';

const leadTone: Record<LeadStatus, string> = {
  new: 'blue',
  contacted: 'amber',
  qualified: 'violet',
  proposal: 'teal',
  won: 'green',
  lost: 'rose',
};

const projectTone: Record<ProjectStatus, string> = {
  new: 'blue',
  scheduled: 'teal',
  in_progress: 'amber',
  on_hold: 'slate',
  completed: 'green',
  cancelled: 'rose',
};

const priorityTone: Record<ProjectPriority, string> = {
  low: 'slate',
  normal: 'blue',
  high: 'amber',
  urgent: 'rose',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge label={status.replace('_', ' ')} tone={leadTone[status]} />;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge label={status.replace('_', ' ')} tone={projectTone[status]} />;
}

export function PriorityBadge({ priority }: { priority: ProjectPriority }) {
  return <Badge label={priority} tone={priorityTone[priority]} />;
}

export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
export const PROJECT_STATUSES: ProjectStatus[] = ['new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'];
export const PROJECT_PRIORITIES: ProjectPriority[] = ['low', 'normal', 'high', 'urgent'];

export function fmtMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}