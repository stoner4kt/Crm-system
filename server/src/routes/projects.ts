import { Router } from 'express';
import { asyncHandler, sendError } from '../lib/http.js';
import { projectCreateSchema, projectUpdateSchema, sendProjectUpdateSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';
import { sendEmail } from '../services/emailService.js';
import type { ProjectStatus } from '../types/domain.js';

export function projectsRoutes(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const projects = await store.listProjects(userId, {
        status: (req.query.status as ProjectStatus) || undefined,
        clientId: (req.query.clientId as string) || undefined,
        q: (req.query.q as string) || undefined,
      });
      res.json({ projects });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const project = await store.getProject(userId, req.params.id);
      if (!project) return sendError(res, 404, 'Project not found');
      res.json({ project });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const parsed = projectCreateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
            const userId = (req as AuthedRequest).user!.id;

      const client = await store.getClient(userId, parsed.data.clientId);
      if (!client) return sendError(res, 400, 'Client not found');

      const project = await store.createProject(userId, parsed.data);
      res.status(201).json({ project });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsed = projectUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
            const userId = (req as AuthedRequest).user!.id;
      const existing = await store.getProject(userId, req.params.id);
      if (!existing) return sendError(res, 404, 'Project not found');

      const project = await store.updateProject(userId, req.params.id, parsed.data);
      res.json({ project });
    }),
  );

  router.post(
    '/:id/send-update',
    asyncHandler(async (req, res) => {
      const parsed = sendProjectUpdateSchema.safeParse({ projectId: req.params.id, message: req.body?.message });
      if (!parsed.success) return sendError(res, 400, 'Valid project id and message required');
            const user = (req as AuthedRequest).user!;
      const project = await store.getProject(user.id, req.params.id);
      if (!project) return sendError(res, 404, 'Project not found');

      const client = await store.getClient(user.id, project.clientId);
      if (!client) return sendError(res, 404, 'Project client not found');

      const settings = await store.getSettings(user.id);
      const result = await sendEmail(store, {
        userId: user.id,
        toEmail: client.email,
        template: 'project_update',
        vars: {
          businessName: settings?.businessName || user.businessName || 'Your Service Team',
          replyToEmail: settings?.replyToEmail || user.email,
          firstName: client.firstName,
          projectTitle: project.title,
          message: parsed.data.message,
        },
        clientId: client.id,
        leadId: project.leadId ?? undefined,
      });
      res.json(result);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
            const userId = (req as AuthedRequest).user!.id;
      const ok = await store.deleteProject(userId, req.params.id);
      if (!ok) return sendError(res, 404, 'Project not found');
      res.json({ ok: true });
    }),
  );

  return router;
}