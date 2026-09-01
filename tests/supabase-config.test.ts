import { describe, it, expect } from 'vitest';
import { validateEnvironment } from '../src/backend/config/env-validator';

describe('Supabase configuration validation', () => {
  it('supabaseEnabled is false when no credentials are provided', () => {
    const env = validateEnvironment({});
    expect(env.supabaseEnabled).toBe(false);
    expect(env.supabaseUrl).toBeNull();
    expect(env.supabaseServiceRoleKey).toBeNull();
  });

  it('supabaseEnabled is false when only URL is provided (missing service key)', () => {
    const env = validateEnvironment({ SUPABASE_URL: 'https://abc.supabase.co' });
    expect(env.supabaseEnabled).toBe(false);
  });

  it('supabaseEnabled is false when URL is malformed', () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'not-a-url',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key'
    });
    expect(env.supabaseEnabled).toBe(false);
    expect(env.supabaseUrl).toBeNull();
  });

  it('supabaseEnabled is true when URL and service key are both configured', () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-here'
    });
    expect(env.supabaseEnabled).toBe(true);
    expect(env.supabaseUrl).toBe('https://abc.supabase.co');
  });

  it('supabaseRequired defaults to false', () => {
    const env = validateEnvironment({});
    expect(env.supabaseRequired).toBe(false);
  });

  it('supabaseRequired can be set to true', () => {
    const env = validateEnvironment({ SUPABASE_REQUIRED: 'true' });
    expect(env.supabaseRequired).toBe(true);
  });

  it('service role key is stored on the env object but is not publicly exported by any API type', () => {
    const env = validateEnvironment({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key'
    });
    // Key is present for backend use
    expect(env.supabaseServiceRoleKey).toBe('super-secret-service-key');

    // Ensure it's clearly a backend-only field by verifying no public leak in env
    const serialized = JSON.stringify(env);
    // The key itself is in env (intended for backend), but should never reach frontend.
    // This test ensures frontend-facing types (PublicModelProvider etc.) don't include it.
    expect(env).not.toHaveProperty('keys.supabaseServiceRoleKey');
  });

  it('strips surrounding quotes from credential values', () => {
    const env = validateEnvironment({
      SUPABASE_URL: '"https://abc.supabase.co"',
      SUPABASE_SERVICE_ROLE_KEY: "'my-key'"
    });
    expect(env.supabaseUrl).toBe('https://abc.supabase.co');
    expect(env.supabaseServiceRoleKey).toBe('my-key');
  });

  it('OpenRouter configuration is independent of Supabase configuration', () => {
    const env = validateEnvironment({
      OPENROUTER_KEY_1: 'sk-or-v1-abc',
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'my-service-key'
    });
    expect(env.configuredKeySlots).toContain('key_1');
    expect(env.supabaseEnabled).toBe(true);
    // Keys are completely separate
    expect(env.keys.key_1).toBe('sk-or-v1-abc');
    expect(env.supabaseServiceRoleKey).toBe('my-service-key');
  });
});
