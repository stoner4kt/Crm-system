import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { Store } from './Store.js';
import { LocalStore } from './LocalStore.js';
import { SupabaseStore } from './SupabaseStore.js';

export function resolveStore(): Store {
  if (config.supabase.configured) {
    logger.info('Data layer: Supabase (REST + RLS)');
    return new SupabaseStore();
  }
  logger.warn(
    'Data layer: in-memory LocalStore. Set SUPABASE_URL + SUPABASE_SERVICE_KEY to use Supabase.',
  );
  return new LocalStore();
}

let singleton: Store | null = null;

export function getStore(): Store {
  if (!singleton) singleton = resolveStore();
  return singleton;
}

export function createFreshStore(): Store {
  return new LocalStore();
}