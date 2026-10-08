import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { leadCreateSchema, leadUpdateSchema, sendWelcomeSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';
import { sendEmail } from '../services/emailService.js';
import { notifyLeadWon } from '../services/reviewFlowService.js';
import type { LeadStatus } from '../types/domain.js';

export function leadsRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const leads = await store.listLeads(userId, {
        status: (req.query.status as LeadStatus) || undefined,
        q: (req.query.q as string) || undefined,
      });
      res.json({ leads });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const lead = await store.getLead(userId, req.params.id);
      if (!lead) return sendError(res, 404, 'Lead not found');
      res.json({ lead });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = leadCreateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);

            const user = (req as AuthedRequest).user!;
      const lead = await store.createLead(user.id, parsed.data);

      // Auto-email a professional "welcome" via Resend when the lead is first
      // captured (only for website/widget sources to avoid spamming manual entries).
      if (['website', 'widget'].includes(lead.source)) {
        const settings = await store.getSettings(user.id);
        await sendEmail(store, {
          userId: user.id,
          toEmail: lead.email,
          template: 'lead_welcome',
          vars: {
            businessName: settings?.businessName || user.businessName || 'Your Service Team',
            replyToEmail: settings?.replyToEmail || user.email,
            firstName: lead.firstName,
            service: lead.service,
          },
          leadId: lead.id,
        });
      }

      res.status(201).json({ lead });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsed = leadUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);

            const user = (req as AuthedRequest).user!;
      const existing = await store.getLead(user.id, req.params.id);
      if (!existing) return sendError(res, 404, 'Lead not found');

      const lead = await store.updateLead(user.id, req.params.id, parsed.data);

      // When a lead flips to 'won', promote it to a client + project. Send the
      // owner a quote_status update email too.
      if (parsed.data.status === 'won' && existing.status !== 'won' && lead) {
        const { clientId, projectId } = await store.convertLeadToClient(user.id, lead.id);
        const settings = await store.getSettings(user.id);
        await sendEmail(store, {
          userId: user.id,
          toEmail: lead.email,
          template: 'quote_status',
          vars: {
            businessName: settings?.businessName || user.businessName || 'Your Service Team',
            replyToEmail: settings?.replyToEmail || user.email,
            firstName: lead.firstName || lead.lastName,
            status: 'accepted — let’s get scheduled',
            estValue: lead.estimatedValue,
          },
          leadId: lead.id,
          clientId,
        });
        // ReviewFlow integration — fire-and-forget, never blocks the response.
        notifyLeadWon({
          email: lead.email,
          first_name: lead.firstName || null,
          last_name: lead.lastName || null,
          phone: lead.phone || null,
          service: typeof lead.service === 'string' ? lead.service : null,
          message: 'Won lead from CRM',
          source: 'crm',
          external_id: projectId,
        });
        res.json({ lead, converted: { clientId, projectId } });
        return;
      }

      res.json({ lead });
    }),
  );

  router.post(
    '/:id/send-welcome',
    asyncHandler(async (req, res) => {
      const parsed = sendWelcomeSchema.safeParse({ leadId: req.params.id });
      if (!parsed.success) return sendError(res, 400, 'Invalid lead id');

            const user = (req as AuthedRequest).user!;
      const lead = await store.getLead(user.id, req.params.id);
      if (!lead) return sendError(res, 404, 'Lead not found');

      const settings = await store.getSettings(user.id);
      const result = await sendEmail(store, {
        userId: user.id,
        toEmail: lead.email,
        template: 'lead_welcome',
        vars: {
          businessName: settings?.businessName || user.businessName || 'Your Service Team',
          replyToEmail: settings?.replyToEmail || user.email,
          firstName: lead.firstName,
          service: lead.service,
        },
        leadId: lead.id,
      });
      res.json(result);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const ok = await store.deleteLead(userId, req.params.id);
      if (!ok) return sendError(res, 404, 'Lead not found');
      res.json({ ok: true });
    }),
  );

  return router;
}