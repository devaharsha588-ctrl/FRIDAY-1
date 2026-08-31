import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import { executeAgentAction, type AgentClientConfig } from '../agent/agent-client';

export type DirectExecutionOptions = {
  agent: AgentClientConfig;
  successMessage?: string;
  /** Optional override for testing */
  runAction?: (action: DesktopAction) => Promise<ActionResult>;
};

export type DirectExecutionResult = {
  result: ActionResult;
  message: string;
};

export async function executeDirectAction(
  action: DesktopAction,
  options: DirectExecutionOptions
): Promise<DirectExecutionResult> {
  const executor = options.runAction ?? ((a) => executeAgentAction(a, options.agent));

  let result: ActionResult;
  try {
    result = await executor(action);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown agent error';
    result = {
      id: action.id,
      action: action.action,
      status: 'failed',
      summary: 'Action execution failed: ' + errMsg,
      error: errMsg,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }


  let message = '';
  if (result.status === 'success' || result.status === 'completed') {
    message = options.successMessage ?? result.summary;
  } else if (result.status === 'blocked') {
    message = 'I could not complete that: ' + result.summary;
  } else {
    message = 'I could not complete that because: ' + result.summary;
  }


  return { result, message };
}
