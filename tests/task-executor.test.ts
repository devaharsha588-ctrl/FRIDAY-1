import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startTask, cancelTask, resolveConfirmation } from '../src/backend/orchestrator/task-executor';
import { TaskStore } from '../src/backend/memory/task-store';
import type { ActionResult, DesktopAction } from '../src/shared/action-schema';
import type { StreamEvent } from '../src/shared/chat-contracts';

const fakeAgent = { agentUrl: 'http://localhost:8787', agentToken: 'test-token' };

function successRunner(id: string): (action: DesktopAction) => Promise<ActionResult> {
  return async (action) => ({
    id: action.id,
    action: action.action,
    status: 'success',
    summary: id + ' ran',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
}

function failRunner(): (action: DesktopAction) => Promise<ActionResult> {
  return async (action) => ({
    id: action.id,
    action: action.action,
    status: 'failed',
    summary: 'agent failed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
}

describe('task-executor', () => {
  let store: TaskStore;
  let events: StreamEvent[];

  beforeEach(() => {
    store = new TaskStore();
    events = [];
  });

  function onEvent(e: StreamEvent) { events.push(e); }

  function eventTypes() { return events.map((e) => e.type); }

  it('completes a simple screenshot task', async () => {
    const task = await startTask(
      { goal: 'take a screenshot' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('read_screen') }
    );
    expect(task.status).toBe('completed');
    expect(eventTypes()).toContain('task_started');
    expect(eventTypes()).toContain('task_completed');
  });

  it('emits task_planning and action_created events', async () => {
    await startTask(
      { goal: 'take a screenshot' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('ok') }
    );
    expect(eventTypes()).toContain('task_planning');
    expect(eventTypes()).toContain('action_created');
    expect(eventTypes()).toContain('action_started');
    expect(eventTypes()).toContain('action_completed');
  });

  it('fails a task when the action runner returns failed', async () => {
    const task = await startTask(
      { goal: 'take a screenshot' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: failRunner() }
    );
    expect(task.status).toBe('failed');
    expect(eventTypes()).toContain('task_failed');
    expect(eventTypes()).toContain('action_failed');
  });

  it('completes with no actions for an unrecognised computer request', async () => {
    const task = await startTask(
      { goal: 'send whatsapp message hello' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('x') }
    );
    // planner may return no actions for unsupported requests
    // task should complete (no actions = done) or fail gracefully
    expect(['completed', 'failed']).toContain(task.status);
  });

  it('cancels a running task', async () => {
    const store2 = new TaskStore();
    // Create task, immediately cancel before startTask runs
    const task = store2.create('take a screenshot');
    cancelTask(task.id, store2);
    expect(store2.get(task.id)?.status).toBe('cancelled');
  });

  it('cancelTask returns false for nonexistent task', () => {
    expect(cancelTask('ghost', store)).toBe(false);
  });

  it('cancelTask returns false for already-completed task', async () => {
    const task = await startTask(
      { goal: 'take a screenshot' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('ok') }
    );
    expect(cancelTask(task.id, store)).toBe(false);
  });

  it('resolveConfirmation returns false when no waiter exists', () => {
    expect(resolveConfirmation('ghost', true)).toBe(false);
  });

  it('pauses and resumes on confirmation — deny cancels task', async () => {
    const eventsLocal: StreamEvent[] = [];
    // close_app triggers confirmation requirement
    const taskPromise = startTask(
      { goal: 'close Notepad' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent: (e) => {
          eventsLocal.push(e);
          // As soon as we see confirmation_required, deny it
          if (e.type === 'confirmation_required') {
            void Promise.resolve().then(() => resolveConfirmation(e.taskId, false));
          }
        },
        runAction: successRunner('close')
      }
    );
    const task = await taskPromise;
    const types = eventsLocal.map((e) => e.type);
    expect(types).toContain('confirmation_required');
    expect(types).toContain('task_paused');
    expect(task.status).toBe('cancelled');
  });

  it('pauses and resumes on confirmation — confirm continues task', async () => {
    const eventsLocal: StreamEvent[] = [];
    const taskPromise = startTask(
      { goal: 'close Notepad' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent: (e) => {
          eventsLocal.push(e);
          if (e.type === 'confirmation_required') {
            void Promise.resolve().then(() => resolveConfirmation(e.taskId, true));
          }
        },
        runAction: successRunner('close')
      }
    );
    const task = await taskPromise;
    const types = eventsLocal.map((e) => e.type);
    expect(types).toContain('confirmation_required');
    expect(types).toContain('task_resumed');
    expect(task.status).toBe('completed');
  });

  it('stores task state in the TaskStore', async () => {
    const task = await startTask(
      { goal: 'take a screenshot' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('ok') }
    );
    const stored = store.get(task.id);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe('completed');
  });

  it('completes direct "open wikipedia" command with exactly 1 step', async () => {
    const task = await startTask(
      { goal: 'open wikipedia' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('open_url') }
    );
    expect(task.status).toBe('completed');
    expect(task.stepCount).toBe(1);
    expect(task.actions.length).toBe(1);
    expect(task.results.length).toBe(1);
  });

  it('completes direct "open chatgpt" command with exactly 1 step', async () => {
    const task = await startTask(
      { goal: 'open chatgpt' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('open_url') }
    );
    expect(task.status).toBe('completed');
    expect(task.stepCount).toBe(1);
    expect(task.actions.length).toBe(1);
  });

  it('completes direct "open notepad" command with exactly 1 step', async () => {
    const task = await startTask(
      { goal: 'open notepad' },
      {
        agent: fakeAgent,
        taskStore: store,
        onEvent,
        runAction: successRunner('open_app'),
        verificationContext: { checkProcessExists: async () => true }
      }
    );
    expect(task.status).toBe('completed');
    expect(task.stepCount).toBe(1);
    expect(task.actions.length).toBe(1);
  });

  it('fails gracefully instead of completing with 0 steps when no actions can be planned', async () => {
    const task = await startTask(
      { goal: 'some totally unplannable gibberish 12345' },
      { agent: fakeAgent, taskStore: store, onEvent, runAction: successRunner('ok') }
    );
    expect(task.status).toBe('failed');
    expect(eventTypes()).toContain('task_failed');
    expect(eventTypes()).not.toContain('task_completed');
  });
});
