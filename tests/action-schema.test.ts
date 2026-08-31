import { describe, expect, test } from 'vitest';
import { desktopActionSchema } from '../src/shared/action-schema';

describe('desktop action schema', () => {
  test('accepts valid open_url actions', () => {
    const action = desktopActionSchema.parse({
      id: 'a1',
      action: 'open_url',
      url: 'https://example.com'
    });

    expect(action.action).toBe('open_url');
  });

  test('rejects click actions without target or coordinates', () => {
    expect(() => desktopActionSchema.parse({
      id: 'a2',
      action: 'click',
      button: 'left'
    })).toThrow();
  });
});

