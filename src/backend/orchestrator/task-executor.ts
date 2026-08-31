import { nanoid } from 'nanoid';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import { parseDesktopAction } from '../../shared/action-schema';
import type {
  PendingConfirmation,
  StreamEvent,
  TaskObservation,
  TaskState
} from '../../shared/chat-contracts';
import type { AgentClientConfig } from '../agent/agent-client';
import { TaskStore } from '../memory/task-store';
import { runAction, type ActionRunnerOptions } from './action-runner';
import { requiresUserConfirmation } from './confirmation-policy';
import { createObservation } from './observation';
import { planComputerActions } from './planner';
import { routeSimpleCommand } from './command-router';
import { verifyAction, type VerificationContext } from './action-verifier';
import { createRecoveryState, decideRecovery, recordRecoveryAttempt, type RecoveryState } from './recovery-engine';

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_STEPS = parseInt(process.env.FRIDAY_MAX_TASK_STEPS ?? '20', 10);
const TASK_TIMEOUT_MS = parseInt(process.env.FRIDAY_TASK_TIMEOUT_MS ?? '120000', 10);

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskExecutorOptions = {
  agent: AgentClientConfig;
  taskStore: TaskStore;
  onEvent: (event: StreamEvent) => void;
  /** Override for testing */
  runAction?: (action: DesktopAction) => Promise<ActionResult>;
  /** Override verification context for testing */
  verificationContext?: Partial<VerificationContext>;
};

export type StartTaskInput = {
  goal: string;
  conversationId?: string;
};

// ─── Pending confirmation state (in-process wait) ────────────────────────────

type ConfirmationWaiter = {
  resolve: (confirmed: boolean) => void;
};

// Keyed by taskId — one active waiter per task at most
const confirmationWaiters = new Map<string, ConfirmationWaiter>();

/**
 * Called by the HTTP route when the user confirms or denies a pending action.
 * Returns false if there is no active waiter for the given task.
 */
export function resolveConfirmation(taskId: string, confirmed: boolean): boolean {
  const waiter = confirmationWaiters.get(taskId);
  if (!waiter) return false;
  confirmationWaiters.delete(taskId);
  waiter.resolve(confirmed);
  return true;
}

// ─── Main execution engine ────────────────────────────────────────────────────

/**
 * Starts a multi-step task and runs it to completion (or failure/cancellation).
 * Returns the final TaskState.
 * This function is designed to be awaited by the calling HTTP handler.
 */
export async function startTask(
  input: StartTaskInput,
  options: TaskExecutorOptions
): Promise<TaskState> {
  const { taskStore, onEvent } = options;

  // 1. Create task record
  const task = taskStore.create(input.goal, input.conversationId);
  onEvent({ type: 'task_started', task: snapshot(task) });
  onEvent({ type: 'task_planning', taskId: task.id, goal: task.goal });

  // 2. Set up timeout watchdog
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    const updated = taskStore.updateStatus(task.id, 'failed', 'Task timed out');
    if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
    // If waiting for confirmation, resolve as denied
    const waiter = confirmationWaiters.get(task.id);
    if (waiter) {
      confirmationWaiters.delete(task.id);
      waiter.resolve(false);
    }
  }, TASK_TIMEOUT_MS);

  const runnerOptions: ActionRunnerOptions = {
    agent: options.agent,
    runAction: options.runAction
  };

  try {
    await executeLoop(task.id, input.goal, taskStore, onEvent, runnerOptions, options.verificationContext, () => timedOut);
  } finally {
    clearTimeout(timeoutHandle);
  }

  return taskStore.get(task.id) ?? task;
}

// ─── Execution loop ───────────────────────────────────────────────────────────

async function executeLoop(
  taskId: string,
  goal: string,
  taskStore: TaskStore,
  onEvent: (event: StreamEvent) => void,
  runnerOptions: ActionRunnerOptions,
  customVerificationContext: Partial<VerificationContext> | undefined,
  isTimedOut: () => boolean
): Promise<void> {
  let plannedActions: DesktopAction[];

  // ── Phase 3A: Fast-path check ─────────────────────────────────────────────
  const simpleRoute = routeSimpleCommand(goal);
  if (simpleRoute.isSimple) {
    plannedActions = [simpleRoute.action];
  } else {
    // Fall back to autonomous multi-step planner
    try {
      plannedActions = planComputerActions(goal);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Planning failed';
      const updated = taskStore.updateStatus(taskId, 'failed', msg);
      if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
      return;
    }
  }

  if (plannedActions.length === 0) {
    // Nothing to execute — treat as completed with a note
    const updated = taskStore.updateStatus(taskId, 'completed');
    if (updated) onEvent({ type: 'task_completed', task: snapshot(updated) });
    return;
  }

  taskStore.updateStatus(taskId, 'running');

  const recoveryState: RecoveryState = createRecoveryState();
  const confirmedActions = new Set<string>();

  const verificationContext: VerificationContext = {
    checkProcessExists: async (processName: string) => {
      try {
        const res = await runAction(
          {
            id: nanoid(),
            action: 'find_window',
            query: processName,
            risk: 'low',
            requiresConfirmation: false
          },
          runnerOptions
        );
        const matches = (res.data as { matches?: unknown[] })?.matches;
        return Array.isArray(matches) && matches.length > 0;
      } catch {
        return false;
      }
    },
    findWindows: async (query: string) => {
      try {
        const res = await runAction(
          {
            id: nanoid(),
            action: 'find_window',
            query,
            risk: 'low',
            requiresConfirmation: false
          },
          runnerOptions
        );
        const matches = (res.data as { matches?: Array<{ title: string; processName: string }> })?.matches;
        return Array.isArray(matches) ? matches : [];
      } catch {
        return [];
      }
    },
    ...customVerificationContext
  };

  for (const action of plannedActions) {
    let actionDone = false;

    while (!actionDone) {
      if (isTimedOut()) return;

      const task = taskStore.get(taskId);
      if (!task) return;

      // Enforce step limit
      if (task.stepCount >= MAX_STEPS) {
        const updated = taskStore.updateStatus(
          taskId,
          'failed',
          'Step limit reached (' + String(MAX_STEPS) + ' steps maximum).'
        );
        if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
        return;
      }

      // Check if task was externally cancelled
      if (task.status === 'cancelled') {
        onEvent({ type: 'task_cancelled', task: snapshot(task) });
        return;
      }

      // Register the action in the task if first attempt
      if (!task.actions.some((a) => a.id === action.id)) {
        taskStore.addAction(taskId, action);
        onEvent({ type: 'action_created', taskId, action });
      }

      // ── Confirmation gate ─────────────────────────────────────────────────
      const policy = requiresUserConfirmation(action);
      if (policy.requiresConfirmation && !confirmedActions.has(action.id)) {
        const pending: PendingConfirmation = {
          actionId: action.id,
          action,
          risk: policy.risk,
          reason: policy.reason
        };
        taskStore.setPendingConfirmation(taskId, pending);
        taskStore.updateStatus(taskId, 'waiting_confirmation');
        onEvent({ type: 'confirmation_required', taskId, pending });
        const paused = taskStore.get(taskId);
        if (paused) onEvent({ type: 'task_paused', task: snapshot(paused) });

        // Wait for the user's decision (or timeout)
        const confirmed = await waitForConfirmation(taskId);

        taskStore.setPendingConfirmation(taskId, null);

        if (isTimedOut()) return;

        if (!confirmed) {
          // User denied — record cancellation result and stop
          const cancelResult: ActionResult = {
            id: action.id,
            action: action.action,
            status: 'cancelled',
            summary: 'Action cancelled by user.',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
          };
          taskStore.addResult(taskId, cancelResult);
          onEvent({ type: 'action_failed', taskId, result: cancelResult });
          const updated = taskStore.updateStatus(taskId, 'cancelled');
          if (updated) onEvent({ type: 'task_cancelled', task: snapshot(updated) });
          return;
        }

        confirmedActions.add(action.id);
        taskStore.updateStatus(taskId, 'running');
        onEvent({ type: 'task_resumed', taskId });
      }
      // ─────────────────────────────────────────────────────────────────────

      // Execute the action
      onEvent({ type: 'action_started', taskId, actionId: action.id });

      const result = await runAction(action, runnerOptions);
      taskStore.addResult(taskId, result);

      // Collect observation
      const obs: TaskObservation = createObservation(
        taskId,
        task.stepCount,
        'action_result',
        { actionId: action.id, status: result.status, summary: result.summary, data: result.data }
      );
      onEvent({ type: 'observation_created', taskId, observation: obs });

      // Action verification
      const verification = await verifyAction(action, result, verificationContext);
      const verObs = createObservation(taskId, task.stepCount, 'verification', verification);
      onEvent({ type: 'observation_created', taskId, observation: verObs });

      if (result.status === 'success' || result.status === 'completed') {
        // If the action returned screenshot data, emit a screenshot observation
        if (action.action === 'read_screen' && result.data) {
          const screenshotObs: TaskObservation = createObservation(
            taskId,
            task.stepCount,
            'screenshot',
            result.data
          );
          onEvent({ type: 'observation_created', taskId, observation: screenshotObs });
        }

        if (verification.verified) {
          onEvent({ type: 'action_completed', taskId, result });
          actionDone = true;
        } else {
          // Action succeeded technically but verification failed (e.g. app hasn't spawned process yet)
          const recovery = decideRecovery(action, result, recoveryState);
          if (recovery.shouldRetry) {
            recordRecoveryAttempt(recoveryState, action.id);
            const recObs = createObservation(taskId, task.stepCount, 'recovery', recovery);
            onEvent({ type: 'observation_created', taskId, observation: recObs });
            if (recovery.waitMs > 0) {
              await delay(recovery.waitMs);
            }
            for (const pre of recovery.preActions) {
              await runAction(pre, runnerOptions);
            }
          } else {
            onEvent({ type: 'action_failed', taskId, result });
            const updated = taskStore.updateStatus(taskId, 'failed', verification.observation);
            if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
            return;
          }
        }
      } else if (result.status === 'failed') {
        const recovery = decideRecovery(action, result, recoveryState);
        if (recovery.shouldRetry) {
          recordRecoveryAttempt(recoveryState, action.id);
          const recObs = createObservation(taskId, task.stepCount, 'recovery', recovery);
          onEvent({ type: 'observation_created', taskId, observation: recObs });
          if (recovery.waitMs > 0) {
            await delay(recovery.waitMs);
          }
          for (const pre of recovery.preActions) {
            await runAction(pre, runnerOptions);
          }
        } else {
          onEvent({ type: 'action_failed', taskId, result });
          const updated = taskStore.updateStatus(
            taskId,
            'failed',
            result.summary
          );
          if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
          return;
        }
      } else {
        // blocked, unsupported, needs_confirmation or other status — treat as terminal failure
        onEvent({ type: 'action_failed', taskId, result });
        const updated = taskStore.updateStatus(taskId, 'failed', result.summary);
        if (updated) onEvent({ type: 'task_failed', task: snapshot(updated) });
        return;
      }

      if (isTimedOut()) return;
    }
  }

  // All planned actions completed
  const updated = taskStore.updateStatus(taskId, 'completed');
  if (updated) onEvent({ type: 'task_completed', task: snapshot(updated) });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Confirmation waiting ─────────────────────────────────────────────────────

function waitForConfirmation(taskId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmationWaiters.set(taskId, { resolve });
  });
}

// ─── Cancellation (called from HTTP route) ───────────────────────────────────

export function cancelTask(taskId: string, taskStore: TaskStore): boolean {
  const task = taskStore.get(taskId);
  if (!task) return false;
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return false;
  }
  taskStore.updateStatus(taskId, 'cancelled');
  // If waiting for confirmation, resolve as denied
  const waiter = confirmationWaiters.get(taskId);
  if (waiter) {
    confirmationWaiters.delete(taskId);
    waiter.resolve(false);
  }
  return true;
}

// ─── Snapshot helper ──────────────────────────────────────────────────────────

function snapshot(task: TaskState): TaskState {
  return {
    ...task,
    actions: [...task.actions],
    results: [...task.results]
  };
}

export { parseDesktopAction, nanoid };
