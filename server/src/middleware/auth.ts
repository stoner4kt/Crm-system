import type { Request, Response, NextFunction } from 'express';
import { verifyUserToken } from '../lib/jwt.js';
import { sendError } from '../lib/http.js';
import { AuthService } from '../services/authService.js';
import type { AuthUser } from '../services/authService.js';

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

// Attach AuthService to requests for /me lookups.
export function authServiceMiddleware(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as AuthedRequest & { authService?: AuthService }).authService = authService;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    sendError(res, 401, 'Missing authorization token');
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const claims = verifyUserToken(token);
  if (!claims) {
    sendError(res, 401, 'Invalid or expired token');
    return;
  }

  const service = (req as AuthedRequest & { authService?: AuthService }).authService;
  if (!service) {
    sendError(res, 500, 'Auth service unavailable');
    return;
  }

  void service
    .me(claims.sub)
    .then((user) => {
      if (!user) {
        sendError(res, 401, 'Account not found');
        return;
      }
      (req as AuthedRequest).user = user;
      next();
    })
    .catch(() => {
      sendError(res, 500, 'Auth check failed');
    });
}