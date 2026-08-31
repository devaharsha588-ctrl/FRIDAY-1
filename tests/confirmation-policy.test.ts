import { describe, it, expect } from 'vitest';
import { requiresUserConfirmation } from '../src/backend/orchestrator/confirmation-policy';
import type { DesktopAction } from '../src/shared/action-schema';

describe('confirmation-policy', () => {
  it('low risk for read_screen', () => {
    const action: DesktopAction = { id: 'a1', action: 'read_screen' };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.risk).toBe('low');
  });

  it('high risk + confirmation for close_app', () => {
    const action: DesktopAction = { id: 'a2', action: 'close_app', appName: 'notepad' };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.risk).toBe('high');
  });

  it('high risk + confirmation for file delete', () => {
    const action: DesktopAction = { id: 'a3', action: 'file_operation', operation: 'delete', path: 'test.txt' };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.risk).toBe('high');
  });

  it('medium risk + confirmation for file overwrite', () => {
    const action: DesktopAction = {
      id: 'a4', action: 'file_operation', operation: 'write',
      path: 'notes.txt', content: 'hello', overwrite: true
    };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.risk).toBe('medium');
  });

  it('no confirmation for file read', () => {
    const action: DesktopAction = { id: 'a5', action: 'file_operation', operation: 'read', path: 'notes.txt' };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.risk).toBe('low');
  });

  it('no confirmation for open_app', () => {
    const action: DesktopAction = { id: 'a6', action: 'open_app', appName: 'notepad' };
    const decision = requiresUserConfirmation(action);
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('produces a non-empty reason string for all actions', () => {
    const actions: DesktopAction[] = [
      { id: '1', action: 'read_screen' },
      { id: '2', action: 'close_app', appName: 'notepad' },
      { id: '3', action: 'file_operation', operation: 'delete', path: 'x.txt' },
      { id: '4', action: 'click', x: 10, y: 20, button: 'left' },
      { id: '5', action: 'type_text', text: 'hello' },
      { id: '6', action: 'keypress', keys: ['ctrl', 'c'] }
    ];
    for (const action of actions) {
      const decision = requiresUserConfirmation(action);
      expect(typeof decision.reason).toBe('string');
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });
});
