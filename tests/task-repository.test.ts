import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskRepository } from '../src/backend/database/repositories/task-repository';
import { FreeTierViolationError } from '../src/backend/database/free-tier-guard';

function makeRow(overrides = {}) {
  return { id: 't1', goal: 'Open Notepad', status: 'planning', conversation_id: null, started_at: 'now', completed_at: null, error_code: null, error_message: null, metadata: null, ...overrides };
}

function makeDb(row = makeRow()): SupabaseClient {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ single }),
    order: vi.fn().mockReturnValue({ range: vi.fn().mockResolvedValue({ data: [], error: null }) })
  });
  return { from: vi.fn().mockReturnValue({ insert, update, select }) } as unknown as SupabaseClient;
}

describe('TaskRepository', () => {
  it('creates a task', async () => {
    const repo = new TaskRepository(makeDb());
    const task = await repo.create('Open Notepad');
    expect(task.id).toBe('t1');
    expect(task.status).toBe('planning');
  });

  it('rejects goals exceeding 20,000 characters', async () => {
    const repo = new TaskRepository(makeDb());
    await expect(repo.create('x'.repeat(20_001))).rejects.toThrow(FreeTierViolationError);
  });

  it('completes a task', async () => {
    const completed = makeRow({ status: 'completed', completed_at: 'now2' });
    const repo = new TaskRepository(makeDb(completed));
    const result = await repo.complete('t1');
    expect(result?.status).toBe('completed');
  });

  it('fails a task with error info', async () => {
    const failed = makeRow({ status: 'failed', error_code: 'TASK_FAILED', error_message: 'timed out' });
    const repo = new TaskRepository(makeDb(failed));
    const result = await repo.fail('t1', 'TASK_FAILED', 'timed out');
    expect(result?.status).toBe('failed');
    expect(result?.error_code).toBe('TASK_FAILED');
  });

  it('returns null for non-existent task', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } });
    const db = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }) } as unknown as SupabaseClient;
    const repo = new TaskRepository(db);
    expect(await repo.get('missing')).toBeNull();
  });
});
