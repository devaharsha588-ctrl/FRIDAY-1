import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { loadLocalEnv } from '../shared/load-local-env';
import { createModelRegistry, toPublicProvider } from './ai/model-registry';
import { readBackendEnv, isUsingDefaultAgentToken } from './config/env';
import { ConversationStore } from './memory/conversation-store';
import { TaskStore } from './memory/task-store';
import { handleChat } from './orchestrator/orchestrator';
import { startTask, cancelTask, resolveConfirmation } from './orchestrator/task-executor';
import { createActionResult, evaluateActionRisk, parseDesktopAction } from '../shared/action-schema';
import { executeAgentAction } from './agent/agent-client';
import type { StreamEvent } from '../shared/chat-contracts';

loadLocalEnv();

const env = readBackendEnv();
const store = new ConversationStore();
const taskStore = new TaskStore();
const app = express();

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

const chatRequestSchema = z.object({
  message: z.string().min(1).max(12000),
  conversationId: z.string().optional()
});

const startTaskSchema = z.object({
  goal: z.string().min(1).max(12000),
  conversationId: z.string().optional()
});

const confirmTaskSchema = z.object({
  confirmed: z.boolean()
});

const executeActionSchema = z.object({
  action: z.record(z.string(), z.unknown())
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'friday-backend',
    agentUrl: env.agentUrl,
    defaultAgentToken: isUsingDefaultAgentToken(env)
  });
});

app.get('/api/settings/models', (_req, res) => {
  const providers = Object.values(createModelRegistry()).map(toPublicProvider);
  res.json({ providers });
});

app.get('/api/conversations', async (_req, res, next) => {
  try {
    res.json({ conversations: await store.listSummaries() });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/conversations', async (_req, res, next) => {
  try {
    await store.clearAllConversations();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/conversations/:id/messages', async (req, res, next) => {
  try {
    res.json({ messages: await store.getMessages(req.params.id) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/conversations/:id', async (req, res, next) => {
  try {
    const deleted = await store.deleteConversation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ─── Phase 2: Multi-step task routes ─────────────────────────────────────────

/** Start a multi-step task and stream progress over SSE */
app.post('/api/tasks/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const sendEvent = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const body = startTaskSchema.parse(req.body);
    await startTask(
      { goal: body.goal, conversationId: body.conversationId },
      {
        agent: { agentUrl: env.agentUrl, agentToken: env.agentToken },
        taskStore,
        onEvent: sendEvent
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Task error';
    sendEvent({ type: 'error', message });
  } finally {
    res.end();
  }
});

/** Start a multi-step task without SSE (returns immediately with task id) */
app.post('/api/tasks', (req, res, next) => {
  try {
    const body = startTaskSchema.parse(req.body);
    // Create task synchronously, run it in background
    const task = taskStore.create(body.goal, body.conversationId);
    // Fire and forget — callers use GET /api/tasks/:id to poll
    startTask(
      { goal: body.goal, conversationId: body.conversationId },
      {
        agent: { agentUrl: env.agentUrl, agentToken: env.agentToken },
        taskStore,
        onEvent: () => {/* fire-and-forget; no streaming in this mode */}
      }
    ).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Task failed';
      taskStore.updateStatus(task.id, 'failed', msg);
    });
    res.status(202).json({ taskId: task.id });
  } catch (error) {
    next(error);
  }
});

/** Query task state */
app.get('/api/tasks/:id', (req, res) => {
  const task = taskStore.get(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ task });
});

/** Cancel a running task */
app.post('/api/tasks/:id/cancel', (req, res) => {
  const ok = cancelTask(req.params.id, taskStore);
  if (!ok) {
    res.status(404).json({ error: 'Task not found or already finished' });
    return;
  }
  res.json({ ok: true });
});

/** Confirm or deny a pending action in a paused task */
app.post('/api/tasks/:id/confirm', (req, res, next) => {
  try {
    const body = confirmTaskSchema.parse(req.body);
    const ok = resolveConfirmation(req.params.id, body.confirmed);
    if (!ok) {
      res.status(404).json({ error: 'No pending confirmation for this task' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/actions/execute', async (req, res, next) => {
  try {
    const body = executeActionSchema.parse(req.body);
    const parsedAction = parseDesktopAction(body.action);
    const riskEval = evaluateActionRisk(parsedAction);

    // If confirmation is required and confirmed flag is not true, block execution safely
    if (riskEval.requiresConfirmation && !parsedAction.confirmed) {
      const startedAt = new Date();
      res.json({
        result: createActionResult(
          parsedAction,
          'needs_confirmation',
          riskEval.reason || `This action requires explicit user confirmation before execution.`,
          startedAt
        )
      });
      return;
    }

    const result = await executeAgentAction(parsedAction, {
      agentUrl: env.agentUrl,
      agentToken: env.agentToken
    });
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    const body = chatRequestSchema.parse(req.body);
    const response = await handleChat(body, {
      store,
      agent: {
        agentUrl: env.agentUrl,
        agentToken: env.agentToken
      }
    });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const send = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const body = chatRequestSchema.parse(req.body);
    await handleChat(body, {
      store,
      agent: {
        agentUrl: env.agentUrl,
        agentToken: env.agentToken
      },
      onEvent: send
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected backend error';
    send({ type: 'error', message });
  } finally {
    res.end();
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues.map((issue) => issue.message).join(', ') });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected backend error';
  res.status(500).json({ error: message });
});

app.listen(env.backendPort, '127.0.0.1', () => {
  if (isUsingDefaultAgentToken(env)) {
    console.warn('[FRIDAY] Using default development agent token. Set FRIDAY_AGENT_TOKEN before real use.');
  }
  console.log(`[FRIDAY] Backend listening on http://127.0.0.1:${env.backendPort}`);
});
