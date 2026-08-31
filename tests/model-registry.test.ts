import { describe, expect, test } from 'vitest';
import { createModelRegistry, toPublicProvider } from '../src/backend/ai/model-registry';

describe('model registry', () => {
  test('supports separate keys and models by task category', () => {
    const registry = createModelRegistry({
      OPENROUTER_GENERAL_API_KEY: 'general-key',
      OPENROUTER_GENERAL_MODEL: 'general-model',
      OPENROUTER_CODING_API_KEY: 'coding-key',
      OPENROUTER_CODING_MODEL: 'coding-model'
    } as NodeJS.ProcessEnv);

    expect(registry.general.apiKey).toBe('general-key');
    expect(registry.general.model).toBe('general-model');
    expect(registry.coding.apiKey).toBe('coding-key');
    expect(registry.coding.model).toBe('coding-model');
    expect(registry.planning.configured).toBe(false);
  });

  test('public provider redacts api keys', () => {
    const registry = createModelRegistry({
      OPENROUTER_DEFAULT_API_KEY: 'secret',
      OPENROUTER_DEFAULT_MODEL: 'model'
    } as NodeJS.ProcessEnv);

    expect(toPublicProvider(registry.general)).not.toHaveProperty('apiKey');
  });
});

