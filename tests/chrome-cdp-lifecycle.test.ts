import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureChromeCdpReady,
  findChromeExecutable,
  launchManagedChrome,
  isCdpAvailable,
  BrowserAdapter
} from '../src/local-agent/adapters/browser-adapter';
import { executeDesktopAction } from '../src/local-agent/executor';
import { readAgentEnv } from '../src/local-agent/config';
import type { DesktopAction } from '../src/shared/action-schema';

describe('Chrome CDP Lifecycle & Automatic Managed Instance', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('1. Reuses existing CDP session when already available without launching a new process', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureChromeCdpReady({
      debugPort: 9222,
      connectTimeoutMs: 1000,
      cdpTimeoutMs: 5000,
      autoLaunch: true
    });

    expect(result.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9222/json/version',
      expect.anything()
    );
  });

  it('2. Automatically launches managed Chrome when CDP is unavailable and polls until ready', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      callCount++;
      // First 2 calls fail (initial check + 1st poll), then succeed
      if (callCount <= 2) {
        return Promise.reject(new Error('fetch failed'));
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureChromeCdpReady({
      debugPort: 9222,
      connectTimeoutMs: 1000,
      cdpTimeoutMs: 5000,
      chromePath: process.execPath, // mock exe
      profileDir: 'C:/temp/friday-test-profile',
      autoLaunch: true
    });

    expect(result.ready).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('3. Returns a clear actionable error if CDP endpoint does not become ready within timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureChromeCdpReady({
      debugPort: 9222,
      connectTimeoutMs: 100,
      cdpTimeoutMs: 800,
      chromePath: process.execPath,
      profileDir: 'C:/temp/friday-test-profile',
      autoLaunch: true
    });

    expect(result.ready).toBe(false);
    expect(result.error).toContain('did not become ready within 800ms');
  });

  it('4. Returns clean error if Chrome executable cannot be found', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureChromeCdpReady({
      debugPort: 9222,
      connectTimeoutMs: 100,
      cdpTimeoutMs: 1000,
      chromePath: 'C:/non-existent-path/chrome-missing.exe',
      autoLaunch: true
    });

    expect(result.ready).toBe(false);
    expect(result.error).toContain('Google Chrome executable not found');
  });

  it('5. Uses dedicated isolated profile directory outside git repository', () => {
    const env = readAgentEnv({
      FRIDAY_CHROME_PROFILE_DIR: 'C:/custom/profile'
    });
    expect(env.chromeProfileDir).toBe('C:/custom/profile');

    const defaultEnv = readAgentEnv({});
    expect(defaultEnv.chromeProfileDir).toContain('chrome-profile');
  });

  it('6. Phase 3A Fast Path (open_url) does NOT invoke CDP preparation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const env = readAgentEnv({});
    const fastAction: DesktopAction = {
      id: 'fast-1',
      action: 'open_url',
      url: 'https://youtube.com',
      risk: 'low'
    };

    // Execute fast path action
    const result = await executeDesktopAction(fastAction, env);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('Opened https://youtube.com');

    // CDP endpoint should NEVER have been queried during fast path!
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/json/version'),
      expect.anything()
    );
  });
});
