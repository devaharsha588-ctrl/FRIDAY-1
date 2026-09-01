import { nanoid } from 'nanoid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import type { PendingConfirmation, TaskState, TaskStatus } from '../../shared/chat-contracts';
import { TaskRepository } from '../database/repositories/task-repository';
import { TaskActionRepository } from '../database/repositories/task-action-repository';

const DEFAULT_MAX_STEPS = parseInt(process.env.FRIDAY_MAX_TASK_STEPS ?? '20', 10);

export class TaskStore {
  // In-memory runtime state — AbortControllers, locks, live execution objects stay here
  private tasks = new Map<string, TaskState>();

  // Supabase repositories — only set when Supabase is configured
  private taskRepo: TaskRepository | null = null;
  private actionRepo: TaskActionRepository | null = null;
  private useSupabase = false;

  constructor(supabaseClient?: SupabaseClient) {
    if (supabaseClient) {
      this.taskRepo = new TaskRepository(supabaseClient);
      this.actionRepo = new TaskActionRepository(supabaseClient);
      this.useSupabase = true;
    }
  }

  create(goal: string, conversationId?: string): TaskState {
    const now = new Date().toISOString();
    const task: TaskState = {
      id: nanoid(),
      goal,
      conversationId,
      status: 'planning',
      stepCount: 0,
      maxSteps: DEFAULT_MAX_STEPS,
      actions: [],
      results: [],
      pendingConfirmation: null,
      startedAt: now,
      updatedAt: now
    };
    this.tasks.set(task.id, task);

    // Async fire-and-forget: record durable task start
    if (this.useSupabase && this.taskRepo) {
      this.taskRepo.create(goal, conversationId).catch(() => {
        // Non-fatal: task continues in memory even if Supabase write fails
      });
    }

    return task;
  }

  get(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  list(): TaskState[] {
    return Array.from(this.tasks.values()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    );
  }

  updateStatus(id: string, status: TaskStatus, error?: string): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (error !== undefined) task.error = error;

    const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';
    if (isTerminal) {
      task.completedAt = task.updatedAt;
    }

    // Persist durable completion/failure events to Supabase
    if (this.useSupabase && this.taskRepo && isTerminal) {
      if (status === 'completed') {
        this.taskRepo.complete(id).catch(() => {});
      } else if (status === 'failed') {
        this.taskRepo.fail(id, 'TASK_FAILED', error ?? 'Task failed').catch(() => {});
      } else if (status === 'cancelled') {
        this.taskRepo.fail(id, 'TASK_CANCELLED', 'Task was cancelled').catch(() => {});
      }
    }

    return task;
  }

  addAction(id: string, action: DesktopAction): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    task.actions.push(action);
    task.stepCount += 1;
    task.updatedAt = new Date().toISOString();

    // Record compact action audit entry
    if (this.useSupabase && this.actionRepo) {
      this.actionRepo.record(id, action).catch(() => {});
    }

    return task;
  }

  addResult(id: string, result: ActionResult): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const idx = task.results.findIndex((r) => r.id === result.id);
    if (idx >= 0) {
      task.results[idx] = result;
    } else {
      task.results.push(result);
    }
    task.updatedAt = new Date().toISOString();

    // Record compact action completion
    if (this.useSupabase && this.actionRepo) {
      this.actionRepo.complete(id, result).catch(() => {});
    }

    return task;
  }

  setPendingConfirmation(id: string, pending: PendingConfirmation | null): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    task.pendingConfirmation = pending;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  clear(): void {
    this.tasks.clear();
  }
}
