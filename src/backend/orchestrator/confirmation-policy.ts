import type { ActionRisk, DesktopAction } from '../../shared/action-schema';
import { evaluateActionRisk } from '../../shared/action-schema';

export type ConfirmationDecision = {
  requiresConfirmation: boolean;
  risk: ActionRisk;
  reason: string;
};

/**
 * Central policy for whether a given action must be confirmed by the user
 * before the execution loop proceeds. This wraps evaluateActionRisk but is
 * the single authoritative point for the task-executor to consult.
 */
export function requiresUserConfirmation(action: DesktopAction): ConfirmationDecision {
  const evaluation = evaluateActionRisk(action);
  return {
    requiresConfirmation: evaluation.requiresConfirmation,
    risk: evaluation.risk,
    reason: evaluation.reason ?? describeAction(action)
  };
}

function describeAction(action: DesktopAction): string {
  switch (action.action) {
    case 'close_app':
      return 'Close application "' + action.appName + '".';
    case 'file_operation':
      return 'File ' + action.operation + ' on path "' + action.path + '".';
    case 'click':
      return action.target
        ? 'Click "' + action.target + '".'
        : 'Click at (' + String(action.x ?? 0) + ', ' + String(action.y ?? 0) + ').';
    case 'type_text':
      return 'Type text (' + String(action.text.length) + ' chars).';
    case 'keypress':
      return 'Press keys: ' + action.keys.join('+') + '.';
    default:
      return 'Execute ' + action.action + '.';
  }
}
