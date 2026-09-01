import { nanoid } from 'nanoid';
import { parseDesktopAction, type DesktopAction } from '../../shared/action-schema';

export type SimpleRouteResult =
  | {
      isSimple: true;
      action: DesktopAction;
      friendlyName: string;
      successMessage: string;
    }
  | {
      isSimple: false;
      reason?: string;
    };

const KNOWN_SITES: Record<string, { url: string; name: string }> = {
  youtube: { url: 'https://www.youtube.com', name: 'YouTube' },
  netflix: { url: 'https://www.netflix.com', name: 'Netflix' },
  wikipedia: { url: 'https://www.wikipedia.org', name: 'Wikipedia' },
  chatgpt: { url: 'https://chatgpt.com', name: 'ChatGPT' },
  gemini: { url: 'https://gemini.google.com', name: 'Google Gemini' },
  claude: { url: 'https://claude.ai', name: 'Claude' },
  gmail: { url: 'https://mail.google.com', name: 'Gmail' },
  github: { url: 'https://github.com', name: 'GitHub' },
  google: { url: 'https://www.google.com', name: 'Google' },
  reddit: { url: 'https://www.reddit.com', name: 'Reddit' },
  x: { url: 'https://x.com', name: 'X' },
  twitter: { url: 'https://x.com', name: 'Twitter' },
  amazon: { url: 'https://www.amazon.com', name: 'Amazon' },
  bing: { url: 'https://www.bing.com', name: 'Bing' },
  duckduckgo: { url: 'https://duckduckgo.com', name: 'DuckDuckGo' },
  twitch: { url: 'https://www.twitch.tv', name: 'Twitch' },
  whatsapp: { url: 'https://web.whatsapp.com', name: 'WhatsApp' },
  discord: { url: 'https://discord.com', name: 'Discord' },
  figma: { url: 'https://www.figma.com', name: 'Figma' },
  stackoverflow: { url: 'https://stackoverflow.com', name: 'Stack Overflow' },
  linkedin: { url: 'https://www.linkedin.com', name: 'LinkedIn' }
};

const KNOWN_APPS: Record<string, { appName: string; name: string }> = {
  calculator: { appName: 'calculator', name: 'Calculator' },
  calc: { appName: 'calculator', name: 'Calculator' },
  notepad: { appName: 'notepad', name: 'Notepad' },
  chrome: { appName: 'chrome', name: 'Chrome' },
  browser: { appName: 'chrome', name: 'Chrome' },
  'google chrome': { appName: 'chrome', name: 'Chrome' },
  vscode: { appName: 'vscode', name: 'Visual Studio Code' },
  code: { appName: 'vscode', name: 'Visual Studio Code' },
  'visual studio code': { appName: 'vscode', name: 'Visual Studio Code' },
  spotify: { appName: 'spotify', name: 'Spotify' },
  'file explorer': { appName: 'explorer', name: 'File Explorer' },
  explorer: { appName: 'explorer', name: 'File Explorer' },
  powershell: { appName: 'powershell', name: 'PowerShell' },
  terminal: { appName: 'terminal', name: 'Terminal' },
  cmd: { appName: 'cmd', name: 'Command Prompt' }
};


const ALLOWED_KEYS = new Set([
  'enter', 'tab', 'esc', 'escape', 'backspace', 'delete', 'space',
  'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'ctrl', 'alt', 'shift', 'win', 'windows',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
]);

const DANGEROUS_SCHEMES = /^(javascript|data|file|vbscript|powershell|cmd|shell|ms-msdt):/i;

const POLITE_PREFIX_REGEX = /^(?:please\s+|can\s+you\s+(?:please\s+)?|could\s+you\s+(?:please\s+)?|would\s+you\s+(?:please\s+)?|i\s+want\s+you\s+to\s+|go\s+ahead\s+and\s+|just\s+)+/i;

const COMPOUND_CONJUNCTIONS = /\b(?:and\s+search|and\s+find|to\s+find|and\s+send|and\s+type|and\s+click|and\s+open|and\s+press|then\s+search|then\s+find|then\s+open|then\s+type|then\s+press|after\s+that|and\s+also)\b/i;

export function normalizeCommandText(input: string): string {
  let text = input.trim();
  text = text.replace(/[.!?]+$/, '').trim();
  text = text.replace(POLITE_PREFIX_REGEX, '').trim();
  text = text.replace(/\s+/g, ' ');
  return text;
}

export function isCompoundCommand(text: string): boolean {
  if (COMPOUND_CONJUNCTIONS.test(text)) return true;
  if (/,\s*then\s+/i.test(text)) return true;
  if (/,\s*and\s+/i.test(text)) return true;
  if (/[;\n]/.test(text)) return true;
  if (/\b(?:and|then)\s+(?:find|search|look\s+for|send|write|type|click|press|switch|close)\b/i.test(text)) return true;
  return false;
}

export function routeSimpleCommand(rawInput: string): SimpleRouteResult {
  const normalized = normalizeCommandText(rawInput);
  if (!normalized) return { isSimple: false };

  if (isCompoundCommand(normalized)) {
    return { isSimple: false, reason: 'Compound command requiring multi-step planning' };
  }

  if (DANGEROUS_SCHEMES.test(normalized)) {
    return { isSimple: false, reason: 'Unsafe URI scheme' };
  }

  const lower = normalized.toLowerCase();

  if (
    lower === 'open a new tab' ||
    lower === 'open new tab' ||
    lower === 'new tab'
  ) {
    const action = parseDesktopAction({
      id: nanoid(),
      action: 'new_tab',
      url: 'https://www.google.com',
      risk: 'low',
      requiresConfirmation: false,
      reason: 'Opened a new browser tab.'
    });
    return {
      isSimple: true,
      action,
      friendlyName: 'New Tab',
      successMessage: 'Opened a new tab.'
    };
  }


  // ── 4. Known Website Shortcuts (e.g. "open youtube", "open wikipedia", "open chatgpt") ──
  const openSiteMatch = lower.match(/^(?:open|go\s+to|navigate\s+to|launch|start)\s+(?:the\s+)?([a-z0-9._-]+)(?:\s+(?:website|webpage|page|site))?$/);
  if (openSiteMatch) {
    const rawKey = openSiteMatch[1];
    const siteKey = rawKey.replace(/\.(?:com|org|net|io|ai|tv|co|gov|edu)$/i, '');
    const site = KNOWN_SITES[siteKey] || KNOWN_SITES[rawKey];
    if (site) {
      const action = parseDesktopAction({
        id: nanoid(),
        action: 'open_url',
        url: site.url,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Direct request to open ' + site.name + '.'
      });
      return {
        isSimple: true,
        action,
        friendlyName: site.name,
        successMessage: 'Opened ' + site.name + '.'
      };
    }
  }

  // ── 5. Direct URL / Domain Commands (e.g. "open https://...", "go to github.com")
  const urlCmdMatch = lower.match(/^(?:open|go\s+to|navigate\s+to|launch)\s+([^\s]+)$/);
  const candidateUrlStr = urlCmdMatch ? urlCmdMatch[1] : lower;

  if (isSafeUrlOrDomain(candidateUrlStr)) {
    const safeUrl = formatSafeUrl(candidateUrlStr);
    if (safeUrl) {
      const domainName = extractDomain(safeUrl);
      const action = parseDesktopAction({
        id: nanoid(),
        action: 'open_url',
        url: safeUrl,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Direct request to open URL.'
      });
      return {
        isSimple: true,
        action,
        friendlyName: domainName,
        successMessage: 'Opened ' + domainName + '.'
      };
    }
  }

  // ── 6. Known Applications (e.g. "open calculator", "open chrome") ──────────
  const appCmdMatch = lower.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)(?:\s+app|\s+application)?$/);
  if (appCmdMatch) {
    const appKey = appCmdMatch[1].trim();
    if (KNOWN_APPS[appKey]) {
      const app = KNOWN_APPS[appKey];
      const action = parseDesktopAction({
        id: nanoid(),
        action: 'open_app',
        appName: app.appName,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Direct request to open ' + app.name + '.'
      });
      return {
        isSimple: true,
        action,
        friendlyName: app.name,
        successMessage: 'Opened ' + app.name + '.'
      };
    }
  }

  // ── 7. Window Switching (e.g. "switch to chrome", "focus notepad") ──────────
  const switchMatch = lower.match(/^(?:switch\s+to|focus|bring\s+to\s+front)\s+(.+)$/);
  if (switchMatch) {
    const target = switchMatch[1].trim();
    if (target && !['the', 'a', 'this', 'that', 'it'].includes(target)) {
      const appInfo = KNOWN_APPS[target];
      const friendly = appInfo ? appInfo.name : target.charAt(0).toUpperCase() + target.slice(1);
      const action = parseDesktopAction({
        id: nanoid(),
        action: 'switch_window',
        appName: appInfo ? appInfo.appName : target,
        title: target,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Direct request to focus ' + friendly + ' window.'
      });
      return {
        isSimple: true,
        action,
        friendlyName: friendly,
        successMessage: 'Switched to ' + friendly + '.'
      };
    }
  }

  // ── 8. Direct Typing (e.g. "type hello world") ─────────────────────────────
  const typeMatch = normalized.match(/^(?:type\s+text|type)\s+["']?([^"']+)["']?$/i);
  if (typeMatch && typeMatch[1].trim()) {
    const textToType = typeMatch[1].trim();
    const action = parseDesktopAction({
      id: nanoid(),
      action: 'type_text',
      text: textToType,
      risk: 'low',
      requiresConfirmation: false,
      reason: 'Direct typing request.'
    });
    return {
      isSimple: true,
      action,
      friendlyName: 'Type Text',
      successMessage: 'Typed text into active window.'
    };
  }


  const keyMatch = lower.match(/^(?:press\s+key|press|hit\s+key|hit)\s+([a-z0-9+_-]+)$/);
  if (keyMatch && !['the', 'a', 'this', 'that', 'button', 'key'].includes(keyMatch[1])) {
    const rawKeys = keyMatch[1].split('+').map((k) => k.trim());
    const allValid = rawKeys.every((k) => ALLOWED_KEYS.has(k));
    if (allValid && rawKeys.length > 0 && rawKeys.length <= 4) {
      const formattedKey = rawKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join('+');
      const action = parseDesktopAction({
        id: nanoid(),
        action: 'keypress',
        keys: rawKeys,
        risk: 'low',
        requiresConfirmation: false,
        reason: 'Direct keypress request.'
      });
      return {
        isSimple: true,
        action,
        friendlyName: formattedKey,
        successMessage: 'Pressed ' + formattedKey + '.'
      };
    }
  }


  return { isSimple: false };
}

function isSafeUrlOrDomain(input: string): boolean {
  if (DANGEROUS_SCHEMES.test(input)) return false;
  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  if (/^(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(input)) {
    return true;
  }
  return false;
}

function formatSafeUrl(input: string): string | null {
  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      return null;
    } catch {
      return null;
    }
  }


  try {
    const formatted = 'https://' + input;
    const parsed = new URL(formatted);
    return parsed.href;
  } catch {
    return null;
  }
}


function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}
