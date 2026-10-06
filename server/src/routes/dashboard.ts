import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';

export function dashboardRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const stats = await store.getDashboardStats(userId);
      res.json({ stats });
    }),
  );

  router.get(
    '/activity',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const [captures, emailLogs] = await Promise.all([
        store.listEmailCaptures(userId, 20),
        store.listEmailLogs(userId, 20),
      ]);
      res.json({ captures, emailLogs });
    }),
  );

  return router;
}