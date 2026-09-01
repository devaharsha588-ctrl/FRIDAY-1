/**
 * Strongly typed database row, insert, and update types.
 * These are internal backend types — never imported by frontend code.
 * Keep separate from shared/chat-contracts.ts and other frontend-facing types.
 */

// ─── conversations ────────────────────────────────────────────────────────────

export type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

export type ConversationInsert = {
  id?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

export type ConversationUpdate = {
  title?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

// ─── messages ─────────────────────────────────────────────────────────────────

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type MessageInsert = {
  id?: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

// ─── tasks ────────────────────────────────────────────────────────────────────

export type TaskRow = {
  id: string;
  conversation_id: string | null;
  goal: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

export type TaskInsert = {
  id?: string;
  conversation_id?: string | null;
  goal: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TaskUpdate = {
  status?: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
};

// ─── task_actions ─────────────────────────────────────────────────────────────

export type TaskActionRow = {
  id: string;
  task_id: string;
  action_id: string;
  action_type: string;
  status: string;
  risk: string | null;
  requires_confirmation: boolean | null;
  confirmed: boolean | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  error_code: string | null;
  metadata: Record<string, unknown> | null;
};

export type TaskActionInsert = {
  id?: string;
  task_id: string;
  action_id: string;
  action_type: string;
  status: string;
  risk?: string | null;
  requires_confirmation?: boolean | null;
  confirmed?: boolean | null;
  started_at?: string | null;
  completed_at?: string | null;
  result_summary?: string | null;
  error_code?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TaskActionUpdate = {
  status?: string;
  confirmed?: boolean | null;
  completed_at?: string | null;
  result_summary?: string | null;
  error_code?: string | null;
  metadata?: Record<string, unknown> | null;
};

// ─── memories ─────────────────────────────────────────────────────────────────

export type MemoryRow = {
  id: string;
  content: string;
  category: string | null;
  importance: number | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

export type MemoryInsert = {
  id?: string;
  content: string;
  category?: string | null;
  importance?: number | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

export type MemoryUpdate = {
  content?: string;
  category?: string | null;
  importance?: number | null;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

// ─── preferences ──────────────────────────────────────────────────────────────

export type PreferenceRow = {
  id: string;
  key: string;
  value: unknown;
  updated_at: string;
};

export type PreferenceInsert = {
  id?: string;
  key: string;
  value: unknown;
  updated_at?: string;
};

// ─── model_status ─────────────────────────────────────────────────────────────

export type ModelStatusRow = {
  id: string;
  role: string;
  model_id: string;
  provider: string | null;
  free: boolean;
  available: boolean;
  healthy: boolean;
  verification_status: string | null;
  verified_at: string | null;
  updated_at: string;
};

export type ModelStatusInsert = {
  id?: string;
  role: string;
  model_id: string;
  provider?: string | null;
  free: boolean;
  available: boolean;
  healthy: boolean;
  verification_status?: string | null;
  verified_at?: string | null;
  updated_at?: string;
};
