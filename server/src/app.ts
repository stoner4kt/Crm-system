import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { createFreshStore } from './store/index.js';
import type { Store } from './store/Store.js';
import { AuthService } from './services/authService.js';
import { authServiceMiddleware } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { leadsRoutes } from './routes/leads.js';
import { clientsRoutes } from './routes/clients.js';
import { projectsRoutes } from './routes/projects.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { settingsRoutes } from './routes/settings.js';
import { capturesRoutes } from './routes/captures.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'tradepro-crm',
      version: '1.0.0',
      store: config.supabase.configured ? 'supabase' : 'local',
      email: config.resend.configured ? 'resend' : 'console',
    });
  });

  // Single store instance shared by auth + all resource routes.
  const store: Store = createFreshStore();
  const authService = new AuthService(store);
  app.use(authServiceMiddleware(authService));

  app.use('/api/auth', authRoutes(authService));
  app.use('/api/leads', leadsRoutes(store));
  app.use('/api/clients', clientsRoutes(store));
  app.use('/api/projects', projectsRoutes(store));
  app.use('/api/dashboard', dashboardRoutes(store));
  app.use('/api/settings', settingsRoutes(store));
  app.use('/api/capture', capturesRoutes(store));
  app.use('/api/captures', capturesRoutes(store));

  // Serve the built client in production.
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (config.nodeEnv === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // 404 for unknown /api/* paths.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'Not found' } });
  });

  // Error handler.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { err: err.message, stack: err.stack });
    res.status(500).json({ error: { message: 'Internal server error' } });
  });

  return app;
}

export async function startServer(): Promise<{ app: express.Express; server: ReturnType<express.Express['listen']> }> {
  const app = createApp();
  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const s = app.listen(config.port, () => resolve(s));
  });
  logger.info('TradePro CRM started', { port: config.port, store: config.supabase.configured ? 'supabase' : 'local', resend: config.resend.configured });
  return { app, server };
}