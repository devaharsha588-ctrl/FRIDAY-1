import type { ActionResult, DesktopAction } from './action-schema';
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

export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'classification'; taskType: TaskType; provider: PublicModelProvider }
  | { type: 'planned_actions'; actions: DesktopAction[] }
  | { type: 'action_result'; result: ActionResult }
  | { type: 'final'; response: ChatResponse }
  | { type: 'error'; message: string };

