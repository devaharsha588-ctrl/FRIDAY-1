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
    case 'error': {
      const d = obs.data as Record<string, unknown> | null;
      if (d && typeof d.message === 'string') return 'Error: ' + d.message;
      return 'Error observation recorded.';
    }
    default:
      return 'Observation recorded.';
  }
}

