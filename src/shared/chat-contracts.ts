import type { ActionResult, ActionRisk, DesktopAction } from './action-schema';
import type { TaskType } from './task-types';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ConversationMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type PublicModelProvider = {
  taskType: TaskType;
  configured: boolean;
  model?: string;
  baseUrl: string;
};

export type ChatResponse = {
  conversationId: string;
  taskType: TaskType;
  provider: PublicModelProvider;
  message: ConversationMessage;
  plannedActions: DesktopAction[];
  actionResults: ActionResult[];
};

// ─── Phase 2: Task lifecycle ────────────────────────────────────────────────

export type TaskStatus =
  | 'planning'
  | 'running'
  | 'waiting_confirmation'
  | 'observing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PendingConfirmation = {
  actionId: string;
  action: DesktopAction;
  risk: ActionRisk;
  reason: string;
};

export type TaskState = {
  id: string;
  goal: string;
  conversationId?: string;
  status: TaskStatus;
  stepCount: number;
  maxSteps: number;
  actions: DesktopAction[];
  results: ActionResult[];
  pendingConfirmation: PendingConfirmation | null;
  error?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

// ─── SSE stream events ───────────────────────────────────────────────────────

export type StreamEvent =
  // Original single-turn events
  | { type: 'status'; message: string }
  | { type: 'classification'; taskType: TaskType; provider: PublicModelProvider }
  | { type: 'planned_actions'; actions: DesktopAction[] }
  | { type: 'action_result'; result: ActionResult }
  | { type: 'final'; response: ChatResponse }
  | { type: 'error'; message: string }
  // Phase 2: multi-step task events
  | { type: 'task_started'; task: TaskState }
  | { type: 'task_planning'; taskId: string; goal: string }
  | { type: 'action_created'; taskId: string; action: DesktopAction }
  | { type: 'action_started'; taskId: string; actionId: string }
  | { type: 'action_completed'; taskId: string; result: ActionResult }
  | { type: 'action_failed'; taskId: string; result: ActionResult }
  | { type: 'observation_created'; taskId: string; observation: TaskObservation }
  | { type: 'confirmation_required'; taskId: string; pending: PendingConfirmation }
  | { type: 'task_paused'; task: TaskState }
  | { type: 'task_resumed'; taskId: string }
  | { type: 'task_completed'; task: TaskState }
  | { type: 'task_failed'; task: TaskState }
  | { type: 'task_cancelled'; task: TaskState };

// ─── Observations ────────────────────────────────────────────────────────────

export type ObservationType = 'screenshot' | 'active_window' | 'window_list' | 'action_result' | 'error';

export type TaskObservation = {
  id: string;
  taskId: string;
  stepIndex: number;
  type: ObservationType;
  data: unknown;
  createdAt: string;
};

