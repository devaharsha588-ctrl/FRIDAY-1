import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryRepository } from '../src/backend/database/repositories/memory-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';

function makeDb(): SupabaseClient {
  const row = { id: 'm1', content: 'prefers TypeScript', category: 'coding', importance: 80, created_at: 'now', updated_at: 'now', metadata: null };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, count: 1 }) });
  const listResult = vi.fn().mockResolvedValue({ data: [row], error: null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single,
      order: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: listResult }) })
    }),
    order: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: listResult }) }),
    single
  });
  return { from: vi.fn().mockReturnValue({ select, insert, update, delete: del }) } as unknown as SupabaseClient;
}

describe('MemoryRepository', () => {
  it('creates a memory with valid content', async () => {
    const repo = new MemoryRepository(makeDb());
    const mem = await repo.create('prefers TypeScript', 'coding', 80);
    expect(mem.id).toBe('m1');
    expect(mem.content).toBe('prefers TypeScript');
    expect(mem.importance).toBe(80);
  });

  it('rejects memory content exceeding 5,000 characters', async () => {
    const repo = new MemoryRepository(makeDb());
    await expect(repo.create('x'.repeat(5_001))).rejects.toThrow(FreeTierViolationError);
  });

  it('allows memory content at exactly 5,000 characters', async () => {
    const repo = new MemoryRepository(makeDb());
    await expect(repo.create('x'.repeat(5_000))).resolves.toBeDefined();
  });

  it('clamps importance to 0-100 range', async () => {
    const repo = new MemoryRepository(makeDb());
    await expect(repo.create('test', 'general', 999)).resolves.toBeDefined();
    await expect(repo.create('test', 'general', -5)).resolves.toBeDefined();
  });

  it('deletes a memory and returns true', async () => {
    const repo = new MemoryRepository(makeDb());
    const deleted = await repo.delete('m1');
    expect(deleted).toBe(true);
  });

  it('rejects oversized metadata', async () => {
    const repo = new MemoryRepository(makeDb());
    await expect(repo.create('test', undefined, undefined, { big: 'x'.repeat(11_000) })).rejects.toThrow(FreeTierViolationError);
  });
});
