import { nanoid } from 'nanoid';
import { parseDesktopAction, type DesktopAction } from '../../shared/action-schema';

const urlPattern = /\bhttps?:\/\/[^\s"'<>]+/i;

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

  // Open App
  const appMatch = lower.match(/\bopen\s+(notepad|calculator|calc)\b/);
  if (appMatch) {
    rawActions.push({
      id: nanoid(),
      action: 'open_app',
      appName: appMatch[1] === 'calc' ? 'calculator' : appMatch[1],
      risk: 'low',
      requiresConfirmation: false,
      reason: 'The request asks FRIDAY to open an allowlisted desktop application.'
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
