import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Store } from '../store/Store.js';
import { signUserToken } from '../lib/jwt.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { User } from '../types/domain.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  businessName: string;
  businessType: string;
  phone: string;
}

export interface AuthSuccess {
  token: string;
  user: AuthUser;
  provider: 'supabase' | 'local';
}

export interface AuthFailure {
  error: string;
  status: number;
  provider: 'supabase' | 'local';
}

export type AuthResult = AuthSuccess | AuthFailure;

export function isSuccess(r: AuthResult): r is AuthSuccess {
  return 'token' in r;
}

function toAuthUser(u: User): AuthUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    businessName: u.businessName,
    businessType: u.businessType,
    phone: u.phone,
  };
}

// ---------------------------------------------------------------------------
// Auth service. Uses Supabase Auth (signUp / signInWithPassword) when it is
// configured. Falls back to LocalStore (bcrypt + local JWT) for development.
// ---------------------------------------------------------------------------
export class AuthService {
  private local: Store;
  private admin: SupabaseClient | null = null;

  constructor(store: Store) {
    this.local = store;
    if (config.supabase.configured) {
      this.admin = createClient(config.supabase.url, config.supabase.serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }

  get useSupabase(): boolean {
    return this.admin !== null;
  }

  async register(input: {
    email: string;
    password: string;
    fullName?: string;
    businessName?: string;
    businessType?: string;
    phone?: string;
  }): Promise<AuthResult> {
    if (this.admin) {
      try {
        const { data, error } = await this.admin.auth.signUp({
          email: input.email.toLowerCase().trim(),
          password: input.password,
          options: {
            data: {
              full_name: input.fullName ?? '',
              business_name: input.businessName ?? '',
              business_type: input.businessType ?? '',
            },
            emailRedirectTo: process.env.SUPABASE_EMAIL_REDIRECT || `${this.baseUrl()}/login`,
          },
        });
        if (error) return { error: error.message, status: 400, provider: 'supabase' };
        if (!data.user) return { error: 'Registration failed', status: 500, provider: 'supabase' };

        const user = await this.sbProfile(data.user.id, data.user.email ?? input.email);
        return { token: signUserToken(user), user: toAuthUser(user), provider: 'supabase' };
      } catch (err) {
        logger.error('Supabase signUp failed', { err: (err as Error).message });
        return { error: 'Supabase sign up failed', status: 500, provider: 'supabase' };
      }
    }

    try {
      const user = await this.local.createUser(input);
      return { token: signUserToken(user), user: toAuthUser(user), provider: 'local' };
    } catch (err) {
      const status = (err as Error & { code?: string }).code === 'DUPLICATE_EMAIL' ? 409 : 500;
      return { error: (err as Error).message, status, provider: 'local' };
    }
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    if (this.admin) {
      try {
        const { data, error } = await this.admin.auth.signInWithPassword({
          email: input.email.toLowerCase().trim(),
          password: input.password,
        });
        if (error || !data.user) {
          return { error: error?.message || 'Invalid credentials', status: 401, provider: 'supabase' };
        }
        const user = await this.sbProfile(data.user.id, data.user.email ?? input.email);
        return { token: signUserToken(user), user: toAuthUser(user), provider: 'supabase' };
      } catch (err) {
        logger.error('Supabase login failed', { err: (err as Error).message });
        return { error: 'Supabase login failed', status: 500, provider: 'supabase' };
      }
    }

    const user = await this.local.findByEmail(input.email);
    if (!user) return { error: 'Invalid email or password', status: 401, provider: 'local' };
    const valid = await this.local.verifyPassword(user, input.password);
    if (!valid) return { error: 'Invalid email or password', status: 401, provider: 'local' };
    return { token: signUserToken(user), user: toAuthUser(user), provider: 'local' };
  }

  async me(userId: string): Promise<AuthUser | null> {
    const local = await this.local.findById(userId);
    if (local) return toAuthUser(local);
    if (this.admin) {
      const profile = await this.profile(userId);
      if (profile) return toAuthUser(profile);
    }
    return null;
  }

  // Data-layer passthroughs (so routes can share the single store instance).
  async updateProfile(id: string, patch: { fullName?: string; businessName?: string; businessType?: string; phone?: string }) {
    return this.local.updateProfile(id, patch as never);
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.local.findById(userId);
    if (!user) return false;
    return this.local.verifyPassword(user, password);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    await this.local.updatePassword(id, newPassword);
  }

  async updatePasswordAdmin(id: string, newPassword: string): Promise<void> {
    if (!this.admin) throw new Error('Supabase not configured');
    await this.admin.auth.admin.updateUserById(id, { password: newPassword });
  }

  async resetPassword(email: string, opts: { redirectTo: string }): Promise<void> {
    if (!this.admin) throw new Error('Supabase not configured');
    await this.admin.auth.resetPasswordForEmail(email, { redirectTo: opts.redirectTo });
  }

  private async sbProfile(id: string, email: string): Promise<User> {
    const { data } = await this.admin!.from('profiles').select('*').eq('id', id).maybeSingle();
    if (data) return mapSupabaseProfile(data);
    return {
      id,
      email,
      fullName: '',
      businessName: '',
      businessType: '',
      phone: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async profile(id: string): Promise<User | null> {
    const { data } = await this.admin!.from('profiles').select('*').eq('id', id).maybeSingle();
    return data ? mapSupabaseProfile(data) : null;
  }

  private baseUrl(): string {
    return process.env.PUBLIC_BASE_URL || `http://localhost:${config.port}`;
  }
}

function mapSupabaseProfile(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    fullName: String(row.full_name ?? ''),
    businessName: String(row.business_name ?? ''),
    businessType: String(row.business_type ?? '') as User['businessType'],
    phone: String(row.phone ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}
