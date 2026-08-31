import { validateEnvironment, type ValidatedBackendEnv } from './env-validator';

export type BackendEnv = ValidatedBackendEnv;

export function readBackendEnv(env: NodeJS.ProcessEnv = process.env): BackendEnv {
  return validateEnvironment(env);
}

export function isUsingDefaultAgentToken(env: BackendEnv): boolean {
  return env.agentToken === 'dev-local-token-change-me';
}
