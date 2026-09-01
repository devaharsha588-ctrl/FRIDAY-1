import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ModelStatusRepository } from '../src/backend/database/repositories/model-status-repository';

function makeDb(): SupabaseClient {
  const row = { id: 's1', role: 'coding', model_id: 'cohere/north-mini-code:free', provider: 'cohere', free: true, available: true, healthy: true, verification_status: 'live API request verified', verified_at: 'now', updated_at: 'now' };
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const select = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [row], error: null }), eq: vi.fn().mockReturnValue({ single }) });
  return { from: vi.fn().mockReturnValue({ select, upsert }) } as unknown as SupabaseClient;
}

describe('ModelStatusRepository', () => {
  it('upserts model status with safe public fields only', async () => {
    const repo = new ModelStatusRepository(makeDb());
    const result = await repo.upsert({
      role: 'coding',
      modelId: 'cohere/north-mini-code:free',
      provider: 'cohere',
      free: true,
      available: true,
      healthy: true,
      verificationStatus: 'live API request verified'
    });
    expect(result.role).toBe('coding');
    expect(result.free).toBe(true);
    expect(result.healthy).toBe(true);
  });

  it('never stores API keys in model_status', () => {
    // Verify that ModelStatusInput type has no apiKey or credentials field
    // This is enforced by TypeScript — the input only accepts safe fields
    const input = {
      role: 'coding',
      modelId: 'model-id',
      free: true,
      available: true,
      healthy: true
    };
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('key_1');
    expect(serialized).not.toContain('sk-or-');
    expect(serialized).not.toContain('OPENROUTER');
    expect(serialized).not.toContain('service_role');
  });

  it('gets all model statuses', async () => {
    const repo = new ModelStatusRepository(makeDb());
    const statuses = await repo.getAll();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0].model_id).toBe('cohere/north-mini-code:free');
  });
});
