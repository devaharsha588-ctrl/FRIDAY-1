import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PreferencesRepository } from '../src/backend/database/repositories/preferences-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';

function makeDb(value: unknown = 'dark'): SupabaseClient {
  const row = { id: 'p1', key: 'theme', value, updated_at: 'now' };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ single }),
    order: vi.fn().mockResolvedValue({ data: [{ key: 'theme', value: 'dark' }], error: null })
  });
  const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, count: 1 }) });
  return { from: vi.fn().mockReturnValue({ select, upsert, delete: del }) } as unknown as SupabaseClient;
}

describe('PreferencesRepository', () => {
  it('sets a preference', async () => {
    const repo = new PreferencesRepository(makeDb('dark'));
    const pref = await repo.set('theme', 'dark');
    expect(pref.key).toBe('theme');
    expect(pref.value).toBe('dark');
  });

  it('gets a preference value', async () => {
    const repo = new PreferencesRepository(makeDb('dark'));
    const val = await repo.get('theme');
    expect(val).toBe('dark');
  });

  it('returns null for missing preference', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } });
    const db = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }) } as unknown as SupabaseClient;
    const repo = new PreferencesRepository(db);
    expect(await repo.get('nonexistent')).toBeNull();
  });

  it('rejects keys exceeding 200 characters', async () => {
    const repo = new PreferencesRepository(makeDb());
    await expect(repo.set('k'.repeat(201), 'value')).rejects.toThrow(FreeTierViolationError);
  });

  it('rejects oversized values', async () => {
    const repo = new PreferencesRepository(makeDb());
    await expect(repo.set('theme', { big: 'x'.repeat(11_000) })).rejects.toThrow(FreeTierViolationError);
  });

  it('gets all preferences as a flat object', async () => {
    const select = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [{ key: 'theme', value: 'dark' }, { key: 'language', value: 'en' }], error: null })
    });
    const db = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
    const repo = new PreferencesRepository(db);
    const all = await repo.getAll();
    expect(all).toEqual({ theme: 'dark', language: 'en' });
  });
});
