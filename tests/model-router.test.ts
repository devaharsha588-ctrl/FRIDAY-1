import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouter, classifyPromptCapability } from '../src/backend/models/model-router';
import { KeyManager } from '../src/backend/models/key-manager';
import { OpenRouterClient } from '../src/backend/models/openrouter-client';
import { validateEnvironment } from '../src/backend/config/env-validator';

describe('ModelRouter (Phase 4)', () => {
  let env = validateEnvironment({
    OPENROUTER_KEY_1: 'key-1-coding',
    OPENROUTER_KEY_2: 'key-2-fast',
    OPENROUTER_KEY_3: 'key-3-complex',
    OPENROUTER_KEY_4: 'key-4-grammar',
    OPENROUTER_KEY_5: 'key-5-general',
    FRIDAY_ALLOW_PAID_MODELS: 'false'
  });

  describe('classifyPromptCapability (Deterministic Classification)', () => {
    it('classifies coding requests to "coding"', () => {
      expect(classifyPromptCapability('Fix this Python code')).toBe('coding');
      expect(classifyPromptCapability('Write a TypeScript function to sort arrays')).toBe('coding');
      expect(classifyPromptCapability('Debug this react component bug')).toBe('coding');
    });

    it('classifies grammar requests to "grammar"', () => {
      expect(classifyPromptCapability('Correct this sentence')).toBe('grammar');
      expect(classifyPromptCapability('Fix spelling and proofread this paragraph')).toBe('grammar');
      expect(classifyPromptCapability('Improve writing and tone check this email')).toBe('grammar');
    });

    it('classifies deep reasoning to "complex"', () => {
      expect(classifyPromptCapability('Explain this deeply and provide system design')).toBe('complex');
      expect(classifyPromptCapability('Deep analysis on microservices architecture')).toBe('complex');
      expect(classifyPromptCapability('Solve this logic puzzle with step by step proof')).toBe('complex');
    });

    it('classifies quick queries to "fast"', () => {
      expect(classifyPromptCapability('Quick answer: is water wet?')).toBe('fast');
      expect(classifyPromptCapability('What is 2+2?')).toBe('fast');
    });

    it('classifies general queries to "general"', () => {
      expect(classifyPromptCapability('Hello FRIDAY, how are you today?')).toBe('general');
      expect(classifyPromptCapability('Summarize the history of robotics')).toBe('general');
    });
  });

  describe('execute and fallback routing', () => {
    it('successfully routes coding role to primary free model on key_1', async () => {
      const mockClient = new OpenRouterClient();
      vi.spyOn(mockClient, 'createCompletion').mockResolvedValue({
        requestId: 'req-1',
        model: 'poolside/laguna-s-2.1:free',
        content: 'def solve(): pass',
        latencyMs: 120
      });

      const router = new ModelRouter(env, undefined, mockClient);
      const result = await router.execute({
        role: 'coding',
        messages: [{ role: 'user', content: 'Write python function' }]
      });

      expect(result.content).toBe('def solve(): pass');
      expect(result.role).toBe('coding');
      expect(result.model).toBe('poolside/laguna-s-2.1:free');
      expect(result.keySlot).toBe('key_1');
      expect(result.fallbackUsed).toBe(false);
    });

    it('progresses to same-role fallback on primary model failure', async () => {
      const mockClient = new OpenRouterClient();
      vi.spyOn(mockClient, 'createCompletion')
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce({
          requestId: 'req-2',
          model: 'cohere/north-mini-code:free',
          content: 'Fallback coding result',
          latencyMs: 150
        });

      const router = new ModelRouter(env, undefined, mockClient);
      const result = await router.execute({
        role: 'coding',
        messages: [{ role: 'user', content: 'Write code' }]
      });

      expect(result.fallbackUsed).toBe(true);
      expect(result.model).toBe('cohere/north-mini-code:free');
      expect(result.keySlot).toBe('key_1');
      expect(result.content).toBe('Fallback coding result');
    });

    it('enforces paid model lockout guardrail (never switches to paid models)', async () => {
      const strictEnv = validateEnvironment({
        OPENROUTER_KEY_1: 'key-1',
        FRIDAY_ALLOW_PAID_MODELS: 'false'
      });

      const mockClient = new OpenRouterClient();
      vi.spyOn(mockClient, 'createCompletion').mockRejectedValue(new Error('Service Unavailable'));

      const router = new ModelRouter(strictEnv, undefined, mockClient);

      await expect(router.execute({
        role: 'coding',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow(/FRIDAY will not automatically switch to paid models/);
    });
  });
});
