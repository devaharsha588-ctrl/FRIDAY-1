import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManager } from '../src/backend/models/key-manager';
import { validateEnvironment } from '../src/backend/config/env-validator';

describe('KeyManager (Phase 4)', () => {
  let env5Keys = validateEnvironment({
    OPENROUTER_KEY_1: 'coding-secret',
    OPENROUTER_KEY_2: 'fast-secret',
    OPENROUTER_KEY_3: 'complex-secret',
    OPENROUTER_KEY_4: 'grammar-secret',
    OPENROUTER_KEY_5: 'general-secret',
    FRIDAY_FREE_MODEL_RATE_LIMIT_RPM: '5',
    FRIDAY_FREE_MODEL_RATE_LIMIT_RPD: '10',
    FRIDAY_MODEL_FAILURE_COOLDOWN_MS: '1000'
  });

  it('binds 5 dedicated keys to their exact roles', () => {
    const km = new KeyManager(env5Keys);

    expect(km.getKeySlotForRole('coding')).toBe('key_1');
    expect(km.getKeyForRole('coding')).toBe('coding-secret');

    expect(km.getKeySlotForRole('fast')).toBe('key_2');
    expect(km.getKeyForRole('fast')).toBe('fast-secret');

    expect(km.getKeySlotForRole('complex')).toBe('key_3');
    expect(km.getKeyForRole('complex')).toBe('complex-secret');

    expect(km.getKeySlotForRole('grammar')).toBe('key_4');
    expect(km.getKeyForRole('grammar')).toBe('grammar-secret');

    expect(km.getKeySlotForRole('general')).toBe('key_5');
    expect(km.getKeyForRole('general')).toBe('general-secret');
  });

  it('supports single-key sharing when fewer keys are supplied', () => {
    const singleEnv = validateEnvironment({
      OPENROUTER_KEY_1: 'universal-key'
    });
    const km = new KeyManager(singleEnv);

    expect(km.getKeyForRole('coding')).toBe('universal-key');
    expect(km.getKeyForRole('fast')).toBe('universal-key');
    expect(km.getKeyForRole('complex')).toBe('universal-key');
    expect(km.getKeyForRole('grammar')).toBe('universal-key');
    expect(km.getKeyForRole('general')).toBe('universal-key');
  });

  it('marks role unavailable when no keys are configured', () => {
    const emptyEnv = validateEnvironment({});
    const km = new KeyManager(emptyEnv);

    const health = km.getRoleHealth('coding');
    expect(health.state).toBe('unavailable');
    expect(health.hasKey).toBe(false);
    expect(km.isAvailable('coding')).toBe(false);
  });

  it('transitions to degraded on 429 rate limit and recovers after cooldown', async () => {
    const km = new KeyManager(env5Keys);

    expect(km.getRoleHealth('coding').state).toBe('healthy');

    km.recordRateLimit('key_1', 200, 'Rate limited');
    expect(km.getRoleHealth('coding').state).toBe('degraded');

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 250));
    expect(km.getRoleHealth('coding').state).toBe('healthy');
  });

  it('transitions to invalid on 401/403 authentication failure', () => {
    const km = new KeyManager(env5Keys);

    km.recordAuthFailure('key_2', 'Invalid API key');
    const health = km.getRoleHealth('fast');
    expect(health.state).toBe('invalid');
    expect(km.isAvailable('fast')).toBe(false);
  });

  it('tracks RPM and RPD rate limits accurately', () => {
    const km = new KeyManager(env5Keys);

    const initialQuota = km.getRemainingQuota('key_1', 'poolside/laguna-s-2.1:free');
    expect(initialQuota.rpm).toBe(5);
    expect(initialQuota.rpd).toBe(10);

    km.recordUsage('key_1', 'poolside/laguna-s-2.1:free');
    km.recordUsage('key_1', 'poolside/laguna-s-2.1:free');

    const updatedQuota = km.getRemainingQuota('key_1', 'poolside/laguna-s-2.1:free');
    expect(updatedQuota.rpm).toBe(3);
    expect(updatedQuota.rpd).toBe(8);
  });

  it('never exposes raw secret keys in getAllRoleStatuses', () => {
    const km = new KeyManager(env5Keys);
    const statuses = km.getAllRoleStatuses();

    for (const [role, status] of Object.entries(statuses)) {
      expect(status).not.toHaveProperty('apiKey');
      expect(status).not.toHaveProperty('secret');
      expect(JSON.stringify(status)).not.toContain('coding-secret');
      expect(JSON.stringify(status)).not.toContain('fast-secret');
      expect(status.free).toBe(true);
      expect(status.keySlot).toBeDefined();
    }
  });
});
