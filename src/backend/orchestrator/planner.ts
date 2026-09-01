import { nanoid } from 'nanoid';
import { parseDesktopAction, type DesktopAction } from '../../shared/action-schema';

const urlPattern = /\bhttps?:\/\/[^\s"'<>]+/i;

// ─── Phase 3B: Known site URL resolution for planner ────────────────────────

const PLANNER_SITES: Record<string, string> = {
  youtube: 'https://www.youtube.com',
  netflix: 'https://www.netflix.com',
  wikipedia: 'https://www.wikipedia.org',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  claude: 'https://claude.ai',
  gmail: 'https://mail.google.com',
  github: 'https://github.com',
  google: 'https://www.google.com',
  reddit: 'https://www.reddit.com',
  x: 'https://x.com',
  twitter: 'https://x.com',
  amazon: 'https://www.amazon.com',
  bing: 'https://www.bing.com',
  duckduckgo: 'https://duckduckgo.com',
  twitch: 'https://www.twitch.tv',
  whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com',
  figma: 'https://www.figma.com',
  stackoverflow: 'https://stackoverflow.com',
  linkedin: 'https://www.linkedin.com'
};

function resolveSiteUrl(key: string): string | null {
  return PLANNER_SITES[key.toLowerCase()] ?? null;
}

export function planComputerActions(input: string): DesktopAction[] {
  const text = input.trim();
  const lower = text.toLowerCase();
  const rawActions: DesktopAction[] = [];

  // Screenshot / Read Screen
  if (/\b(screenshot|take a screenshot|capture screen|read screen|see screen)\b/i.test(text)) {
    rawActions.push({
      id: nanoid(),
      action: 'read_screen',
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to capture and inspect the screen.'
    });
    return rawActions.map(parseDesktopAction);
  }

  // ── Phase 3B: Multi-step compound workflows (evaluate first before simple patterns) ──

  // "go to youtube and search for X" / "open youtube and search for X"
  const searchSiteMatch = lower.match(
    /\b(?:go\s+to|open|navigate\s+to|launch)\s+([a-z0-9._-]+(?:\.[a-z]{2,})?)\s+and\s+(?:search|search\s+for|find|look\s+for|look\s+up)\s+(.+)/
  );
  if (searchSiteMatch) {
    const siteKey = searchSiteMatch[1].replace(/\.com$/, '').replace(/\.org$/, '').replace(/\.net$/, '');
    const searchQuery = cleanPath(searchSiteMatch[2]);
    const siteUrl = resolveSiteUrl(siteKey);

    if (siteUrl) {
      rawActions.push(
        { id: nanoid(), action: 'navigate', url: siteUrl, risk: 'low', requiresConfirmation: false, reason: 'Navigate to ' + siteKey },
        { id: nanoid(), action: 'wait_for_condition', condition: 'url_matches', target: siteKey, timeoutMs: 8000, risk: 'low', requiresConfirmation: false, reason: 'Wait for page to load' },
        { id: nanoid(), action: 'find_browser_element', role: 'searchbox', name: 'search', risk: 'low', requiresConfirmation: false, reason: 'Find the search input' },
        { id: nanoid(), action: 'click', button: 'left', target: 'search input', risk: 'low', requiresConfirmation: false, reason: 'Click the search input' },
        { id: nanoid(), action: 'type_text', text: searchQuery, risk: 'low', requiresConfirmation: false, reason: 'Type the search query' },
        { id: nanoid(), action: 'keypress', keys: ['enter'], risk: 'low', requiresConfirmation: false, reason: 'Submit the search' }
      );
      return rawActions.map(parseDesktopAction);
    }
  }

  // "open notepad and type X" / "open app and type X"
  const openAndTypeMatch = lower.match(
    /\b(?:open|launch|start)\s+([a-z\s]+?)\s+and\s+(?:type|write|enter)\s+(.+)/
  );
  if (openAndTypeMatch) {
    const appName = openAndTypeMatch[1].trim();
    const textToType = cleanPath(openAndTypeMatch[2]);
    rawActions.push(
      { id: nanoid(), action: 'open_app', appName, risk: 'low', requiresConfirmation: false, reason: 'Open ' + appName },
      { id: nanoid(), action: 'wait_for_condition', condition: 'process_exists', target: appName, timeoutMs: 5000, risk: 'low', requiresConfirmation: false, reason: 'Wait for ' + appName + ' to start' },
      { id: nanoid(), action: 'switch_window', title: appName, risk: 'low', requiresConfirmation: false, reason: 'Focus ' + appName + ' window' },
      { id: nanoid(), action: 'type_text', text: textToType, risk: 'low', requiresConfirmation: false, reason: 'Type text' }
    );
    return rawActions.map(parseDesktopAction);
  }

  // "open chrome and go to X" / "open browser and navigate to X"
  const openBrowserAndGoMatch = lower.match(
    /\b(?:open|launch|start)\s+(?:chrome|browser|google\s+chrome)\s+and\s+(?:go\s+to|navigate\s+to|open)\s+([^\s]+)/
  );
  if (openBrowserAndGoMatch) {
    const target = openBrowserAndGoMatch[1];
    const siteKey = target.replace(/\.com$/, '').replace(/\.org$/, '').replace(/\.net$/, '');
    const siteUrl = resolveSiteUrl(siteKey) || (target.includes('.') ? 'https://' + target : resolveSiteUrl(target));
    if (siteUrl) {
      rawActions.push(
        { id: nanoid(), action: 'open_app', appName: 'chrome', risk: 'low', requiresConfirmation: false, reason: 'Open Chrome' },
        { id: nanoid(), action: 'wait_for_condition', condition: 'process_exists', target: 'chrome', timeoutMs: 5000, risk: 'low', requiresConfirmation: false, reason: 'Wait for Chrome to start' },
        { id: nanoid(), action: 'navigate', url: siteUrl, risk: 'low', requiresConfirmation: false, reason: 'Navigate to ' + target },
        { id: nanoid(), action: 'wait_for_condition', condition: 'url_matches', target: siteKey, timeoutMs: 8000, risk: 'low', requiresConfirmation: false, reason: 'Wait for page to load' }
      );
      return rawActions.map(parseDesktopAction);
    }
  }

  // "go to youtube" / "navigate to github.com" (standalone navigation without further action)
  const navMatch = lower.match(/\b(?:go\s+to|navigate\s+to)\s+([a-z0-9._-]+(?:\.[a-z]{2,})?)\b/);
  if (navMatch) {
    const siteKey = navMatch[1].replace(/\.com$/, '').replace(/\.org$/, '').replace(/\.net$/, '');
    const siteUrl = resolveSiteUrl(siteKey) || (navMatch[1].includes('.') ? 'https://' + navMatch[1] : null);
    if (siteUrl) {
      rawActions.push(
        { id: nanoid(), action: 'navigate', url: siteUrl, risk: 'low', requiresConfirmation: false, reason: 'Navigate to ' + navMatch[1] },
        { id: nanoid(), action: 'wait_for_condition', condition: 'url_matches', target: siteKey, timeoutMs: 8000, risk: 'low', requiresConfirmation: false, reason: 'Wait for navigation' }
      );
      return rawActions.map(parseDesktopAction);
    }
  }

  // ── Single-step direct site open (e.g. "open wikipedia", "open chatgpt", "open netflix") ──
  const openSiteOnlyMatch = lower.match(/^(?:open|launch)\s+(?:the\s+)?([a-z0-9._-]+)(?:\s+(?:website|webpage|page|site))?$/);
  if (openSiteOnlyMatch) {
    const rawKey = openSiteOnlyMatch[1];
    const siteKey = rawKey.replace(/\.(?:com|org|net|io|ai|tv|co|gov|edu)$/i, '');
    const siteUrl = resolveSiteUrl(siteKey) || resolveSiteUrl(rawKey) || (rawKey.includes('.') ? 'https://' + rawKey : null);
    if (siteUrl) {
      rawActions.push({
        id: nanoid(),
        action: 'open_url',
        url: siteUrl,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Open ' + (siteKey.charAt(0).toUpperCase() + siteKey.slice(1)) + '.'
      });
      return rawActions.map(parseDesktopAction);
    }
  }

  // ── Single-step direct app open (e.g. "open notepad", "open calculator", "open chrome", "open spotify") ──
  const appMatch = lower.match(/^(?:open|launch|start)\s+(?:the\s+)?(notepad|calculator|calc|chrome|browser|google\s+chrome|vscode|code|visual\s+studio\s+code|spotify|explorer|file\s+explorer|terminal|powershell|cmd)(?:\s+app|\s+application)?$/);
  if (appMatch) {
    const rawName = appMatch[1].trim();
    let appName = rawName;
    if (appName === 'calc') appName = 'calculator';
    if (appName === 'browser' || appName === 'google chrome') appName = 'chrome';
    if (appName === 'code' || appName === 'visual studio code') appName = 'vscode';
    if (appName === 'file explorer') appName = 'explorer';
    rawActions.push({
      id: nanoid(),
      action: 'open_app',
      appName,
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to open an allowlisted desktop application.'
    });
    return rawActions.map(parseDesktopAction);
  }

  // Open URL or Tab
  const url = text.match(urlPattern)?.[0];
  if (url && /\b(open|launch|go to|navigate|new tab)\b/i.test(text)) {
    rawActions.push({
      id: nanoid(),
      action: lower.includes('new tab') ? 'new_tab' : 'open_url',
      url,
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to open a web destination.'
    });
  }

  // Close App
  const closeAppMatch = lower.match(/\bclose\s+(notepad|calculator|calc)\b/);
  if (closeAppMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'close_app',
      appName: closeAppMatch[1] === 'calc' ? 'calculator' : closeAppMatch[1],
      risk: 'high',
      requiresConfirmation: true,
      confirmed: false,
      reason: 'The request asks FRIDAY to close a desktop application.'
    });
  }

  // Switch Window / Focus
  const switchMatch = lower.match(/\b(?:switch to|focus|bring to front|switch window)\s+(.+)/);
  if (switchMatch) {
    const target = cleanPath(switchMatch[1]);
    rawActions.push({
      id: nanoid(),
      action: 'switch_window',
      title: target,
      appName: target,
      risk: 'low',
      requiresConfirmation: false,
      reason: `The request asks FRIDAY to focus the "${target}" window.`
    });
  }

  // Type Text
  const typeMatch = lower.match(/\b(?:type text|type)\s+["']?([^"']+)["']?/);
  if (typeMatch && !lower.startsWith('switch')) {
    rawActions.push({
      id: nanoid(),
      action: 'type_text',
      text: typeMatch[1].trim(),
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to type text into the active window.'
    });
  }

  // Keypress
  const keyMatch = lower.match(/\b(?:press key|press|hit key|hit)\s+([a-z0-9+_-]+)\b/);
  if (keyMatch && !['the', 'a', 'this', 'that', 'button', 'key'].includes(keyMatch[1])) {
    const rawKeys = keyMatch[1].split('+');
    rawActions.push({
      id: nanoid(),
      action: 'keypress',
      keys: rawKeys,
      risk: 'low',
      requiresConfirmation: false,
      reason: `The request asks FRIDAY to press key combination "${keyMatch[1]}".`
    });
  }

  // Wait
  const waitMatch = lower.match(/\bwait\s+(\d{1,2})\s*(second|seconds|sec|ms|millisecond|milliseconds)\b/);
  if (waitMatch) {
    const amount = Number(waitMatch[1]);
    const unit = waitMatch[2];
    rawActions.push({
      id: nanoid(),
      action: 'wait',
      ms: unit.startsWith('ms') || unit.startsWith('millisecond') ? amount : amount * 1000,
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request includes an explicit wait.'
    });
  }

  // File Operations: List
  const listFilesMatch = lower.match(/\blist\s+(?:files|folder|directory)(?:\s+in\s+(.+))?/);
  if (listFilesMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'file_operation',
      operation: 'list',
      path: cleanPath(listFilesMatch[1] || '.'),
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to list files through the controlled file action.'
    });
  }

  // File Operations: Read
  const readFileMatch = lower.match(/\bread\s+file\s+(.+)/);
  if (readFileMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'file_operation',
      operation: 'read',
      path: cleanPath(readFileMatch[1]),
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to read a file from the controlled file directory.'
    });
  }

  // File Operations: Delete
  const deleteFileMatch = lower.match(/\bdelete\s+file\s+(.+)/);
  if (deleteFileMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'file_operation',
      operation: 'delete',
      path: cleanPath(deleteFileMatch[1]),
      risk: 'high',
      requiresConfirmation: true,
      confirmed: false,
      reason: 'The request asks FRIDAY to delete a file.'
    });
  }

  // File Operations: Mkdir
  const mkdirMatch = lower.match(/\b(?:create folder|make directory|mkdir)\s+(.+)/);
  if (mkdirMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'file_operation',
      operation: 'mkdir',
      path: cleanPath(mkdirMatch[1]),
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to create a directory.'
    });
  }

  // Find Window / Element
  const findMatch = lower.match(/\bfind\s+(?:window|app|application)\s+(.+)/);
  if (findMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'find_element',
      query: cleanPath(findMatch[1]),
      risk: 'low',
      requiresConfirmation: false,
      reason: `The request asks FRIDAY to locate open windows matching "${findMatch[1]}".`
    });
  }

  return rawActions.map(parseDesktopAction);
}

export function describeUnsupportedComputerRequest(input: string): string | undefined {
  const lower = input.toLowerCase();
  const unsupportedSignals = [
    'whatsapp',
    'send telegram',
    'discord message'
  ];

  if (unsupportedSignals.some((signal) => lower.includes(signal))) {
    return 'That specific messaging or browser-plugin integration is not yet connected to the local agent.';
  }

  return undefined;
}

function cleanPath(value: string): string {
  return value.replace(/[."'`]+$/g, '').trim() || '.';
}
