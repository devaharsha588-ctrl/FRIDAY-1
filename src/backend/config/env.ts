export type BackendEnv = {
  nodeEnv: string;
  backendPort: number;
  agentUrl: string;
  agentToken: string;
  openRouterBaseUrl: string;
};

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readBackendEnv(env: NodeJS.ProcessEnv = process.env): BackendEnv {
  return {
    nodeEnv: env.NODE_ENV || 'development',
    backendPort: numberFromEnv(env.FRIDAY_BACKEND_PORT, 3001),
    agentUrl: env.FRIDAY_AGENT_URL || 'http://127.0.0.1:8787',
    agentToken: env.FRIDAY_AGENT_TOKEN || 'dev-local-token-change-me',
    openRouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  };
}

export function isUsingDefaultAgentToken(env: BackendEnv): boolean {
  return env.agentToken === 'dev-local-token-change-me';
}
