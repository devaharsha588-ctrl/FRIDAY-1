import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageRepository } from '../src/backend/database/repositories/message-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';

function makeDb(): SupabaseClient {
  const row = { id: 'm1', conversation_id: 'c1', role: 'user', content: 'Hi', created_at: 'now', metadata: null };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const rangeResult = vi.fn().mockResolvedValue({ data: [], error: null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({ range: rangeResult }),
      single
    }),
    single,
    order: vi.fn().mockReturnValue({ range: rangeResult })
  });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return { from: vi.fn().mockReturnValue({ select, insert, delete: del }) } as unknown as SupabaseClient;
}

describe('MessageRepository', () => {
  it('appends a message successfully', async () => {
    const repo = new MessageRepository(makeDb());
    const msg = await repo.append('c1', 'user', 'Hello FRIDAY');
    expect(msg.id).toBe('m1');
    expect(msg.role).toBe('user');
  });

  it('rejects content exceeding 50,000 characters', async () => {
    const repo = new MessageRepository(makeDb());
    await expect(repo.append('c1', 'user', 'x'.repeat(50_001))).rejects.toThrow(FreeTierViolationError);
  });

  it('allows content at exactly 50,000 characters', async () => {
    const repo = new MessageRepository(makeDb());
    await expect(repo.append('c1', 'user', 'x'.repeat(50_000))).resolves.toBeDefined();
  });

  it('rejects oversized metadata', async () => {
    const repo = new MessageRepository(makeDb());
    await expect(repo.append('c1', 'user', 'Hello', { big: 'x'.repeat(11_000) })).rejects.toThrow(FreeTierViolationError);
  });
});
