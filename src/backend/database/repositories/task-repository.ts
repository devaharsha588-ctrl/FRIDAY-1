import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { TaskRow, TaskInsert, TaskUpdate } from '../database-types';
import { assertGuard, guardTaskGoal, guardJsonMetadata } from '../free-tier-guard';

const TABLE = 'tasks';
const DEFAULT_PAGE_SIZE = 20;

export class TaskRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(goal: string, conversationId?: string): Promise<TaskRow> {
    assertGuard(guardTaskGoal(goal));

    const insert: TaskInsert = {
      id: nanoid(),
      goal,
      status: 'planning',
      conversation_id: conversationId ?? null,
      started_at: new Date().toISOString()
    };

    const { data, error } = await this.db
      .from(TABLE)
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`[TaskRepository] create failed: ${error.message}`);
    return data as TaskRow;
  }

  async get(id: string): Promise<TaskRow | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, conversation_id, goal, status, started_at, completed_at, error_code, error_message, metadata')
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[TaskRepository] get failed: ${error.message}`);
    return data as TaskRow;
  }

  async list(limit = DEFAULT_PAGE_SIZE, offset = 0): Promise<TaskRow[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, conversation_id, goal, status, started_at, completed_at, error_code, error_message, metadata')
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`[TaskRepository] list failed: ${error.message}`);
    return (data ?? []) as TaskRow[];
  }

  async update(id: string, updates: TaskUpdate): Promise<TaskRow | null> {
    if (updates.metadata) assertGuard(guardJsonMetadata(updates.metadata));

    const { data, error } = await this.db
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[TaskRepository] update failed: ${error.message}`);
    return data as TaskRow;
  }

  async complete(id: string, metadata?: Record<string, unknown>): Promise<TaskRow | null> {
    if (metadata) assertGuard(guardJsonMetadata(metadata));

    return this.update(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      metadata: metadata ?? null
    });
  }

  async fail(id: string, errorCode: string, errorMessage: string): Promise<TaskRow | null> {
    return this.update(id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_code: errorCode.slice(0, 100),
      error_message: errorMessage.slice(0, 2000)
    });
  }
}
