import { describe, expect, test } from 'vitest';
import {
  desktopActionSchema,
  evaluateActionRisk,
  isDestructiveAction
} from '../src/shared/action-schema';

describe('desktop action schema', () => {
  test('accepts valid open_url actions', () => {
    const action = desktopActionSchema.parse({
      id: 'a1',
      action: 'open_url',
      url: 'https://example.com'
    });

    expect(action.action).toBe('open_url');
    expect(evaluateActionRisk(action).risk).toBe('low');
  });

  test('rejects click actions without target or coordinates', () => {
    expect(() => desktopActionSchema.parse({
      id: 'a2',
      action: 'click',
      button: 'left'
    })).toThrow();
  });

  test('evaluates close_app as high risk requiring confirmation', () => {
    const action = desktopActionSchema.parse({
      id: 'a3',
      action: 'close_app',
      appName: 'notepad'
    });

    expect(isDestructiveAction(action)).toBe(true);
    const riskEval = evaluateActionRisk(action);
    expect(riskEval.risk).toBe('high');
    expect(riskEval.requiresConfirmation).toBe(true);
  });

  test('evaluates delete file operation as high risk requiring confirmation', () => {
    const action = desktopActionSchema.parse({
      id: 'a4',
      action: 'file_operation',
      operation: 'delete',
      path: 'notes.txt'
    });

    expect(isDestructiveAction(action)).toBe(true);
    const riskEval = evaluateActionRisk(action);
    expect(riskEval.risk).toBe('high');
    expect(riskEval.requiresConfirmation).toBe(true);
  });

  test('evaluates list files as low risk', () => {
    const action = desktopActionSchema.parse({
      id: 'a5',
      action: 'file_operation',
      operation: 'list',
      path: '.'
    });

    expect(isDestructiveAction(action)).toBe(false);
    const riskEval = evaluateActionRisk(action);
    expect(riskEval.risk).toBe('low');
    expect(riskEval.requiresConfirmation).toBe(false);
  });
});
