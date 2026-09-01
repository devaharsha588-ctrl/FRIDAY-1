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
import {
  captureScreen,
  findWindows,
  mouseClick,
  sendKeypress,
  switchWindow,
  typeText
} from './adapters/windows-adapter';
import {
  BrowserAdapter,
  createBrowserAdapter,
  isCdpAvailable
} from './adapters/browser-adapter';
import {
  checkProcessExists,
  findUiElement,
  getWindowState,
  clickUiElement,
  waitForWindow
} from './adapters/ui-automation';

// Lazily initialized browser adapter
let browserAdapter: BrowserAdapter | null = null;

function getBrowserAdapter(env: AgentEnv): BrowserAdapter {
  if (!browserAdapter) {
    browserAdapter = createBrowserAdapter({
      debugPort: env.chromeDebugPort,
      cdpTimeoutMs: env.chromeCdpTimeoutMs,
      profileDir: env.chromeProfileDir,
      chromePath: env.chromeExecutablePath,
      autoLaunch: true
    });
  }
  return browserAdapter;
}

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

      case 'read_screen':
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        return executeReadScreen(action, env, startedAt);

      case 'switch_window':
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        return executeSwitchWindow(action, startedAt);

      case 'type_text': {
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        const adapter = getBrowserAdapter(env);
        try {
          const isReady = await isCdpAvailable(env.chromeDebugPort, 400);
          if (isReady) {
            await adapter.connect();
            for (const char of action.text) {
              await adapter.pressKey(char);
            }
            return createActionResult(action, 'success', `Typed text into active window.`, startedAt);
          }
        } catch {}

        try {
          await typeText(action.text);
          return createActionResult(action, 'success', `Typed text into active window.`, startedAt);
        } catch (err) {
          return createActionResult(action, 'failed', err instanceof Error ? err.message : String(err), startedAt);
        }
      }

      case 'keypress': {
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        const adapter = getBrowserAdapter(env);
        try {
          const isReady = await isCdpAvailable(env.chromeDebugPort, 400);
          if (isReady) {
            await adapter.connect();
            for (const key of action.keys) {
              await adapter.pressKey(key);
            }
            return createActionResult(action, 'success', `Pressed keys: ${action.keys.join('+')}`, startedAt);
          }
        } catch {}

        try {
          await sendKeypress(action.keys);
          return createActionResult(action, 'success', `Pressed keys: ${action.keys.join('+')}`, startedAt);
        } catch (err) {
          return createActionResult(action, 'failed', err instanceof Error ? err.message : String(err), startedAt);
        }
      }

      case 'click':
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        await mouseClick(action.x, action.y, action.button);
        return createActionResult(
          action,
          'success',
          `Clicked ${action.button || 'left'} button${action.x !== undefined && action.y !== undefined ? ` at (${action.x}, ${action.y})` : ''}.`,
          startedAt
        );

      case 'find_element':
        if (platform() !== 'win32') {
          return createActionResult(
            action,
            'unsupported',
            'This desktop action currently requires Windows.',
            startedAt,
            { error: 'PLATFORM_UNSUPPORTED' }
          );
        }
        return executeFindElement(action, startedAt);

      case 'navigate': {
        if (platform() !== 'win32') {
          return createActionResult(action, 'unsupported', 'This desktop action currently requires Windows.', startedAt, { error: 'PLATFORM_UNSUPPORTED' });
        }
        const adapter = getBrowserAdapter(env);
        try {
          await adapter.connect();
          const navResult = await adapter.navigateTo(action.url);
          if (navResult.success) {
            return createActionResult(action, 'success', 'Navigated to ' + action.url, startedAt, { data: { finalUrl: navResult.finalUrl } });
          }
          return createActionResult(action, 'failed', 'Navigation failed to ' + action.url, startedAt, { error: 'NAVIGATION_FAILED' });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Browser navigation failed';
          return createActionResult(action, 'failed', msg, startedAt, { error: msg.includes('DevTools') || msg.includes('connect') ? 'CDP_NOT_CONNECTED' : 'NAVIGATION_FAILED' });
        }
      }

      case 'find_window': {
        if (platform() !== 'win32') {
          return createActionResult(action, 'unsupported', 'This desktop action currently requires Windows.', startedAt, { error: 'PLATFORM_UNSUPPORTED' });
        }
        const matches = await findWindows(action.query);
        return createActionResult(
          action,
          'success',
          matches.length > 0
            ? 'Found ' + String(matches.length) + ' window(s) matching "' + action.query + '".'
            : 'No windows found matching "' + action.query + '".',
          startedAt,
          { data: { matches } }
        );
      }

      case 'find_ui_element': {
        if (platform() !== 'win32') {
          return createActionResult(action, 'unsupported', 'This desktop action currently requires Windows.', startedAt, { error: 'PLATFORM_UNSUPPORTED' });
        }
        const element = await findUiElement(action.windowTitle, { name: action.name, role: action.role });
        if (element) {
          return createActionResult(action, 'success', 'Found UI element: ' + (element.name || element.role), startedAt, { data: element });
        }
        return createActionResult(action, 'failed', 'UI element not found matching query in "' + action.windowTitle + '".', startedAt, { error: 'ELEMENT_NOT_FOUND' });
      }

      case 'find_browser_element': {
        if (platform() !== 'win32') {
          return createActionResult(action, 'unsupported', 'This desktop action currently requires Windows.', startedAt, { error: 'PLATFORM_UNSUPPORTED' });
        }
        const adapter = getBrowserAdapter(env);
        try {
          await adapter.connect();
          const found = await adapter.findElement({ selector: action.selector, role: action.role, name: action.name, text: action.text });
          if (found) {
            return createActionResult(action, 'success', 'Found browser element: ' + (found.tagName || found.role), startedAt, { data: found });
          }
          return createActionResult(action, 'failed', 'Browser element not found.', startedAt, { error: 'ELEMENT_NOT_FOUND' });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Browser element search failed';
          return createActionResult(action, 'failed', msg, startedAt, { error: msg.includes('DevTools') || msg.includes('connect') ? 'CDP_NOT_CONNECTED' : 'ELEMENT_NOT_FOUND' });
        }
      }

      case 'wait_for_condition': {
        if (platform() !== 'win32') {
          return createActionResult(action, 'unsupported', 'This desktop action currently requires Windows.', startedAt, { error: 'PLATFORM_UNSUPPORTED' });
        }
        return executeWaitForCondition(action, env, startedAt);
      }

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

async function executeReadScreen(
  action: Extract<DesktopAction, { action: 'read_screen' }>,
  env: AgentEnv,
  startedAt: Date
): Promise<ActionResult> {
  const screenshotDir = resolve(env.filesRoot, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });
  const filename = `screen-${Date.now()}.png`;
  const filePath = resolve(screenshotDir, filename);

  const res = await captureScreen(filePath);
  return createActionResult(
    action,
    'success',
    `Captured desktop screenshot (${res.width}x${res.height}).`,
    startedAt,
    {
      data: {
        width: res.width,
        height: res.height,
        path: `screenshots/${filename}`,
        thumbnailBase64: res.thumbnailBase64
      }
    }
  );
}

async function executeSwitchWindow(
  action: Extract<DesktopAction, { action: 'switch_window' }>,
  startedAt: Date
): Promise<ActionResult> {
  const result = await switchWindow({
    appName: action.appName,
    title: action.title
  });

  if (result.success) {
    return createActionResult(
      action,
      'success',
      `Focused window: ${result.matchedTitle || action.title || action.appName}`,
      startedAt,
      { data: { matchedTitle: result.matchedTitle } }
    );
  }

  if (result.ambiguous) {
    return createActionResult(
      action,
      'failed',
      result.error || `Multiple matching windows found.`,
      startedAt,
      { data: { matches: result.matches }, error: 'AMBIGUOUS_TARGET' }
    );
  }

  return createActionResult(
    action,
    'failed',
    result.error || `Could not find an open window matching "${action.title || action.appName}".`,
    startedAt,
    { error: 'WINDOW_NOT_FOUND' }
  );
}

async function executeFindElement(
  action: Extract<DesktopAction, { action: 'find_element' }>,
  startedAt: Date
): Promise<ActionResult> {
  const matches = await findWindows(action.query);
  if (matches.length > 0) {
    return createActionResult(
      action,
      'success',
      `Found ${matches.length} open window${matches.length === 1 ? '' : 's'} matching "${action.query}".`,
      startedAt,
      { data: { matches } }
    );
  }

  return createActionResult(
    action,
    'success',
    `No open windows found matching "${action.query}".`,
    startedAt,
    { data: { matches: [] } }
  );
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
    return createActionResult(
      action,
      'needs_confirmation',
      `Closing ${action.appName} requires confirmation to prevent loss of unsaved work.`,
      startedAt
    );
  }

  const app = env.allowedApps[action.appName.toLowerCase()];
  if (!app?.processName) {
    return createActionResult(action, 'blocked', `${action.appName} has no allowlisted processName.`, startedAt);
  }

  if (platform() !== 'win32') {
    return createActionResult(
      action,
      'unsupported',
      'close_app is currently implemented for Windows process names only.',
      startedAt,
      { error: 'PLATFORM_UNSUPPORTED' }
    );
  }

  await runAndWait('taskkill.exe', ['/IM', app.processName, '/T']);
  return createActionResult(action, 'success', `Closed ${action.appName}.`, startedAt);
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
      return createActionResult(
        action,
        'needs_confirmation',
        `Deleting ${action.path} requires explicit user confirmation.`,
        startedAt
      );
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

async function executeWaitForCondition(
  action: Extract<DesktopAction, { action: 'wait_for_condition' }>,
  env: AgentEnv,
  startedAt: Date
): Promise<ActionResult> {
  const timeoutMs = action.timeoutMs ?? 5000;
  const pollInterval = 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let conditionMet = false;

    switch (action.condition) {
      case 'process_exists':
        conditionMet = await checkProcessExists(action.target);
        break;

      case 'window_exists': {
        const state = await getWindowState(action.target);
        conditionMet = state !== null;
        break;
      }

      case 'url_matches': {
        try {
          const adapter = getBrowserAdapter(env);
          await adapter.connect();
          const pageState = await adapter.getPageState();
          conditionMet = pageState.url.toLowerCase().includes(action.target.toLowerCase());
        } catch {
          conditionMet = false;
        }
        break;
      }

      case 'element_exists': {
        try {
          const adapter = getBrowserAdapter(env);
          await adapter.connect();
          const el = await adapter.findElement({ selector: action.target });
          conditionMet = el !== null;
        } catch {
          conditionMet = false;
        }
        break;
      }
    }

    if (conditionMet) {
      return createActionResult(
        action,
        'success',
        'Condition met: ' + action.condition + ' (' + action.target + ')',
        startedAt
      );
    }

    await wait(pollInterval);
  }

  return createActionResult(
    action,
    'failed',
    'Condition not met within ' + String(timeoutMs) + 'ms: ' + action.condition + ' (' + action.target + ')',
    startedAt,
    { error: 'TIMEOUT' }
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
