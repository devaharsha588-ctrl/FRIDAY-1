import { nanoid } from 'nanoid';
import type { ObservationType, TaskObservation } from '../../shared/chat-contracts';

export function createObservation(
  taskId: string,
  stepIndex: number,
  type: ObservationType,
  data: unknown
): TaskObservation {
  return {
    id: nanoid(),
    taskId,
    stepIndex,
    type,
    data,
    createdAt: new Date().toISOString()
  };
}

export function summariseObservation(obs: TaskObservation): string {
  switch (obs.type) {
    case 'screenshot': {
      const d = obs.data as Record<string, unknown> | null;
      if (d && typeof d.width === 'number' && typeof d.height === 'number') {
        return 'Screenshot captured: ' + String(d.width) + 'x' + String(d.height) + 'px';
      }
      return 'Screenshot captured.';
    }
    case 'active_window': {
      const d = obs.data as Record<string, unknown> | null;
      if (d && typeof d.title === 'string') return 'Active window: "' + d.title + '"';
      return 'Active window captured.';
    }
    case 'window_list': {
      const d = obs.data as unknown[];
      if (Array.isArray(d)) return String(d.length) + ' window(s) found.';
      return 'Window list captured.';
    }
    case 'action_result':
      return 'Action result recorded.';
    case 'verification': {
      const d = obs.data as { observation?: string; verified?: boolean } | null;
      if (d && typeof d.observation === 'string') {
        return d.verified ? 'Verified: ' + d.observation : 'Verification failed: ' + d.observation;
      }
      return 'Action verification recorded.';
    }
    case 'recovery': {
      const d = obs.data as { strategy?: string; reason?: string } | null;
      if (d && typeof d.strategy === 'string') {
        return 'Recovery (' + d.strategy + '): ' + (d.reason || 'Attempting recovery');
      }
      return 'Recovery recorded.';
    }
    case 'browser_state': {
      const d = obs.data as { url?: string; title?: string } | null;
      if (d && typeof d.title === 'string' && typeof d.url === 'string') {
        return 'Browser state: ' + d.title + ' (' + d.url + ')';
      }
      return 'Browser state recorded.';
    }
    case 'ui_state': {
      const d = obs.data as { name?: string; role?: string } | null;
      if (d && (d.name || d.role)) {
        return 'UI state: ' + (d.name || d.role);
      }
      return 'UI state recorded.';
    }
    case 'error': {
      const d = obs.data as Record<string, unknown> | null;
      if (d && typeof d.message === 'string') return 'Error: ' + d.message;
      return 'Error observation recorded.';
    }
    default:
      return 'Observation recorded.';
  }
}

