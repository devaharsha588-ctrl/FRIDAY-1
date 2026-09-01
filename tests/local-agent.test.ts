import { describe, expect, test, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { executeDesktopAction, resolveAgentPath } from '../src/local-agent/executor';
import type { AgentEnv } from '../src/local-agent/config';

const testFilesRoot = resolve(process.cwd(), '.friday', 'test-files');
const dummyEnv: AgentEnv = {
  port: 7331,
  token: 'test-token',
  filesRoot: testFilesRoot,
  allowedApps: {
    notepad: {
      command: 'notepad.exe',
      processName: 'notepad.exe'
    }
  },
  chromeDebugPort: 9222,
  chromeCdpTimeoutMs: 10000,
  chromeProfileDir: resolve(testFilesRoot, 'chrome-profile')
};

describe('local agent executor', () => {
  afterEach(async () => {
    try {
      await rm(testFilesRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('allows paths inside the configured root', () => {
    const resolved = resolveAgentPath('C:/workspace/friday', 'notes/today.txt').replace(/\\/g, '/');
    expect(resolved.endsWith('/workspace/friday/notes/today.txt')).toBe(true);
  });

  test('blocks traversal outside the configured root', () => {
    expect(() => resolveAgentPath('C:/workspace/friday', '../secret.txt')).toThrow('outside');
  });

  test('executes wait action successfully', async () => {
    const result = await executeDesktopAction(
      { id: 'w1', action: 'wait', ms: 100 },
      dummyEnv
    );
    expect(result.status).toBe('success');
    expect(result.summary).toContain('Waited 100ms');
  });

  test('close_app without confirmation returns needs_confirmation', async () => {
    const result = await executeDesktopAction(
      { id: 'c1', action: 'close_app', appName: 'notepad', confirmed: false },
      dummyEnv
    );
    expect(result.status).toBe('needs_confirmation');
    expect(result.summary).toContain('requires confirmation');
  });

  test('file delete without confirmation returns needs_confirmation', async () => {
    await mkdir(testFilesRoot, { recursive: true });
    const filePath = resolve(testFilesRoot, 'delete-me.txt');
    await writeFile(filePath, 'hello', 'utf8');

    const result = await executeDesktopAction(
      { id: 'f1', action: 'file_operation', operation: 'delete', path: 'delete-me.txt', confirmed: false },
      dummyEnv
    );
    expect(result.status).toBe('needs_confirmation');
  });

  test('file delete with confirmation deletes the file', async () => {
    await mkdir(testFilesRoot, { recursive: true });
    const filePath = resolve(testFilesRoot, 'confirmed-del.txt');
    await writeFile(filePath, 'hello', 'utf8');

    const result = await executeDesktopAction(
      { id: 'f2', action: 'file_operation', operation: 'delete', path: 'confirmed-del.txt', confirmed: true },
      dummyEnv
    );
    expect(result.status).toBe('success');
  });

  test('file write and read execute successfully', async () => {
    const writeResult = await executeDesktopAction(
      { id: 'fw1', action: 'file_operation', operation: 'write', path: 'hello.txt', content: 'Friday Desktop AI' },
      dummyEnv
    );
    expect(writeResult.status).toBe('success');

    const readResult = await executeDesktopAction(
      { id: 'fr1', action: 'file_operation', operation: 'read', path: 'hello.txt' },
      dummyEnv
    );
    expect(readResult.status).toBe('success');
    expect(readResult.data).toBe('Friday Desktop AI');
  });
});
