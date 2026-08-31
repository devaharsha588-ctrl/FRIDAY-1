import { describe, it, expect } from 'vitest';
import { executeDirectAction } from '../src/backend/orchestrator/direct-action-executor';
import type { DesktopAction, ActionResult } from '../src/shared/action-schema';

const fakeAgent = { agentUrl: 'http://localhost:8787', agentToken: 'test-token' };

describe('direct-action-executor', () => {
  it('executes action and returns successMessage', async () => {
    const action: DesktopAction = {
      id: 'a1',
      action: 'open_url',
      url: 'https://www.youtube.com'
    };

    const response = await executeDirectAction(action, {
      agent: fakeAgent,
      successMessage: 'Opened YouTube.',
      runAction: async (a) => ({
        id: a.id,
        action: a.action,
        status: 'success',
        summary: 'Opened https://www.youtube.com',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    });

    expect(response.result.status).toBe('success');
    expect(response.message).toBe('Opened YouTube.');
  });

  it('falls back to result.summary when no successMessage provided', async () => {
    const action: DesktopAction = {
      id: 'a2',
      action: 'new_tab',
      url: 'https://www.google.com'
    };

    const response = await executeDirectAction(action, {
      agent: fakeAgent,
      runAction: async (a) => ({
        id: a.id,
        action: a.action,
        status: 'success',
        summary: 'Opened a new tab.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    });

    expect(response.message).toBe('Opened a new tab.');
  });

  it('returns friendly failure message when agent blocks an action', async () => {
    const action: DesktopAction = {
      id: 'a3',
      action: 'open_app',
      appName: 'unknown_app'
    };

    const response = await executeDirectAction(action, {
      agent: fakeAgent,
      runAction: async (a) => ({
        id: a.id,
        action: a.action,
        status: 'blocked',
        summary: 'unknown_app is not in FRIDAY_ALLOWED_APPS.',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
    });

    expect(response.result.status).toBe('blocked');
    expect(response.message).toContain('I could not complete that');
    expect(response.message).toContain('unknown_app is not in FRIDAY_ALLOWED_APPS.');
  });

  it('handles thrown errors gracefully', async () => {
    const action: DesktopAction = {
      id: 'a4',
      action: 'open_app',
      appName: 'calculator'
    };

    const response = await executeDirectAction(action, {
      agent: fakeAgent,
      runAction: async () => {
        throw new Error('agent down');
      }
    });

    expect(response.result.status).toBe('failed');
    expect(response.message).toContain('agent down');
  });
});
