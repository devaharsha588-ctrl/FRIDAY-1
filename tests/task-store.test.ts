import { describe, it, expect } from 'vitest';
import { TaskStore } from '../src/backend/memory/task-store';

describe('TaskStore', () => {
  it('creates a task with planning status', () => {
    const store = new TaskStore();
    const task = store.create('open Notepad');
    expect(task.status).toBe('planning');
    expect(task.goal).toBe('open Notepad');
    expect(task.stepCount).toBe(0);
    expect(task.actions).toHaveLength(0);
    expect(task.results).toHaveLength(0);
    expect(task.pendingConfirmation).toBeNull();
  });

  it('retrieves a task by id', () => {
    const store = new TaskStore();
    const task = store.create('take screenshot');
    expect(store.get(task.id)).toBeDefined();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('updates task status', () => {
    const store = new TaskStore();
    const task = store.create('do stuff');
    const updated = store.updateStatus(task.id, 'running');
    expect(updated?.status).toBe('running');
    expect(store.get(task.id)?.status).toBe('running');
  });

  it('sets completedAt when status is terminal', () => {
    const store = new TaskStore();
    const task = store.create('do stuff');
    store.updateStatus(task.id, 'completed');
    expect(store.get(task.id)?.completedAt).toBeDefined();
  });

  it('records error message on failure', () => {
    const store = new TaskStore();
    const task = store.create('do stuff');
    store.updateStatus(task.id, 'failed', 'timed out');
    expect(store.get(task.id)?.error).toBe('timed out');
  });

  it('adds actions and increments stepCount', () => {
    const store = new TaskStore();
    const task = store.create('do stuff');
    const action = { id: 'act-1', action: 'read_screen' as const };
    store.addAction(task.id, action);
    const updated = store.get(task.id);
    expect(updated?.stepCount).toBe(1);
    expect(updated?.actions).toHaveLength(1);
  });

  it('adds and updates results', () => {
    const store = new TaskStore();
    const task = store.create('do stuff');
    const result = {
      id: 'r-1', action: 'read_screen', status: 'success' as const,
      summary: 'ok', startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
    };
    store.addResult(task.id, result);
    expect(store.get(task.id)?.results).toHaveLength(1);
    const updated = { ...result, summary: 'updated' };
    store.addResult(task.id, updated);
    expect(store.get(task.id)?.results).toHaveLength(1);
    expect(store.get(task.id)?.results[0].summary).toBe('updated');
  });

  it('sets and clears pending confirmation', () => {
    const store = new TaskStore();
    const task = store.create('close Notepad');
    const action = { id: 'a1', action: 'close_app' as const, appName: 'notepad' };
    store.setPendingConfirmation(task.id, { actionId: 'a1', action, risk: 'high', reason: 'will close' });
    expect(store.get(task.id)?.pendingConfirmation?.actionId).toBe('a1');
    store.setPendingConfirmation(task.id, null);
    expect(store.get(task.id)?.pendingConfirmation).toBeNull();
  });

  it('lists tasks sorted by startedAt descending', async () => {
    const store = new TaskStore();
    store.create('first');
    await new Promise((r) => setTimeout(r, 5));
    store.create('second');
    const list = store.list();
    expect(list[0].goal).toBe('second');
    expect(list[1].goal).toBe('first');
  });

  it('deletes a task', () => {
    const store = new TaskStore();
    const task = store.create('ephemeral');
    expect(store.delete(task.id)).toBe(true);
    expect(store.get(task.id)).toBeUndefined();
    expect(store.delete('ghost')).toBe(false);
  });

  it('clears all tasks', () => {
    const store = new TaskStore();
    store.create('a'); store.create('b');
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it('works without Supabase configured (pure in-memory mode)', () => {
    // No supabaseClient passed — must work identically to before
    const store = new TaskStore();
    const task = store.create('open browser', 'conv-1');
    expect(task.id).toBeDefined();
    expect(task.goal).toBe('open browser');
    store.updateStatus(task.id, 'completed');
    expect(store.get(task.id)?.status).toBe('completed');
  });

  it('keeps runtime task state serializable (no AbortControllers in task object)', () => {
    const store = new TaskStore();
    const task = store.create('long task');
    // Task state must be JSON-serializable — no live objects stored on the task
    const serialized = JSON.stringify(task);
    const parsed = JSON.parse(serialized);
    expect(parsed.id).toBe(task.id);
    expect(parsed.goal).toBe('long task');
    expect(task).not.toHaveProperty('abortController');
  });
});

