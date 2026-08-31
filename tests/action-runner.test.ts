import { describe, it, expect, vi } from 'vitest';
import { runAction } from '../src/backend/orchestrator/action-runner';
import type { ActionResult, DesktopAction } from '../src/shared/action-schema';

const fakeAgent = { agentUrl: 'http://localhost:8787', agentToken: 'test-token' };

function makeAction(id = 'a1'): DesktopAction {
  return { id, action: 'read_screen' };
}

function makeResult(id = 'a1', status: ActionResult['status'] = 'success'): ActionResult {
  return {
    id, action: 'read_screen', status, summary: 'ok',
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
  };
}

describe('action-runner', () => {
  it('returns success result from mock runner', async () => {
    const result = await runAction(makeAction(), {
      agent: fakeAgent,
      runAction: async () => makeResult()
    });
    expect(result.status).toBe('success');
    expect(result.id).toBe('a1');
  });

  it('returns failed result when mock runner returns failed status', async () => {
    const result = await runAction(makeAction(), {
      agent: fakeAgent,
      runAction: async () => makeResult('a1', 'failed')
    });
    expect(result.status).toBe('failed');
  });

  it('catches thrown errors and returns failed result', async () => {
    const result = await runAction(makeAction(), {
      agent: fakeAgent,
      runAction: async () => { throw new Error('network error'); }
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('network error');
    expect(result.id).toBe('a1');
  });

  it('catches non-Error throws', async () => {
    const result = await runAction(makeAction(), {
      agent: fakeAgent,
      runAction: async () => { throw 'string error'; }
    });
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('Unknown runner error');
  });

  it('uses the runAction override instead of real agent', async () => {
    const spy = vi.fn().mockResolvedValue(makeResult());
    await runAction(makeAction(), { agent: fakeAgent, runAction: spy });
    expect(spy).toHaveBeenCalledOnce();
  });
});
