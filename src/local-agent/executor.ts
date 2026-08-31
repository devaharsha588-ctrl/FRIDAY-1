import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import {
  createActionResult,
  type ActionResult,
  type DesktopAction
} from '../shared/action-schema';
import type { AgentEnv } from './config';

export async function executeDesktopAction(action: DesktopAction, env: AgentEnv): Promise<ActionResult> {
  const startedAt = new Date();

  try {
    switch (action.action) {
      case 'open_url':
        await openExternal(action.url);
        return createActionResult(action, 'success', `Opened ${action.url}`, startedAt);

      case 'new_tab':
        if (!action.url) {
          return createActionResult(action, 'blocked', 'new_tab requires a URL until browser automation is connected.', startedAt);
        }
        await openExternal(action.url);
        return createActionResult(action, 'success', `Opened ${action.url} in the default browser.`, startedAt);

      case 'open_app':
        return openAllowedApp(action, env, startedAt);

      case 'close_app':
        return closeAllowedApp(action, env, startedAt);

      case 'wait':
        await wait(action.ms);
        return createActionResult(action, 'success', `Waited ${action.ms}ms.`, startedAt);

      case 'file_operation':
        return executeFileOperation(action, env, startedAt);

      case 'click':
      case 'type_text':
      case 'keypress':
      case 'read_screen':
      case 'find_element':
      case 'switch_window':
        return createActionResult(
          action,
          'unsupported',
          `${action.action} is defined but blocked until a real UI automation adapter is configured.`,
          startedAt
        );

      default:
        return createActionResult(action, 'unsupported', 'Unknown action.', startedAt);
    }
  } catch (error) {
    return createActionResult(
      action,
      'failed',
      error instanceof Error ? error.message : 'Action failed',
      startedAt,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

export function resolveAgentPath(root: string, requestedPath: string): string {
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, requestedPath);
  const normalizedRoot = rootPath.toLowerCase();
  const normalizedTarget = targetPath.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('Path is outside FRIDAY_FILES_ROOT');
  }

  return targetPath;
}

async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }

  if (platform() === 'win32') {
    detachedSpawn('cmd.exe', ['/c', 'start', '', url]);
    return;
  }

  if (platform() === 'darwin') {
    detachedSpawn('open', [url]);
    return;
  }

  detachedSpawn('xdg-open', [url]);
}

async function openAllowedApp(
  action: Extract<DesktopAction, { action: 'open_app' }>,
  env: AgentEnv,
  startedAt: Date
): Promise<ActionResult> {
  const app = env.allowedApps[action.appName.toLowerCase()];
  if (!app) {
    return createActionResult(action, 'blocked', `${action.appName} is not in FRIDAY_ALLOWED_APPS.`, startedAt);
  }

  detachedSpawn(app.command, app.args || []);
  return createActionResult(action, 'success', `Opened ${action.appName}.`, startedAt);
}

async function closeAllowedApp(
  action: Extract<DesktopAction, { action: 'close_app' }>,
  env: AgentEnv,
  startedAt: Date
): Promise<ActionResult> {
  if (!action.confirmed) {
    return createActionResult(action, 'needs_confirmation', `Closing ${action.appName} requires confirmation.`, startedAt);
  }

  const app = env.allowedApps[action.appName.toLowerCase()];
  if (!app?.processName) {
    return createActionResult(action, 'blocked', `${action.appName} has no allowlisted processName.`, startedAt);
  }

  if (platform() !== 'win32') {
    return createActionResult(action, 'unsupported', 'close_app is currently implemented for Windows process names only.', startedAt);
  }

  await runAndWait('taskkill.exe', ['/IM', app.processName, '/T']);
  return createActionResult(action, 'success', `Requested close for ${action.appName}.`, startedAt);
}

async function executeFileOperation(
  action: Extract<DesktopAction, { action: 'file_operation' }>,
  env: AgentEnv,
  startedAt: Date
): Promise<ActionResult> {
  const targetPath = resolveAgentPath(env.filesRoot, action.path);

  if (action.operation === 'list') {
    const entries = await readdir(targetPath, { withFileTypes: true });
    return createActionResult(action, 'success', `Listed ${action.path}.`, startedAt, {
      data: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }))
    });
  }

  if (action.operation === 'read') {
    const body = await readFile(targetPath, 'utf8');
    return createActionResult(action, 'success', `Read ${action.path}.`, startedAt, {
      data: body.slice(0, 200000)
    });
  }

  if (action.operation === 'write') {
    if (action.content === undefined) {
      return createActionResult(action, 'blocked', 'write requires content.', startedAt);
    }

    try {
      await stat(targetPath);
      if (!action.overwrite) {
        return createActionResult(action, 'blocked', 'File exists. Set overwrite after user confirmation.', startedAt);
      }
    } catch {
      await mkdir(dirname(targetPath), { recursive: true });
    }

    await writeFile(targetPath, action.content, 'utf8');
    return createActionResult(action, 'success', `Wrote ${action.path}.`, startedAt);
  }

  if (action.operation === 'mkdir') {
    await mkdir(targetPath, { recursive: true });
    return createActionResult(action, 'success', `Created ${action.path}.`, startedAt);
  }

  if (action.operation === 'delete') {
    if (!action.confirmed) {
      return createActionResult(action, 'needs_confirmation', `Deleting ${action.path} requires confirmation.`, startedAt);
    }

    const info = await stat(targetPath);
    if (info.isDirectory()) {
      return createActionResult(action, 'blocked', 'Directory deletion is not enabled.', startedAt);
    }

    await rm(targetPath);
    return createActionResult(action, 'success', `Deleted ${action.path}.`, startedAt);
  }

  return createActionResult(action, 'unsupported', 'Unsupported file operation.', startedAt);
}

function detachedSpawn(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: true
  });
  child.unref();
}

function runAndWait(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with ${code}`));
        return;
      }
      resolvePromise();
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

