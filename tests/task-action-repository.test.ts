import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskActionRepository } from '../src/backend/database/repositories/task-action-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';
import type { DesktopAction, ActionResult } from '../src/shared/action-schema';

function makeDb(): SupabaseClient {
  const row = { id: 'a1', task_id: 't1', action_id: 'act-1', action_type: 'open_url', status: 'running', risk: 'low', requires_confirmation: false, confirmed: null, started_at: 'now', completed_at: null, result_summary: null, error_code: null, metadata: null };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [row], error: null }) }) });
  return { from: vi.fn().mockReturnValue({ insert, update, select }) } as unknown as SupabaseClient;
}

describe('TaskActionRepository', () => {
  it('records an action', async () => {
    const repo = new TaskActionRepository(makeDb());
    const action: DesktopAction = { id: 'act-1', action: 'open_url', url: 'https://example.com', risk: 'low' };
    const result = await repo.record('t1', action);
    expect(result.action_id).toBe('act-1');
    expect(result.action_type).toBe('open_url');
    expect(result.status).toBe('running');
  });

  it('rejects oversized result summaries', async () => {
    const repo = new TaskActionRepository(makeDb());
    const result: ActionResult = {
      id: 'act-1',
      action: 'open_url',
      status: 'success',
      summary: 'x'.repeat(10_001),
      startedAt: 'now',
      completedAt: 'now2'
    };
    await expect(repo.complete('t1', result)).rejects.toThrow(FreeTierViolationError);
  });

  it('accepts normal sized result summaries', async () => {
    const repo = new TaskActionRepository(makeDb());
    const result: ActionResult = {
      id: 'act-1',
      action: 'open_url',
      status: 'success',
      summary: 'Opened example.com successfully',
      startedAt: 'now',
      completedAt: 'now2'
    };
    await expect(repo.complete('t1', result)).resolves.toBeUndefined();
  });
});
