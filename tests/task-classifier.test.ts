import { describe, expect, test } from 'vitest';
import { classifyPromptCapability } from '../src/backend/models/model-router';

describe('classifyPromptCapability', () => {
  test('routes code requests to coding', () => {
    expect(classifyPromptCapability('Fix this TypeScript build error')).toBe('coding');
    expect(classifyPromptCapability('Write a python script to parse logs')).toBe('coding');
  });

  test('routes grammar requests to grammar', () => {
    expect(classifyPromptCapability('Correct this sentence')).toBe('grammar');
    expect(classifyPromptCapability('Improve writing for this paragraph')).toBe('grammar');
  });

  test('routes deep reasoning requests to complex', () => {
    expect(classifyPromptCapability('Explain this deeply with system design')).toBe('complex');
  });

  test('routes quick queries to fast', () => {
    expect(classifyPromptCapability('Quick answer: what is 2+2?')).toBe('fast');
  });

  test('routes general requests to general', () => {
    expect(classifyPromptCapability('Tell me a story about robots')).toBe('general');
  });
});
