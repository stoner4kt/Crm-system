import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';
import {
  createReviewFlowLead,
  deleteReviewFlowLead,
  fetchReviewFlowOverview,
  fetchReviewFlowSettings,
  fetchReviewStatus,
  reviewflowEnabled,
  sendReviewFlowLeadReview,
  sendReviewRequest,
  updateReviewFlowLead,
  updateReviewFlowSettings,
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

  // ---- ReviewFlow admin (combined dashboard, single CRM login) ----

  // Full snapshot: settings + leads + review_requests in one call.
  router.get(
    '/reviews/overview',
    asyncHandler(async (_req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const overview = await fetchReviewFlowOverview();
      if (!overview) return sendError(res, 502, 'Failed to load ReviewFlow overview');
      res.json({ overview });
    }),
  );

  // Create a ReviewFlow lead.
  router.post(
    '/reviews/leads',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await createReviewFlowLead(req.body ?? {});
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to create lead');
      }
      res.status(201).json({ lead: result.body?.lead });
    }),
  );

  // Update a ReviewFlow lead (fields to patch in the body).
  router.patch(
    '/reviews/leads/:id',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await updateReviewFlowLead(String(req.params.id), req.body ?? {});
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to update lead');
      }
      res.json({ lead: result.body?.lead });
    }),
  );

  // Delete a ReviewFlow lead.
  router.delete(
    '/reviews/leads/:id',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await deleteReviewFlowLead(String(req.params.id));
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to delete lead');
      }
      res.json({ ok: true });
    }),
  );

  // Send a review email now for a ReviewFlow lead.
  router.post(
    '/reviews/leads/:id/send-review',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await sendReviewFlowLeadReview(String(req.params.id));
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to send review request');
      }
      res.json({ ok: true, message_id: result.body?.message_id });
    }),
  );

  // Read ReviewFlow settings.
  router.get(
    '/reviews/settings',
    asyncHandler(async (_req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await fetchReviewFlowSettings();
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to load settings');
      }
      res.json({ settings: result.body?.settings });
    }),
  );

  // Update ReviewFlow settings.
  router.patch(
    '/reviews/settings',
    asyncHandler(async (req, res) => {
      if (!reviewflowEnabled()) return sendError(res, 404, 'ReviewFlow integration is not enabled');
      const result = await updateReviewFlowSettings(req.body ?? {});
      if (!result.ok) {
        const status = result.status && result.status < 500 ? result.status : 502;
        return sendError(res, status, result.body?.error || 'Failed to update settings');
      }
      res.json({ settings: result.body?.settings });
    }),
  );

  return router;

}