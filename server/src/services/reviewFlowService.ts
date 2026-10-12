import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// ReviewFlow integration (outbound call from the CRM API into the ReviewFlow
// Supabase edge functions). Fire-and-forget with a small bounded retry - a
// ReviewFlow outage must never block or fail the CRM request that triggered it.
// ---------------------------------------------------------------------------

export interface ReviewFlowLeadPayload {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  service: string | null;
  message: string;
  source: 'crm';
  external_id: string;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;

export function reviewflowEnabled(): boolean {
  return config.reviewflow.enabled;
}

function endpoint(name: string): string {
  return `${config.reviewflow.url.replace(/\/+$/, '')}/functions/v1/${name}`;
}

async function post(name: string, body: Record<string, unknown> | ReviewFlowLeadPayload, attempt = 0): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(endpoint(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integration-secret': config.reviewflow.secret,
      'x-internal-call': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && attempt + 1 < MAX_ATTEMPTS && res.status >= 500) {
    const delay = BASE_DELAY_MS * 2 ** attempt;
    await new Promise((r) => setTimeout(r, delay));
    return post(name, body, attempt + 1);
  }
  return { ok: res.ok, status: res.status };
}

function fireAndForget(name: string, body: Record<string, unknown> | ReviewFlowLeadPayload, context: Record<string, unknown>): void {
  if (!config.reviewflow.enabled) return;
  void (async () => {
    try {
      const { ok, status } = await post(name, body);
      if (!ok) {
        logger.warn('ReviewFlow integration call failed', { name, status, ...context });
      } else {
        logger.info('ReviewFlow integration call succeeded', { name, ...context });
      }
    } catch (err) {
      logger.error('ReviewFlow integration call errored', { name, err: (err as Error).message, ...context });
    }
  })();
}

// A CRM lead has been marked won -> create/refresh the matching ReviewFlow lead.
export function notifyLeadWon(input: ReviewFlowLeadPayload): void {
  fireAndForget('integration-capture', input, { flow: 'lead_won', email: input.email });
}

// A CRM project has been marked completed -> create/refresh the matching ReviewFlow
// lead and (optionally) trigger the review email immediately..
export function notifyProjectCompleted(input: ReviewFlowLeadPayload): void {
  fireAndForget('integration-capture', input, { flow: 'project_completed', email: input.email });
  if (config.reviewflow.autoSend) {

    // Only trigger the email when the integration-capture call landed.. (Retryable
    // up to MAX_ATTEMPTS via post(); if it still failed, the auto-send loop in
    // ReviewFlow (or a manual click in the combined dashboard) covers it..
    void (async () => {
      try {
        const { ok, status } = await post('integration-capture', input);
        if (!ok) return;
        const { ok: sendOk, status: sendStatus } = await post('integration-send-review', {
          email: input.email,
          external_id: input.external_id,
        });
        if (!sendOk) logger.warn('ReviewFlow review email trigger failed', { status: sendStatus, email: input.email });
      } catch (err) {
        logger.error('ReviewFlow review email trigger errored', { err: (err as Error).message, email: input.email });
      }
    })();
  }
}

// Look up review state for a CRM contact (matched by email) so the combined
// dashboard can render a review-status badge next to the customer..
export async function fetchReviewStatus(email: string): Promise<ReviewFlowStatus | null> {
  if (!config.reviewflow.enabled) return null;
  try {
    const res = await fetch(endpoint('integration-lookup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integration-secret': config.reviewflow.secret,
        'x-internal-call': 'true',
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      logger.warn('ReviewFlow lookup failed', { status: res.status, email });
      return null;
    }
    const data = (await res.json()) as ReviewFlowLookupResponse;
    return {
      email,
      leads: data.leads ?? [],
      found: Boolean(data.leads?.length),
      matchedAt: data.matched_at ?? null,
    };
  } catch (err) {
    logger.error('ReviewFlow lookup errored', { err: (err as Error).message, email });
    return null;
  }
}

// Trigger a review email for a completed CRM project (matched by email).
export async function sendReviewRequest(email: string, externalId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!config.reviewflow.enabled) return { ok: false, error: 'ReviewFlow integration is not configured' };
  try {
    const { ok, status } = await post('integration-send-review', { email, external_id: externalId });
    return { ok, status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

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
export interface ReviewFlowLookupResponse {
  leads?: ReviewLeadInfo[];
  matched_at?: string | null;
}

// ---------------------------------------------------------------------------
// ReviewFlow admin API (combined dashboard). The CRM server is the single
// authenticated entry point: every call is gated by requireAuth in the route,
// then forwarded to the ReviewFlow edge functions using the integration secret.
// ---------------------------------------------------------------------------

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

export interface ReviewFlowLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service: string | null;
  message: string | null;
  source: string;
  status: string;
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
  status: string;
  triggered_by: string;
  sent_at: string;
  created_at: string;
}

export interface ReviewFlowOverview {
  settings: ReviewFlowSettings | null;
  leads: ReviewFlowLead[];
  review_requests: ReviewFlowReviewRequest[];
}

async function requestJson<T>(name: string, method: string, body?: Record<string, unknown>, path = ''): Promise<{ ok: boolean; status: number; body?: T }> {
  if (!config.reviewflow.enabled) return { ok: false, status: 404 };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-integration-secret': config.reviewflow.secret,
    'x-internal-call': 'true',
  };
  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);
  try {
    const res = await fetch(`${endpoint(name)}${path}`, init);
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, body: data as T };
  } catch (err) {
    logger.error('ReviewFlow admin call errored', { name, path, err: (err as Error).message });
    return { ok: false, status: 502 };
  }
}

export async function fetchReviewFlowOverview(): Promise<ReviewFlowOverview | null> {
  const { ok, status, body } = await requestJson<ReviewFlowOverview>('integration-overview', 'POST');
  if (!ok) {
    logger.warn('ReviewFlow overview failed', { status });
    return null;
  }
  return body ?? { settings: null, leads: [], review_requests: [] };
}

export async function createReviewFlowLead(input: Record<string, unknown>): Promise<{ ok: boolean; status: number; body?: { lead?: ReviewFlowLead; error?: string } }> {
  return requestJson('integration-lead', 'POST', input);
}

export async function updateReviewFlowLead(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean; status: number; body?: { lead?: ReviewFlowLead; error?: string } }> {
  return requestJson('integration-lead', 'POST', patch, `/${id}`);
}

export async function deleteReviewFlowLead(id: string): Promise<{ ok: boolean; status: number; body?: { error?: string } }> {
  return requestJson('integration-lead', 'DELETE', undefined, `/${id}`);
}

export async function sendReviewFlowLeadReview(id: string): Promise<{ ok: boolean; status: number; body?: { success?: boolean; message_id?: string; error?: string } }> {
  return requestJson('integration-lead', 'POST', undefined, `/${id}/send-review`);
}

export async function fetchReviewFlowSettings(): Promise<{ ok: boolean; status: number; body?: { settings?: ReviewFlowSettings; error?: string } }> {
  return requestJson('integration-settings', 'GET');
}

export async function updateReviewFlowSettings(patch: Record<string, unknown>): Promise<{ ok: boolean; status: number; body?: { settings?: ReviewFlowSettings; error?: string } }> {
  return requestJson('integration-settings', 'POST', patch);
}