import { describe, expect, test } from 'vitest';
import { resolveAgentPath } from '../src/local-agent/executor';

describe('local agent path resolver', () => {
  test('allows paths inside the configured root', () => {
    const resolved = resolveAgentPath('C:/workspace/friday', 'notes/today.txt').replace(/\\/g, '/');
    expect(resolved.endsWith('/workspace/friday/notes/today.txt')).toBe(true);
  });

  test('blocks traversal outside the configured root', () => {
    expect(() => resolveAgentPath('C:/workspace/friday', '../secret.txt')).toThrow('outside');
  });
});

