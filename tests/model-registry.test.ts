import { describe, expect, test } from 'vitest';
import { FRIDAY_KEY_ROLES } from '../src/backend/models/friday-key-roles';
import { KeyManager } from '../src/backend/models/key-manager';
import { validateEnvironment } from '../src/backend/config/env-validator';
import { toPublicModelProvider } from '../src/backend/models/model-registry';

describe('model registry (Phase 4)', () => {
  test('supports separate keys by role slot and predefined free models', () => {
    const env = validateEnvironment({
      OPENROUTER_KEY_1: 'coding-key',
      OPENROUTER_KEY_2: 'fast-key',
      OPENROUTER_KEY_3: 'complex-key',
      OPENROUTER_KEY_4: 'grammar-key',
      OPENROUTER_KEY_5: 'general-key'
    });
    const km = new KeyManager(env);

    expect(km.getKeyForRole('coding')).toBe('coding-key');
    expect(km.getKeyForRole('fast')).toBe('fast-key');
    expect(km.getKeyForRole('complex')).toBe('complex-key');
    expect(km.getKeyForRole('grammar')).toBe('grammar-key');
    expect(km.getKeyForRole('general')).toBe('general-key');

    expect(FRIDAY_KEY_ROLES.coding.primary).toBe('poolside/laguna-s-2.1:free');
    expect(FRIDAY_KEY_ROLES.fast.primary).toBe('nvidia/nemotron-3.5-lightning:free');
  });

  test('public provider redacts api keys and exposes public metadata', () => {
    const env = validateEnvironment({
      OPENROUTER_KEY_1: 'secret-key-1'
    });
    const km = new KeyManager(env);
    const pub = toPublicModelProvider('coding', km);

    expect(pub).not.toHaveProperty('apiKey');
    expect(pub.model).toBe('poolside/laguna-s-2.1:free');
    expect(pub.configured).toBe(true);
  });
});
