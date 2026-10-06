export class ApiError extends Error {
  status: number;
  fields?: Record<string, unknown>;

  constructor(status: number, message: string, fields?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = 'tradepro_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}, authed = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authed) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON responses
  }

  if (!res.ok) {
    const detail = body as { error?: { message?: string; fields?: Record<string, unknown> } } | undefined;
    throw new ApiError(res.status, detail?.error?.message || `Request failed (${res.status})`, detail?.error?.fields);
  }
  return body as T;
}

// ---- Auth ----
export interface AuthResult {
  token: string;
  user: import('../types/api.js').User;
}

export const login = (email: string, password: string) =>
  request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const register = (payload: { email: string; password: string; fullName?: string; businessName?: string }) =>
  request<{ token: string; user: import('../types/api.js').User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const me = () => request<{ user: import('../types/api.js').User }>('/auth/me');

export const updateProfile = (patch: Record<string, unknown>) =>
  request<{ user: import('../types/api.js').User }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(patch) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

// ---- Leads ----
export const listLeads = (params = '') =>
  request<{ leads: import('../types/api.js').Lead[] }>(`/leads${params}`);

export const createLead = (payload: Record<string, unknown>) =>
  request<{ lead: import('../types/api.js').Lead }>('/leads', { method: 'POST', body: JSON.stringify(payload) });

export const updateLead = (id: string, patch: Record<string, unknown>) =>
  request<{ lead: import('../types/api.js').Lead }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteLead = (id: string) =>
  request<{ ok: boolean }>(`/leads/${id}`, { method: 'DELETE' });

export const sendLeadWelcome = (id: string) =>
  request<{ ok: boolean; provider: string }>(`/leads/${id}/send-welcome`, { method: 'POST' });

// ---- Clients ----
export const listClients = (params = '') =>
  request<{ clients: import('../types/api.js').Client[] }>(`/clients${params}`);

export const createClient = (payload: Record<string, unknown>) =>
  request<{ client: import('../types/api.js').Client }>('/clients', { method: 'POST', body: JSON.stringify(payload) });

export const updateClient = (id: string, patch: Record<string, unknown>) =>
  request<{ client: import('../types/api.js').Client }>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteClient = (id: string) =>
  request<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE' });

// ---- Projects ----
export const listProjects = (params = '') =>
  request<{ projects: import('../types/api.js').Project[] }>(`/projects${params}`);

export const createProject = (payload: Record<string, unknown>) =>
  request<{ project: import('../types/api.js').Project }>('/projects', { method: 'POST', body: JSON.stringify(payload) });

export const updateProject = (id: string, patch: Record<string, unknown>) =>
  request<{ project: import('../types/api.js').Project }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteProject = (id: string) =>
  request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' });

export const sendProjectUpdate = (id: string, message: string) =>
  request<{ ok: boolean; provider: string }>(`/projects/${id}/send-update`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

// ---- Dashboard / settings / captures ----
export const getDashboardStats = () =>
  request<{ stats: import('../types/api.js').DashboardStats }>('/dashboard/stats');

export const getDashboardActivity = () =>
  request<import('../types/api.js').ActivityFeed>('/dashboard/activity');

export const getSettings = () =>
  request<{ settings: import('../types/api.js').Settings }>('/settings');

export const updateSettings = (patch: Record<string, unknown>) =>
  request<{ settings: import('../types/api.js').Settings }>('/settings', { method: 'PATCH', body: JSON.stringify(patch) });

export const listCaptures = () =>
  request<{ captures: import('../types/api.js').EmailCapture[] }>('/captures');

export const listEmailLogs = () =>
  request<{ emailLogs: import('../types/api.js').EmailLog[] }>('/captures/emails');