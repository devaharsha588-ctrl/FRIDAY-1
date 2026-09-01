import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationRepository } from '../src/backend/database/repositories/conversation-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';

function makeDb() {
  const row = { id: 'c1', title: 'Test', created_at: 'now', updated_at: 'now', metadata: null };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({
    single,
    order: vi.fn().mockReturnValue({ range: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    eq: vi.fn().mockReturnValue({ single })
  });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
  const del = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    neq: vi.fn().mockResolvedValue({ error: null })
  });
  return { from: vi.fn().mockReturnValue({ select, insert, update, delete: del }) } as unknown as SupabaseClient;
}

describe('ConversationRepository', () => {
  it('creates a conversation', async () => {
    const repo = new ConversationRepository(makeDb());
    const result = await repo.create('Hello');
    expect(result.id).toBe('c1');
    expect(result.title).toBe('Test');
  });

  it('rejects titles exceeding 500 characters', async () => {
    const repo = new ConversationRepository(makeDb());
    await expect(repo.create('a'.repeat(501))).rejects.toThrow(FreeTierViolationError);
  });

  it('rejects metadata exceeding 10 KB', async () => {
    const repo = new ConversationRepository(makeDb());
    const hugeMetadata = { data: 'x'.repeat(11_000) };
    await expect(repo.create('Test', hugeMetadata)).rejects.toThrow(FreeTierViolationError);
  });

  it('returns null when conversation not found', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } });
    const db = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }) } as unknown as SupabaseClient;
    const repo = new ConversationRepository(db);
    const result = await repo.get('nonexistent');
    expect(result).toBeNull();
  });
});
