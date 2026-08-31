import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import { executeAgentAction, type AgentClientConfig } from '../agent/agent-client';

export type ActionRunnerOptions = {
  agent: AgentClientConfig;
  /** Override for testing — if provided, will be called instead of the real agent */
  runAction?: (action: DesktopAction) => Promise<ActionResult>;
};

/**
 * Wraps the agent-client with standardised error handling for the task
 * execution loop. Throws only on unrecoverable network-level failures; all
 * other outcomes are returned as ActionResult (status: failed / blocked / etc.)
 */
export async function runAction(
  action: DesktopAction,
  options: ActionRunnerOptions
): Promise<ActionResult> {
  const execute = options.runAction ?? ((a) => executeAgentAction(a, options.agent));

  try {
    return await execute(action);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown runner error';
    return {
      id: action.id,
      action: action.action,
      status: 'failed',
      summary: 'Action runner failed: ' + message,
      error: message,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }
}
