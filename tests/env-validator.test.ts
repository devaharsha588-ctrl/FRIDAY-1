import { describe, it, expect } from 'vitest';
import { validateEnvironment } from '../src/backend/config/env-validator';

describe('Environment Validator (Phase 4)', () => {
  it('loads 5 dedicated OpenRouter key slots', () => {
    const env = validateEnvironment({
      OPENROUTER_KEY_1: 'key-for-coding',
      OPENROUTER_KEY_2: 'key-for-fast',
      OPENROUTER_KEY_3: 'key-for-complex',
      OPENROUTER_KEY_4: 'key-for-grammar',
      OPENROUTER_KEY_5: 'key-for-general'
    });

    expect(env.keys.key_1).toBe('key-for-coding');
    expect(env.keys.key_2).toBe('key-for-fast');
    expect(env.keys.key_3).toBe('key-for-complex');
    expect(env.keys.key_4).toBe('key-for-grammar');
    expect(env.keys.key_5).toBe('key-for-general');
    expect(env.configuredKeySlots).toHaveLength(5);
  });

  it('supports single-key fallback for legacy setups', () => {
    const env = validateEnvironment({
      OPENROUTER_API_KEY: 'single-legacy-key'
    });

    expect(env.keys.key_1).toBe('single-legacy-key');
    expect(env.configuredKeySlots).toEqual(['key_1']);
  });

  it('enforces FRIDAY_ALLOW_PAID_MODELS=false as default guardrail', () => {
    const env = validateEnvironment({});
    expect(env.allowPaidModels).toBe(false);
  });

  it('parses explicit FRIDAY_ALLOW_PAID_MODELS correctly', () => {
    const envFalse = validateEnvironment({ FRIDAY_ALLOW_PAID_MODELS: 'false' });
    expect(envFalse.allowPaidModels).toBe(false);

    const envTrue = validateEnvironment({ FRIDAY_ALLOW_PAID_MODELS: 'true' });
    expect(envTrue.allowPaidModels).toBe(true);
  });

  it('enforces configured_only policy default', () => {
    const env = validateEnvironment({});
    expect(env.modelPolicy).toBe('configured_only');
  });

  it('parses rate limits, cooldowns, and message limits with robust fallbacks', () => {
    const env = validateEnvironment({
      FRIDAY_FREE_MODEL_RATE_LIMIT_RPM: '25',
      FRIDAY_FREE_MODEL_RATE_LIMIT_RPD: '250',
      FRIDAY_MODEL_FAILURE_COOLDOWN_MS: '45000',
      FRIDAY_MAX_MESSAGE_LENGTH: '15000'
    });

    expect(env.freeModelRateLimitRpm).toBe(25);
    expect(env.freeModelRateLimitRpd).toBe(250);
    expect(env.modelFailureCooldownMs).toBe(45000);
    expect(env.maxMessageLength).toBe(15000);
  });
});
