import { describe, expect, test } from 'vitest';
import { planComputerActions } from '../src/backend/orchestrator/planner';
import { evaluateActionRisk, parseDesktopAction } from '../src/shared/action-schema';

describe('planner and confirmation policy integration', () => {
  test('safe request plans low-risk action without confirmation requirement', () => {
    const actions = planComputerActions('take a screenshot');
    expect(actions.length).toBe(1);
    expect(actions[0].action).toBe('read_screen');

    const riskEval = evaluateActionRisk(actions[0]);
    expect(riskEval.risk).toBe('low');
    expect(riskEval.requiresConfirmation).toBe(false);
  });

  test('dangerous request (close app) plans high-risk action requiring confirmation', () => {
    const actions = planComputerActions('close notepad');
    expect(actions.length).toBe(1);
    expect(actions[0].action).toBe('close_app');

    const riskEval = evaluateActionRisk(actions[0]);
    expect(riskEval.risk).toBe('high');
    expect(riskEval.requiresConfirmation).toBe(true);
  });

  test('dangerous request (delete file) plans high-risk action requiring confirmation', () => {
    const actions = planComputerActions('delete file old_report.txt');
    expect(actions.length).toBe(1);
    expect(actions[0].action).toBe('file_operation');
    if (actions[0].action === 'file_operation') {
      expect(actions[0].operation).toBe('delete');
    }

    const riskEval = evaluateActionRisk(actions[0]);
    expect(riskEval.risk).toBe('high');
    expect(riskEval.requiresConfirmation).toBe(true);
  });

  test('invalid action payload is rejected by schema', () => {
    expect(() => parseDesktopAction({
      id: 'invalid-id',
      action: 'unknown_unsupported_action'
    })).toThrow();
  });
});
