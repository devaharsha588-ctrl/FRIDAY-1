import { actionResultSchema, type ActionResult, type DesktopAction } from '../../shared/action-schema';

export type AgentClientConfig = {
  agentUrl: string;
  agentToken: string;
};

export async function executeAgentAction(action: DesktopAction, config: AgentClientConfig): Promise<ActionResult> {
  const response = await fetch(`${config.agentUrl.replace(/\/$/, '')}/actions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action })
  });

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    return {
      id: action.id,
      action: action.action,
      status: response.status === 401 ? 'blocked' : 'failed',
      summary: payload?.error || `Local agent returned ${response.status}`,
      error: payload?.error,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }

  return actionResultSchema.parse(payload.result);
}

