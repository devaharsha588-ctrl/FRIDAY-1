import { nanoid } from 'nanoid';
import type { DesktopAction, ActionResult } from '../../shared/action-schema';

export type RecoveryDecision = {
  shouldRetry: boolean;
  strategy: string;           // human-readable name of the strategy used
  preActions: DesktopAction[];  // actions to execute before retrying the failed action
  waitMs: number;             // milliseconds to wait before retry
  reason: string;             // human-readable explanation
};

export type RecoveryState = {
  actionRetries: Map<string, number>;    // actionId -> retry count
  totalRecoveries: number;               // total recovery attempts this task
};

export const MAX_RETRIES_PER_ACTION = 3;
export const MAX_TOTAL_RECOVERIES = 8;

export function createRecoveryState(): RecoveryState {
  return {
    actionRetries: new Map<string, number>(),
    totalRecoveries: 0
  };
}

export function recordRecoveryAttempt(state: RecoveryState, actionId: string): void {
  const currentRetries = state.actionRetries.get(actionId) ?? 0;
  state.actionRetries.set(actionId, currentRetries + 1);
  state.totalRecoveries += 1;
}

export function decideRecovery(
  action: DesktopAction,
  result: ActionResult,
  state: RecoveryState
): RecoveryDecision {
  const retryCount = state.actionRetries.get(action.id) ?? 0;

  // 1. First check global limits
  if (state.totalRecoveries >= MAX_TOTAL_RECOVERIES) {
    return {
      shouldRetry: false,
      strategy: 'limit_exceeded',
      preActions: [],
      waitMs: 0,
      reason: 'Maximum total recovery attempts reached'
    };
  }

  if (retryCount >= MAX_RETRIES_PER_ACTION) {
    return {
      shouldRetry: false,
      strategy: 'limit_exceeded',
      preActions: [],
      waitMs: 0,
      reason: 'Maximum retries for this action reached'
    };
  }

  // 2. Determine error type from result.error or result.summary
  const errorString = `${result.error ?? ''} ${result.summary ?? ''}`.toLowerCase();

  if (errorString.includes('window_not_found') || errorString.includes('window not found')) {
    return {
      shouldRetry: true,
      strategy: 'wait_for_window',
      preActions: [],
      waitMs: 2000,
      reason: 'Window not found, waiting for it to appear'
    };
  }

  if (errorString.includes('element_not_found') || errorString.includes('element not found')) {
    return {
      shouldRetry: true,
      strategy: 'wait_for_element',
      preActions: [],
      waitMs: 1000 * (retryCount + 1),
      reason: 'Element not found, waiting for it to appear'
    };
  }

  if (errorString.includes('ambiguous_target') || errorString.includes('ambiguous target')) {
    return {
      shouldRetry: false,
      strategy: 'ambiguous',
      preActions: [],
      waitMs: 0,
      reason: 'Multiple matching targets found, cannot determine which one to use'
    };
  }

  if (errorString.includes('platform_unsupported') || errorString.includes('platform unsupported')) {
    return {
      shouldRetry: false,
      strategy: 'unsupported',
      preActions: [],
      waitMs: 0,
      reason: 'Action not supported on this platform'
    };
  }

  if (
    errorString.includes('cdp_not_connected') ||
    errorString.includes('cdp not connected') ||
    errorString.includes('browser_not_available') ||
    errorString.includes('browser not available')
  ) {
    return {
      shouldRetry: false,
      strategy: 'browser_unavailable',
      preActions: [],
      waitMs: 0,
      reason: 'Chrome DevTools not available. Start Chrome with --remote-debugging-port=9222'
    };
  }

  if (errorString.includes('navigation_failed') || errorString.includes('navigation failed')) {
    return {
      shouldRetry: true,
      strategy: 'retry_navigation',
      preActions: [],
      waitMs: 1500,
      reason: 'Navigation failed, retrying'
    };
  }

  if (errorString.includes('timeout') || errorString.includes('timed out')) {
    return {
      shouldRetry: true,
      strategy: 'retry_after_timeout',
      preActions: [],
      waitMs: 3000,
      reason: 'Operation timed out, retrying with longer wait'
    };
  }

  // 3. For result.status-based recovery
  if (result.status === 'blocked') {
    return {
      shouldRetry: false,
      strategy: 'blocked',
      preActions: [],
      waitMs: 0,
      reason: 'Action was blocked: ' + result.summary
    };
  }

  if (result.status === 'unsupported') {
    return {
      shouldRetry: false,
      strategy: 'unsupported',
      preActions: [],
      waitMs: 0,
      reason: result.summary ?? 'Unsupported action'
    };
  }

  if (result.status === 'needs_confirmation') {
    return {
      shouldRetry: false,
      strategy: 'needs_confirmation',
      preActions: [],
      waitMs: 0,
      reason: 'Action requires user confirmation'
    };
  }

  // 4. For action-type specific recovery when the error string doesn't match known patterns
  if (action.action === 'open_app') {
    return {
      shouldRetry: true,
      strategy: 'retry_open',
      preActions: [],
      waitMs: 1000,
      reason: 'Application launch may need retry'
    };
  }

  if (action.action === 'click') {
    return {
      shouldRetry: true,
      strategy: 'retry_click',
      preActions: [],
      waitMs: 1000,
      reason: 'Click failed, element may not be ready'
    };
  }

  if (action.action === 'type_text') {
    return {
      shouldRetry: true,
      strategy: 'retry_type',
      preActions: [],
      waitMs: 500,
      reason: 'Typing failed, retrying'
    };
  }

  if (action.action === 'navigate') {
    return {
      shouldRetry: true,
      strategy: 'retry_navigation',
      preActions: [],
      waitMs: 1500,
      reason: 'Navigation failed, retrying'
    };
  }

  // 5. Default fallback
  if (result.status === 'failed') {
    return {
      shouldRetry: true,
      strategy: 'generic_retry',
      preActions: [],
      waitMs: 1000,
      reason: 'Action failed, attempting generic retry'
    };
  }

  return {
    shouldRetry: false,
    strategy: 'none',
    preActions: [],
    waitMs: 0,
    reason: 'No recovery strategy needed'
  };
}
