import { describe, it, expect } from 'vitest';
import {
  FRIDAY_KEY_ROLES,
  type FridayRole
} from '../src/backend/models/friday-key-roles';
import {
  FRIDAY_MODEL_METADATA,
  getModelMetadata,
  isModelFree,
  getRoleModels
} from '../src/backend/models/model-registry';

describe('Model Registry & Predefined Roles (Phase 4)', () => {
  it('defines all 5 required roles with exact key slots', () => {
    expect(FRIDAY_KEY_ROLES.coding.keySlot).toBe('key_1');
    expect(FRIDAY_KEY_ROLES.coding.primary).toBe('poolside/laguna-s-2.1:free');

    expect(FRIDAY_KEY_ROLES.fast.keySlot).toBe('key_2');
    expect(FRIDAY_KEY_ROLES.fast.primary).toBe('nvidia/nemotron-3.5-lightning:free');

    expect(FRIDAY_KEY_ROLES.complex.keySlot).toBe('key_3');
    expect(FRIDAY_KEY_ROLES.complex.primary).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');

    expect(FRIDAY_KEY_ROLES.grammar.keySlot).toBe('key_4');
    expect(FRIDAY_KEY_ROLES.grammar.primary).toBe('minimax/minimax-m3:free');

    expect(FRIDAY_KEY_ROLES.general.keySlot).toBe('key_5');
    expect(FRIDAY_KEY_ROLES.general.primary).toBe('minimax/minimax-m2.7:free');
  });

  it('guarantees 100% of predefined primary and fallback models are free ($0 pricing)', () => {
    const roles = Object.keys(FRIDAY_KEY_ROLES) as FridayRole[];

    for (const role of roles) {
      const config = FRIDAY_KEY_ROLES[role];
      expect(config.free).toBe(true);
      expect(isModelFree(config.primary)).toBe(true);

      const primaryMeta = getModelMetadata(config.primary);
      expect(primaryMeta).toBeDefined();
      expect(primaryMeta?.pricing.input).toBe(0);
      expect(primaryMeta?.pricing.output).toBe(0);

      if (config.fallback1) {
        expect(isModelFree(config.fallback1)).toBe(true);
        const fb1Meta = getModelMetadata(config.fallback1);
        expect(fb1Meta?.pricing.input).toBe(0);
        expect(fb1Meta?.pricing.output).toBe(0);
      }

      if (config.fallback2) {
        expect(isModelFree(config.fallback2)).toBe(true);
        const fb2Meta = getModelMetadata(config.fallback2);
        expect(fb2Meta?.pricing.input).toBe(0);
        expect(fb2Meta?.pricing.output).toBe(0);
      }
    }
  });

  it('returns valid candidate fallback lists for all roles', () => {
    const codingModels = getRoleModels('coding');
    expect(codingModels.primary).toBe('poolside/laguna-s-2.1:free');
    expect(codingModels.fallbacks).toContain('cohere/north-mini-code:free');
    expect(codingModels.fallbacks).toContain('poolside/laguna-xs-2.1:free');

    const fastModels = getRoleModels('fast');
    expect(fastModels.primary).toBe('nvidia/nemotron-3.5-lightning:free');
    expect(fastModels.fallbacks).toContain('liquid/lfm-2.5-2.6b:free');
  });
});
