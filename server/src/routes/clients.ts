import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { clientCreateSchema, clientUpdateSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';

export function clientsRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const clients = await store.listClients(userId, { q: (req.query.q as string) || undefined });
      res.json({ clients });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const client = await store.getClient(userId, req.params.id);
      if (!client) return sendError(res, 404, 'Client not found');
      res.json({ client });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = clientCreateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
            const userId = (req as AuthedRequest).user!.id;
      const client = await store.createClient(userId, parsed.data);
      res.status(201).json({ client });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsed = clientUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
            const userId = (req as AuthedRequest).user!.id;
      const client = await store.updateClient(userId, req.params.id, parsed.data);
      if (!client) return sendError(res, 404, 'Client not found');
      res.json({ client });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      // Protect against deleting a client that still has projects.
      const projects = await store.listProjects(userId, { clientId: req.params.id });
      if (projects.length > 0) {
        return sendError(
          res,
          409,
          'This client still has projects. Move or delete their projects first.',
        );
      }
      const ok = await store.deleteClient(userId, req.params.id);
      if (!ok) return sendError(res, 404, 'Client not found');
      res.json({ ok: true });
    }),
  );

  return router;
}