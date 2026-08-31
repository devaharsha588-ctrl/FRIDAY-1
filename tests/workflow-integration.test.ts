import { describe, it, expect, beforeEach } from 'vitest';
import { startTask } from '../src/backend/orchestrator/task-executor';
import { TaskStore } from '../src/backend/memory/task-store';
import type { DesktopAction, ActionResult } from '../src/shared/action-schema';
import type { StreamEvent } from '../src/shared/chat-contracts';

const fakeAgent = { agentUrl: 'http://localhost:8787', agentToken: 'test-token' };

function mockResult(action: DesktopAction, status: 'success' | 'failed', data?: unknown, error?: string): ActionResult {
  return {
    id: action.id,
    action: action.action,
    status,
    summary: `${action.action} ${status}`,
    data,
    error,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
}

describe('Workflow Integration (Phase 3B Multi-Step Desktop Workflows)', () => {
  let store: TaskStore;
  let emittedEvents: StreamEvent[];

  const onEvent = (event: StreamEvent) => {
    emittedEvents.push(event);
  };

  beforeEach(() => {
    store = new TaskStore();
    emittedEvents = [];
  });

  it('Successful Multi-Step Browser Workflow', async () => {
    const executedActions: DesktopAction[] = [];

    const runAction = async (action: DesktopAction): Promise<ActionResult> => {
      executedActions.push(action);
      if (action.action === 'find_browser_element') {
        return mockResult(action, 'success', { selector: 'input[name="search_query"]', role: 'searchbox' });
      }
      if (action.action === 'navigate') {
        return mockResult(action, 'success', { finalUrl: action.url });
      }
      return mockResult(action, 'success', { matchedTitle: 'YouTube' });
    };

    const task = await startTask(
      { goal: 'Go to YouTube and search for Python tutorials' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent,
        runAction,
        verificationContext: {
          getBrowserUrl: async () => 'https://www.youtube.com',
          checkProcessExists: async () => true,
          findWindows: async () => [{ title: 'YouTube', processName: 'chrome' }]
        }
      }
    );

    expect(task.status).toBe('completed');
    expect(executedActions.length).toBeGreaterThanOrEqual(4);

    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain('task_started');
    expect(eventTypes).toContain('task_planning');
    expect(eventTypes).toContain('action_created');
    expect(eventTypes).toContain('action_started');
    expect(eventTypes).toContain('observation_created');
    expect(eventTypes).toContain('action_completed');
    expect(eventTypes).toContain('task_completed');

    // Verify that verification observations were emitted
    const verObs = emittedEvents.filter(
      (e) => e.type === 'observation_created' && e.observation.type === 'verification'
    );
    expect(verObs.length).toBeGreaterThan(0);
  });

  it('Workflow with Failure and Automatic Recovery', async () => {
    const attempts = new Map<string, number>();

    const runAction = async (action: DesktopAction): Promise<ActionResult> => {
      const count = (attempts.get(action.id) ?? 0) + 1;
      attempts.set(action.id, count);

      // On first attempt of switch_window, fail with WINDOW_NOT_FOUND, then succeed
      if (action.action === 'switch_window' && count === 1) {
        return mockResult(action, 'failed', undefined, 'WINDOW_NOT_FOUND');
      }

      if (action.action === 'switch_window') {
        return mockResult(action, 'success', { matchedTitle: 'Notepad' });
      }

      return mockResult(action, 'success', { ok: true });
    };

    const task = await startTask(
      { goal: 'Open Notepad and type Hello FRIDAY' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent,
        runAction,
        verificationContext: {
          checkProcessExists: async () => true,
          findWindows: async () => [{ title: 'Notepad', processName: 'notepad' }]
        }
      }
    );

    expect(task.status).toBe('completed');

    // Verify recovery observation was created
    const recoveryObs = emittedEvents.filter(
      (e) => e.type === 'observation_created' && e.observation.type === 'recovery'
    );
    expect(recoveryObs.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('Workflow with Exhausted Retries (Graceful Failure)', async () => {
    const runAction = async (action: DesktopAction): Promise<ActionResult> => {
      if (action.action === 'find_browser_element') {
        return mockResult(action, 'failed', undefined, 'ELEMENT_NOT_FOUND');
      }
      return mockResult(action, 'success');
    };

    const task = await startTask(
      { goal: 'Go to YouTube and search for Python tutorials' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent,
        runAction,
        verificationContext: {
          getBrowserUrl: async () => 'https://www.youtube.com',
          checkProcessExists: async () => true
        }
      }
    );

    expect(task.status).toBe('failed');

    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain('task_failed');
  }, 15000);

  it('Preservation of Phase 3A Fast Path', async () => {
    const executedActions: DesktopAction[] = [];

    const runAction = async (action: DesktopAction): Promise<ActionResult> => {
      executedActions.push(action);
      return mockResult(action, 'success');
    };

    const task = await startTask(
      { goal: 'Open YouTube' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent,
        runAction,
        verificationContext: {
          getBrowserUrl: async () => 'https://www.youtube.com'
        }
      }
    );

    expect(task.status).toBe('completed');
    // Fast path: exactly 1 single action executed
    expect(executedActions.length).toBe(1);
    expect(executedActions[0].action).toBe('open_url');
  });
});
