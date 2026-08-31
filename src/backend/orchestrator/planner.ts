import { nanoid } from 'nanoid';
import type { DesktopAction } from '../../shared/action-schema';

const urlPattern = /\bhttps?:\/\/[^\s"'<>]+/i;

export function planComputerActions(input: string): DesktopAction[] {
  const text = input.trim();
  const lower = text.toLowerCase();
  const actions: DesktopAction[] = [];

  const url = text.match(urlPattern)?.[0];
  if (url && /\b(open|launch|go to|navigate|new tab)\b/i.test(text)) {
    actions.push({
      id: nanoid(),
      action: lower.includes('new tab') ? 'new_tab' : 'open_url',
      url,
      reason: 'The request asks FRIDAY to open a web destination.'
    });
  }

  const appMatch = lower.match(/\bopen\s+(notepad|calculator|calc)\b/);
  if (appMatch) {
    actions.push({
      id: nanoid(),
      action: 'open_app',
      appName: appMatch[1] === 'calc' ? 'calculator' : appMatch[1],
      reason: 'The request asks FRIDAY to open an allowlisted desktop application.'
    });
  }

  const waitMatch = lower.match(/\bwait\s+(\d{1,2})\s*(second|seconds|sec|ms|millisecond|milliseconds)\b/);
  if (waitMatch) {
    const amount = Number(waitMatch[1]);
    const unit = waitMatch[2];
    actions.push({
      id: nanoid(),
      action: 'wait',
      ms: unit.startsWith('ms') || unit.startsWith('millisecond') ? amount : amount * 1000,
      reason: 'The request includes an explicit wait.'
    });
  }

  const listFilesMatch = lower.match(/\blist\s+(files|folder|directory)(?:\s+in\s+(.+))?/);
  if (listFilesMatch) {
    actions.push({
      id: nanoid(),
      action: 'file_operation',
      operation: 'list',
      path: cleanPath(listFilesMatch[2] || '.'),
      reason: 'The request asks FRIDAY to list files through the controlled file action.'
    });
  }

  return actions;
}

export function describeUnsupportedComputerRequest(input: string): string | undefined {
  const lower = input.toLowerCase();
  const unsupportedSignals = [
    'click',
    'type',
    'send message',
    'whatsapp',
    'read screen',
    'find',
    'switch window',
    'keyboard'
  ];

  if (unsupportedSignals.some((signal) => lower.includes(signal))) {
    return 'That request needs screen reading, element finding, keyboard, or mouse automation. The action schemas exist, but the local adapter is intentionally blocked until a real UI automation layer is connected.';
  }

  return undefined;
}

function cleanPath(value: string): string {
  return value.replace(/[."'`]+$/g, '').trim() || '.';
}

