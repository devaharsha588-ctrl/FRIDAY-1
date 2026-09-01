import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ValidatedBackendEnv } from '../config/env-validator';

// Singleton backend service-role client — never exposed to frontend
let _serviceClient: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase service-role client.
 * Must only be called from backend code. Never imported into frontend.
 */
export function createServiceClient(env: ValidatedBackendEnv): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('[Supabase] Cannot create service client: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  _serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: { 'x-friday-client': 'friday-backend' }
    }
  });

  return _serviceClient;
}

/**
 * Resets the singleton — useful for testing or credential changes.
 */
export function resetServiceClient(): void {
  _serviceClient = null;
}

/**
 * Returns true when Supabase URL and service-role key are both configured.
 */
export function isSupabaseConfigured(env: ValidatedBackendEnv): boolean {
  return env.supabaseEnabled;
}

/**
 * Performs a lightweight health query against Supabase.
 * Returns 'healthy', 'unavailable', or 'disabled'.
 */
export async function checkSupabaseHealth(
  env: ValidatedBackendEnv
): Promise<'healthy' | 'unavailable' | 'disabled'> {
  if (!isSupabaseConfigured(env)) return 'disabled';

  try {
    const client = createServiceClient(env);
    // Lightweight existence check — just count 1 row from conversations
    const { error } = await client.from('conversations').select('id').limit(1);
    if (error) {
      // Table may not exist yet (migrations not applied) — DB is still reachable
      if (error.code === '42P01' || error.code === 'PGRST205') return 'healthy';
      return 'unavailable';
    }
    return 'healthy';
  } catch {
    return 'unavailable';
  }
}
