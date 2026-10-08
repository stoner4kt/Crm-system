import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';
import {
  fetchReviewStatus,
  reviewflowEnabled,
  sendReviewRequest,
} from '../services/reviewFlowService.js';

// ---------------------------------------------------------------------------
// ReviewFlow integration proxy - the combined dashboard talks to ReviewFlow
// through these authenticated CRM endpoints instead of calling Supabase edge
// functions directly (single outbound entry point, all env-config driven).
// Every route 404s when the integration is not configured, so a pure-CRM
// deploy is unaffected.
// ---------------------------------------------------------------------------

export function integrationRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/reviews/status',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');

      const email = String(req.query.email || '').trim();
      if (!email) return sendError(res, 400, 'email query parameter is required');

      const status = await fetchReviewStatus(email);
      if (!status) return sendError(res, 502, 'Failed to fetch review status from ReviewFlow');
      res.json({ status });
    }),
  );

  router.post(
    '/reviews/send',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');

      const userId = (req as AuthedRequest).user!.id;
      const email = String(req.body?.email || '').trim();
      const externalId = String(req.body?.externalId || '').trim();
      if (!email || !externalId) return sendError(res, 400, 'email and externalId are required');

      // Only allow sending to contacts that belong to this CRM user.

      const clients = await store.listClients(userId);
      const hasClient = clients.some((c) => c.email.toLowerCase() === email.toLowerCase());
      const leads = await store.listLeads(userId);
      const hasLead = leads.some((l) => l.email.toLowerCase() === email.toLowerCase());
      if (!hasClient && !hasLead) return sendError(res, 404, 'No matching contact found for this email');

      const result = await sendReviewRequest(email, externalId);
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.error || 'Failed to send review request');
      }
      res.json({ ok: true, status: result.status });
    }),
  );

  return router;

}