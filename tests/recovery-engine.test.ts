import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRecoveryState,
  recordRecoveryAttempt,
  decideRecovery,
  MAX_TOTAL_RECOVERIES,
  MAX_RETRIES_PER_ACTION,
  type RecoveryState
} from '../src/backend/orchestrator/recovery-engine';
import type { DesktopAction, ActionResult, ActionStatus } from '../src/shared/action-schema';

function mockResult(status: ActionStatus, options?: Partial<ActionResult>): ActionResult {
  return {
    id: 'res-1',
    action: 'test-action',
    status,
    summary: 'result summary',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...options
  };
}

describe('Recovery Engine', () => {
  let state: RecoveryState;
  
  beforeEach(() => {
    state = createRecoveryState();
  });

  describe('createRecoveryState & recordRecoveryAttempt', () => {
    it('creates initial 0 count state', () => {
      expect(state.totalRecoveries).toBe(0);
      expect(state.actionRetries.size).toBe(0);
    });

    it('increments action count and total count correctly', () => {
      recordRecoveryAttempt(state, 'action-1');
      expect(state.totalRecoveries).toBe(1);
      expect(state.actionRetries.get('action-1')).toBe(1);

      recordRecoveryAttempt(state, 'action-1');
      expect(state.totalRecoveries).toBe(2);
      expect(state.actionRetries.get('action-1')).toBe(2);

      recordRecoveryAttempt(state, 'action-2');
      expect(state.totalRecoveries).toBe(3);
      expect(state.actionRetries.get('action-2')).toBe(1);
    });
  });

  describe('Global limits', () => {
    it('stops with limit_exceeded when MAX_TOTAL_RECOVERIES is reached', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'button' };
      const result: ActionResult = mockResult('failed', { error: 'some error' });
      
      state.totalRecoveries = MAX_TOTAL_RECOVERIES;
      const decision = decideRecovery(action, result, state);
      
      expect(decision.shouldRetry).toBe(false);
      expect(decision.strategy).toBe('limit_exceeded');
    });

    it('stops with limit_exceeded when MAX_RETRIES_PER_ACTION is reached', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'button' };
      const result: ActionResult = mockResult('failed', { error: 'some error' });
      
      state.actionRetries.set('action-1', MAX_RETRIES_PER_ACTION);
      const decision = decideRecovery(action, result, state);
      
      expect(decision.shouldRetry).toBe(false);
      expect(decision.strategy).toBe('limit_exceeded');
    });
  });

  describe('Error string matching', () => {
    const testCases = [
      {
        error: 'WINDOW_NOT_FOUND',
        expectedRetry: true,
        expectedStrategy: 'wait_for_window',
        expectedWaitMs: 2000
      },
      {
        error: 'window not found',
        expectedRetry: true,
        expectedStrategy: 'wait_for_window',
        expectedWaitMs: 2000
      },
      {
        error: 'ELEMENT_NOT_FOUND',
        expectedRetry: true,
        expectedStrategy: 'wait_for_element',
        expectedWaitMs: 1000 // retryCount + 1 = 1
      },
      {
        error: 'element not found',
        expectedRetry: true,
        expectedStrategy: 'wait_for_element',
        expectedWaitMs: 1000 // retryCount + 1 = 1
      },
      {
        error: 'AMBIGUOUS_TARGET',
        expectedRetry: false,
        expectedStrategy: 'ambiguous'
      },
      {
        error: 'ambiguous target',
        expectedRetry: false,
        expectedStrategy: 'ambiguous'
      },
      {
        error: 'PLATFORM_UNSUPPORTED',
        expectedRetry: false,
        expectedStrategy: 'unsupported'
      },
      {
        error: 'platform unsupported',
        expectedRetry: false,
        expectedStrategy: 'unsupported'
      },
      {
        error: 'CDP_NOT_CONNECTED',
        expectedRetry: false,
        expectedStrategy: 'browser_unavailable'
      },
      {
        error: 'browser not available',
        expectedRetry: false,
        expectedStrategy: 'browser_unavailable'
      },
      {
        error: 'NAVIGATION_FAILED',
        expectedRetry: true,
        expectedStrategy: 'retry_navigation',
        expectedWaitMs: 1500
      },
      {
        error: 'navigation failed',
        expectedRetry: true,
        expectedStrategy: 'retry_navigation',
        expectedWaitMs: 1500
      },
      {
        error: 'TIMEOUT',
        expectedRetry: true,
        expectedStrategy: 'retry_after_timeout',
        expectedWaitMs: 3000
      },
      {
        error: 'timed out',
        expectedRetry: true,
        expectedStrategy: 'retry_after_timeout',
        expectedWaitMs: 3000
      }
    ];

    testCases.forEach(({ error, expectedRetry, expectedStrategy, expectedWaitMs }) => {
      it(`handles error: ${error}`, () => {
        const action: DesktopAction = { id: 'action-1', action: 'read_screen' };
        const result: ActionResult = mockResult('failed', { error });
        
        const decision = decideRecovery(action, result, state);
        
        expect(decision.shouldRetry).toBe(expectedRetry);
        expect(decision.strategy).toBe(expectedStrategy);
        if (expectedWaitMs !== undefined) {
          expect(decision.waitMs).toBe(expectedWaitMs);
        }
      });
    });

    it('wait_for_element applies backoff waitMs', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'btn' };
      const result: ActionResult = mockResult('failed', { error: 'element not found' });
      
      state.actionRetries.set('action-1', 2); // retryCount = 2
      const decision = decideRecovery(action, result, state);
      
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('wait_for_element');
      expect(decision.waitMs).toBe(3000); // 1000 * (2 + 1)
    });
  });

  describe('Action result status matching', () => {
    it('handles blocked status', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'btn' };
      const result: ActionResult = mockResult('blocked');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.strategy).toBe('blocked');
    });

    it('handles unsupported status', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'btn' };
      const result: ActionResult = mockResult('unsupported');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.strategy).toBe('unsupported');
    });

    it('handles needs_confirmation status', () => {
      const action: DesktopAction = { id: 'action-1', action: 'click', button: 'left', target: 'btn' };
      const result: ActionResult = mockResult('needs_confirmation');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(false);
      expect(decision.strategy).toBe('needs_confirmation');
    });
  });

  describe('Action-type specific recovery fallbacks', () => {
    it('handles open_app', () => {
      const action: DesktopAction = { id: 'a1', action: 'open_app', appName: 'test' };
      const result: ActionResult = mockResult('failed');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('retry_open');
    });

    it('handles click', () => {
      const action: DesktopAction = { id: 'a1', action: 'click', button: 'left', target: 'btn' };
      const result: ActionResult = mockResult('failed');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('retry_click');
    });

    it('handles type_text', () => {
      const action: DesktopAction = { id: 'a1', action: 'type_text', text: 'hi', target: 'input' };
      const result: ActionResult = mockResult('failed');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('retry_type');
    });

    it('handles navigate', () => {
      const action: DesktopAction = { id: 'a1', action: 'navigate', url: 'https://test.com' };
      const result: ActionResult = mockResult('failed');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('retry_navigation');
    });
  });

  describe('Generic fallback', () => {
    it('handles failed status without specific pattern', () => {
      const action: DesktopAction = { id: 'a1', action: 'read_screen' };
      const result: ActionResult = mockResult('failed');
      const decision = decideRecovery(action, result, state);
      expect(decision.shouldRetry).toBe(true);
      expect(decision.strategy).toBe('generic_retry');
    });

    it('handles success/completed status', () => {
      const action: DesktopAction = { id: 'a1', action: 'read_screen' };
      
      const successDecision = decideRecovery(action, mockResult('success'), state);
      expect(successDecision.shouldRetry).toBe(false);
      expect(successDecision.strategy).toBe('none');

      const completedDecision = decideRecovery(action, mockResult('completed'), state);
      expect(completedDecision.shouldRetry).toBe(false);
      expect(completedDecision.strategy).toBe('none');
    });
  });
});
