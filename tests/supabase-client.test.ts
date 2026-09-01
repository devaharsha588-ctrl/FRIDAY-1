import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSupabaseConfigured, resetServiceClient } from '../src/backend/database/supabase';
import { validateEnvironment } from '../src/backend/config/env-validator';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })),
    auth: {}
  }))
}));

describe('Supabase client', () => {
  beforeEach(() => {
    resetServiceClient();
  });

  it('isSupabaseConfigured returns false when not configured', () => {
    const env = validateEnvironment({});
    expect(isSupabaseConfigured(env)).toBe(false);
  });

  it('isSupabaseConfigured returns true when URL and service key are set', () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
    });
    expect(isSupabaseConfigured(env)).toBe(true);
  });

  it('createServiceClient throws when not configured', async () => {
    const env = validateEnvironment({});
    const { createServiceClient } = await import('../src/backend/database/supabase');
    expect(() => createServiceClient(env)).toThrow('Cannot create service client');
  });

  it('createServiceClient succeeds when credentials are provided', async () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
    });
    const { createServiceClient } = await import('../src/backend/database/supabase');
    const client = createServiceClient(env);
    expect(client).toBeDefined();
  });

  it('createServiceClient returns the same singleton on multiple calls', async () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
    });
    const { createServiceClient } = await import('../src/backend/database/supabase');
    const c1 = createServiceClient(env);
    const c2 = createServiceClient(env);
    expect(c1).toBe(c2);
  });

  it('service role key is never returned from isSupabaseConfigured', () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret'
    });
    const result = isSupabaseConfigured(env);
    expect(result).toBe(true);
    // The return value is just a boolean — no key leak
    expect(typeof result).toBe('boolean');
    expect(String(result)).not.toContain('super-secret');
  });
});
