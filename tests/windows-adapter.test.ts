import { describe, expect, test } from 'vitest';
import { ALLOWED_KEYS, mouseClick, sendKeypress, switchWindow } from '../src/local-agent/adapters/windows-adapter';

describe('windows adapter unit tests', () => {
  test('allowed keys allowlist contains standard keys and combos', () => {
    expect(ALLOWED_KEYS.has('enter')).toBe(true);
    expect(ALLOWED_KEYS.has('tab')).toBe(true);
    expect(ALLOWED_KEYS.has('ctrl')).toBe(true);
    expect(ALLOWED_KEYS.has('alt')).toBe(true);
    expect(ALLOWED_KEYS.has('shift')).toBe(true);
    expect(ALLOWED_KEYS.has('win')).toBe(true);
    expect(ALLOWED_KEYS.has('esc')).toBe(true);
    expect(ALLOWED_KEYS.has('format_disk')).toBe(false);
    expect(ALLOWED_KEYS.has('drop_table')).toBe(false);
  });

  test('sendKeypress rejects invalid or dangerous keys', async () => {
    await expect(sendKeypress(['dangerous_script'])).rejects.toThrow('Invalid key');
    await expect(sendKeypress([])).rejects.toThrow('At least one key is required');
  });

  test('mouseClick rejects invalid coordinates', async () => {
    await expect(mouseClick(-5, 100)).rejects.toThrow('Invalid X coordinate');
    await expect(mouseClick(100, -10)).rejects.toThrow('Invalid Y coordinate');
    await expect(mouseClick(15000, 100)).rejects.toThrow('Invalid X coordinate');
    await expect(mouseClick(100, 100, 'invalid' as any)).rejects.toThrow('Invalid mouse button');
  });

  test('switchWindow rejects empty target', async () => {
    const result = await switchWindow({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target appName or title is required');
  });
});
