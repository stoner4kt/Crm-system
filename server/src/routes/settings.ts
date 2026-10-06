import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { settingsUpdateSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';

export function settingsRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const settings = await store.getSettings(userId);
      res.json({ settings });
    }),
  );

  router.put(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = settingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
            const userId = (req as AuthedRequest).user!.id;
      const settings = await store.upsertSettings(userId, parsed.data);
      res.json({ settings });
    }),
  );

  return router;
}