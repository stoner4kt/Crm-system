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