import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { TaskActionRow, TaskActionInsert, TaskActionUpdate } from '../database-types';
import { assertGuard, guardActionResultSummary, guardJsonMetadata } from '../free-tier-guard';
import type { DesktopAction, ActionResult } from '../../../shared/action-schema';

const TABLE = 'task_actions';

export class TaskActionRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Records a compact audit entry when an action starts.
   * Does NOT store screenshots, full DOM, or large tool payloads.
   */
  async record(taskId: string, action: DesktopAction): Promise<TaskActionRow> {
    const insert: TaskActionInsert = {
      id: nanoid(),
      task_id: taskId,
      action_id: action.id,
      action_type: action.action,
      status: 'running',
      risk: action.risk ?? null,
      requires_confirmation: action.requiresConfirmation ?? null,
      confirmed: action.confirmed ?? null,
      started_at: new Date().toISOString()
    };

    const { data, error } = await this.db
      .from(TABLE)
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`[TaskActionRepository] record failed: ${error.message}`);
    return data as TaskActionRow;
  }

  /**
   * Updates an action record with compact result information.
   * The result_summary is truncated at 10,000 characters by the free-tier guard.
   */
  async complete(taskId: string, result: ActionResult): Promise<void> {
    const summary = result.summary ?? '';
    assertGuard(guardActionResultSummary(summary));

    const update: TaskActionUpdate = {
      status: result.status,
      completed_at: result.completedAt,
      result_summary: summary || null,
      error_code: result.error ? result.error.slice(0, 200) : null
    };

    const { error } = await this.db
      .from(TABLE)
      .update(update)
      .eq('task_id', taskId)
      .eq('action_id', result.id);

    if (error) throw new Error(`[TaskActionRepository] complete failed: ${error.message}`);
  }

  async getByTask(taskId: string): Promise<TaskActionRow[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, task_id, action_id, action_type, status, risk, requires_confirmation, confirmed, started_at, completed_at, result_summary, error_code, metadata')
      .eq('task_id', taskId)
      .order('started_at', { ascending: true });

    if (error) throw new Error(`[TaskActionRepository] getByTask failed: ${error.message}`);
    return (data ?? []) as TaskActionRow[];
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    assertGuard(guardJsonMetadata(metadata));

    const update: TaskActionUpdate = { metadata };
    const { error } = await this.db.from(TABLE).update(update).eq('id', id);
    if (error) throw new Error(`[TaskActionRepository] updateMetadata failed: ${error.message}`);
  }
}
