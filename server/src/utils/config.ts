import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Safe on Cloudflare Workers: there is no .env file and dotenv's fs lookup
// would surface an ENOENT. The Worker runtime populates process.env itself when
// nodejs_compat_populate_process_env is enabled, so a silent no-op is correct.
try {
  dotenv.config();
} catch {
  // ignore — .env is a Node-only convenience.

}

// ---------------------------------------------------------------------------
// Config — all env vars are optional. The server runs with sensible defaults.
// Presence of SUPABASE_URL + SUPABASE_SERVICE_KEY switches the data layer into
// Supabase mode; otherwise an in-memory store is used (dev/test).
// ---------------------------------------------------------------------------

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    configured: isSupabaseConfigured(),
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'TradePro CRM <onboarding@resend.dev>',
    replyTo: process.env.RESEND_REPLY_TO || '',
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
    configured: Boolean(process.env.RESEND_API_KEY),
  },

  captureSecret: process.env.CAPTURE_SECRET || '',
  // When empty, the capture endpoint is open (like a public form).
  requireCaptureSecret: bool(process.env.REQUIRE_CAPTURE_SECRET, false),

  // ReviewFlow integration (Task C/D). Omit all of these for a pure-CRM deploy.
  reviewflow: {
    // The ReviewFlow site name (e.g. https://<project>.supabase.co or a custom
    // domain routed to the /functions/v1 edge functions).
    url: process.env.REVIEWFLOW_URL || '',
    secret: process.env.REVIEWFLOW_SECRET || '',
    // Feature flag — outbound notifications only fire when a URL + secret are set。
    enabled: Boolean(process.env.REVIEWFLOW_URL && process.env.REVIEWFLOW_SECRET),
    // Send review email automatically when a CRM project is completed.
    autoSend: bool(process.env.REVIEWFLOW_AUTO_SEND, true),
  },
};

export function loadSecretsHelpText(): string {
  return [
    'Create a .env file in /server with:',
    '  SUPABASE_URL=https://your-project.supabase.co',
    '  SUPABASE_ANON_KEY=...',
    '  SUPABASE_SERVICE_KEY=...',
    '  RESEND_API_KEY=re_...',
    '  RESEND_FROM_EMAIL=Acme Plumbing <hello@yourdomain.com>',
    '  RESEND_REPLY_TO=sales@yourdomain.com',
    '',
    'Without SUPABASE_* the API falls back to an in-memory store so you can still develop locally.',
    'Without RESEND_API_KEY emails are logged to the console.',
  ].join('\n');
}

export function ensureDataDir(): void {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}