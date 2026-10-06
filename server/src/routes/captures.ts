import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { captureSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/emailService.js';
import type { PublicCaptureResult } from '../types/domain.js';

// ---------------------------------------------------------------------------
// Public capture endpoint. Embedded on a marketing site as:
//   POST /api/capture  { email, fullName?, phone?, message?, businessEmail? }
// `businessEmail` selects which CRM owner the capture belongs to. When the
// email belongs to a registered user, it is routed to them; otherwise the
// capture is recorded against the "default owner" (first user) when one knows
// their email via CAPTURE_OWNER_EMAIL.
// ---------------------------------------------------------------------------

export function capturesRoutes(store: Store): Router {
  const router = Router();

  router.post(
    '/public',
    asyncHandler(async (req, res) => {
            const parsed = captureSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);

      const body = parsed.data;

      // Optional shared-secret protection for the capture endpoint.
      if (config.requireCaptureSecret || config.captureSecret) {
        const provided = String(req.headers['x-capture-secret'] ?? body.businessEmail ?? '');
        const okSecret = provided === config.captureSecret;
        if (config.requireCaptureSecret && !okSecret) {
          return sendError(res, 401, 'Invalid capture secret');
        }
        if (config.captureSecret && !okSecret && !body.businessEmail) {
          return sendError(res, 401, 'Capture secret required');
        }
      }

      // Resolve the owning user.
      let ownerId: string | null = null;
      if (body.businessEmail) {
        const owner = await store.findByEmail(body.businessEmail);
        if (owner) ownerId = owner.id;
      }
      if (!ownerId && config.captureSecret) {
        // If a capture secret is set, it may double as the owner's email.
        const owner = await store.findByEmail(config.captureSecret.toLowerCase());
        if (owner) ownerId = owner.id;
      }

      if (!ownerId) {
        logger.warn('Email capture received with no matching CRM owner', { email: body.email });
        const orphan: PublicCaptureResult = {
          ok: false,
          captureId: '',
          message: 'Thank you! We could not match your request to a business yet.',
        };
        return res.status(200).json(orphan);
      }

      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();

      const capture = await store.saveEmailCapture(ownerId, {
        email: body.email,
        fullName: body.fullName,
        phone: body.phone,
        message: body.message,
        captureSource: body.captureSource,
        ipAddress: ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
      });

      // Create a lead for the captured visitor so it lands on the dashboard,
      // then fire the professional welcome email via Resend.
      let leadId: string | undefined;
      try {
        const lead = await store.createLead(ownerId, {
          firstName: (body.fullName || '').split(' ')[0] ?? '',
          lastName: (body.fullName || '').split(' ').slice(1).join(' ') ?? '',
          email: body.email,
          phone: body.phone,
          service: body.captureSource === 'website' ? '' : body.captureSource,
          message: body.message,
          source: 'website',
          status: 'new',
        });
        leadId = lead.id;
        const owner = (await store.findById(ownerId))!;
        const settings = await store.getSettings(ownerId);
        await sendEmail(store, {
          userId: ownerId,
          toEmail: body.email,
          template: 'lead_welcome',
          vars: {
            businessName: settings?.businessName || owner.businessName || 'Your Service Team',
            replyToEmail: settings?.replyToEmail || owner.email,
            firstName: body.fullName?.split(' ')[0] ?? '',
            service: body.captureSource,
          },
          leadId: lead.id,
        });
      } catch (err) {
        logger.error('Failed to create lead from capture', { err: (err as Error).message });
      }

      res.status(201).json({
        ok: true,
        captureId: capture.id,
        ...(leadId ? { leadId } : {}),
        message: 'Thanks — we received your request and will be in touch shortly.',
      } satisfies PublicCaptureResult);
    }),
  );

  // Private: inspect the latest captures and sent emails.
  const privateRouter = Router({ mergeParams: true });
  privateRouter.use(requireAuth);

  privateRouter.get(
    '/',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const captures = await store.listEmailCaptures(userId, 50);
      res.json({ captures });
    }),
  );

  privateRouter.get(
    '/emails',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const emailLogs = await store.listEmailLogs(userId, 50);
      res.json({ emailLogs });
    }),
  );

  router.use('/', privateRouter);

  return router;
}