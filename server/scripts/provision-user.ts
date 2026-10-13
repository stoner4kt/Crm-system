/**
 * Provision a user (email + password) in the CRM Supabase Auth project.

 * Usage (also see the README):  cd server && npx tsx scripts/provision-user.ts
 * with these env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY        (CRM Supabase project)
 *   PROVISION_EMAIL + PROVISION_PASSWORD      (the login to create)
 *
 * The user is created via auth.admin.createUser() with email confirmed. If the
 * email already exists, creation is skipped. Secrets flow via env vars only.
 */

import { createClient } from '@supabase/supabase-js';

interface Target {
  url: string;
  serviceKey: string;
  label: string;
}

interface Env {
  email: string;
  password: string;
  targets: Target[];
}

function loadEnv(): Env {
  const email = (process.env.PROVISION_EMAIL || '').trim();
  const password = process.env.PROVISION_PASSWORD || '';
  const targets: Target[] = [];

  const crmUrl = (process.env.SUPABASE_URL || '').trim();
  const crmKey = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (crmUrl && crmKey) targets.push({ url: crmUrl, serviceKey: crmKey, label: 'CRM' });

  const missing: string[] = [];
  if (!email) missing.push('PROVISION_EMAIL');
  if (!password) missing.push('PROVISION_PASSWORD');
  if (targets.length < 1) missing.push('SUPABASE_URL/SERVICE_KEY');
  if (missing.length) {
    console.error(`Missing or incomplete env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  return { email, password, targets };
}

async function provision(target: Target, email: string, password: string): Promise<void> {
  const client = createClient(target.url, target.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (error.code === 'user_already_exists') {
      console.warn(`[${target.label}] user already exists - skipped (${email})`);
      return;
    }
    throw new Error(`[${target.label}] ${error.message}`);
  }
  console.log(`[${target.label}] created user: ${data.user?.email} (${data.user?.id})`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  console.log(`Provisioning ${env.email} in ${env.targets.length} Supabase project(s)...`);
  for (const target of env.targets) {
    await provision(target, env.email, env.password);
  }
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});