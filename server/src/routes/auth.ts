import { Router } from 'express';
import { AuthService, isSuccess } from '../services/authService.js';
import { asyncHandler, sendError } from '../lib/http.js';
import { loginSchema, registerSchema, profileUpdateSchema, passwordChangeSchema } from '../utils/validation.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import type { Store } from '../store/Store.js';

export function authRoutes(authService: AuthService): Router {
  const router = Router();

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
      }
      const result = await authService.register(parsed.data);
      if (!isSuccess(result)) {
        return sendError(res, result.status, result.error);
      }
      res.status(201).json({ token: result.token, user: result.user, provider: result.provider });
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
      }
      const result = await authService.login(parsed.data);
      if (!isSuccess(result)) {
        return sendError(res, result.status, result.error);
      }
      res.json({ token: result.token, user: result.user, provider: result.provider });
    }),
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ user: (req as AuthedRequest).user });
    }),
  );

  router.patch(
    '/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
      }
      const user = (req as AuthedRequest).user!;
      const updated = await authService.updateProfile(user.id, parsed.data);
      if (!updated) return sendError(res, 404, 'Profile not found');
      res.json({ user: updated });
    }),
  );

  router.post(
    '/change-password',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = passwordChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid input', parsed.error.flatten().fieldErrors);
      }
      const user = (req as AuthedRequest).user!;

      if (authService.useSupabase) {
        // Supabase mode: verify & update through the AuthService admin.
        const loginResult = await authService.login({ email: user.email, password: parsed.data.currentPassword });
        if (!isSuccess(loginResult)) return sendError(res, 401, 'Current password is incorrect');
        try {
          await (authService as AuthServiceWithAdmin).updatePasswordAdmin(user.id, parsed.data.newPassword);
          return res.json({ ok: true, message: 'Password updated' });
        } catch {
          return sendError(res, 500, 'Failed to update password');
        }
      }

      const verified = await authService.verifyPassword(user.id, parsed.data.currentPassword);
      if (!verified) return sendError(res, 401, 'Current password is incorrect');
      await authService.updatePassword(user.id, parsed.data.newPassword);
      res.json({ ok: true, message: 'Password updated' });
    }),
  );

  router.post(
    '/reset-password',
    asyncHandler(async (req, res) => {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!email || !email.includes('@')) return sendError(res, 400, 'Valid email required');

      if (authService.useSupabase) {
        try {
          await (authService as AuthServiceWithAdmin).resetPassword(email, {
            redirectTo: process.env.SUPABASE_PASSWORD_RESET_REDIRECT || 'http://localhost:4000/login',
          });
        } catch {
          // Never leak whether an email exists.
        }
      }
      // Local mode has no email transport for resets — still respond 200 to avoid
      // user enumeration, and log the request.
      res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
    }),
  );

  return router;
}

interface AuthServiceWithAdmin {
  updatePasswordAdmin(id: string, newPassword: string): Promise<void>;
  resetPassword(email: string, opts: { redirectTo: string }): Promise<void>;
}