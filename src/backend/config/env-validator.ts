import { KeySlot } from '../models/friday-key-roles';

export type ValidatedBackendEnv = {
  nodeEnv: string;
  backendPort: number;
  agentUrl: string;
  agentToken: string;
  filesRoot: string;
  openRouterBaseUrl: string;
  keys: Partial<Record<KeySlot, string>>;
  configuredKeySlots: KeySlot[];
  modelPolicy: 'configured_only' | 'allow_any';
  allowPaidModels: boolean;
  modelDiscoveryEnabled: boolean;
  modelCacheTtlMs: number;
  modelFailureCooldownMs: number;
  maxModelRetries: number;
  freeModelRateLimitRpm: number;
  freeModelRateLimitRpd: number;
  maxMessageLength: number;
  maxTasksPerMinute: number;
  maxModelRequestsPerMinute: number;
  logLevel: string;
};

function parseNumber(value: string | undefined, fallback: number, min = 0, max = Infinity): number {
  if (!value) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return fallback;
  return num;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return fallback;
}

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): ValidatedBackendEnv {
  const keys: Partial<Record<KeySlot, string>> = {};
  const configuredKeySlots: KeySlot[] = [];

  const keyEnvVars: Array<{ slot: KeySlot; envName: string }> = [
    { slot: 'key_1', envName: 'OPENROUTER_KEY_1' },
    { slot: 'key_2', envName: 'OPENROUTER_KEY_2' },
    { slot: 'key_3', envName: 'OPENROUTER_KEY_3' },
    { slot: 'key_4', envName: 'OPENROUTER_KEY_4' },
    { slot: 'key_5', envName: 'OPENROUTER_KEY_5' }
  ];

  for (const { slot, envName } of keyEnvVars) {
    const rawVal = env[envName]?.trim().replace(/^["']|["']$/g, '');
    if (rawVal && rawVal.length > 0) {
      keys[slot] = rawVal;
      configuredKeySlots.push(slot);
    }
  }

  // Fallback for legacy single-key setups: if no OPENROUTER_KEY_1..5 is set, check OPENROUTER_API_KEY
  if (configuredKeySlots.length === 0) {
    const legacyKey = (env.OPENROUTER_DEFAULT_API_KEY || env.OPENROUTER_API_KEY)?.trim();
    if (legacyKey) {
      keys.key_1 = legacyKey;
      configuredKeySlots.push('key_1');
    }
  }

  const allowPaid = parseBoolean(env.FRIDAY_ALLOW_PAID_MODELS, false);
  const rawPolicy = env.FRIDAY_MODEL_POLICY?.toLowerCase().trim();
  const modelPolicy = rawPolicy === 'allow_any' ? 'allow_any' : 'configured_only';

  return {
    nodeEnv: env.NODE_ENV || 'development',
    backendPort: parseNumber(env.FRIDAY_BACKEND_PORT || env.PORT, 3001, 1, 65535),
    agentUrl: env.FRIDAY_AGENT_URL || 'http://127.0.0.1:8787',
    agentToken: env.FRIDAY_AGENT_TOKEN || 'dev-local-token-change-me',
    filesRoot: env.FRIDAY_FILES_ROOT || '.',
    openRouterBaseUrl: (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    keys,
    configuredKeySlots,
    modelPolicy,
    allowPaidModels: allowPaid,
    modelDiscoveryEnabled: parseBoolean(env.FRIDAY_MODEL_DISCOVERY_ENABLED, true),
    modelCacheTtlMs: parseNumber(env.FRIDAY_MODEL_CACHE_TTL_MS, 3600000, 1000),
    modelFailureCooldownMs: parseNumber(env.FRIDAY_MODEL_FAILURE_COOLDOWN_MS, 60000, 1000),
    maxModelRetries: parseNumber(env.FRIDAY_MAX_MODEL_RETRIES, 2, 0, 10),
    freeModelRateLimitRpm: parseNumber(env.FRIDAY_FREE_MODEL_RATE_LIMIT_RPM, 20, 1, 1000),
    freeModelRateLimitRpd: parseNumber(env.FRIDAY_FREE_MODEL_RATE_LIMIT_RPD, 200, 1, 10000),
    maxMessageLength: parseNumber(env.FRIDAY_MAX_MESSAGE_LENGTH, 20000, 100),
    maxTasksPerMinute: parseNumber(env.FRIDAY_MAX_TASKS_PER_MINUTE, 30, 1),
    maxModelRequestsPerMinute: parseNumber(env.FRIDAY_MAX_MODEL_REQUESTS_PER_MINUTE, 60, 1),
    logLevel: env.FRIDAY_LOG_LEVEL || 'info'
  };
}
