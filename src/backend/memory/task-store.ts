import { nanoid } from 'nanoid';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import type { PendingConfirmation, TaskState, TaskStatus } from '../../shared/chat-contracts';

const DEFAULT_MAX_STEPS = parseInt(process.env.FRIDAY_MAX_TASK_STEPS ?? '20', 10);

export class TaskStore {
  private tasks = new Map<string, TaskState>();

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
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      task.completedAt = task.updatedAt;
    }
    return task;
  }

  addAction(id: string, action: DesktopAction): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    task.actions.push(action);
    task.stepCount += 1;
    task.updatedAt = new Date().toISOString();
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
