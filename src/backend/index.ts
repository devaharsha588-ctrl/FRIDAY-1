import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { loadLocalEnv } from '../shared/load-local-env';
import { readBackendEnv, isUsingDefaultAgentToken } from './config/env';
import { ConversationStore } from './memory/conversation-store';
import { TaskStore } from './memory/task-store';
import { handleChat } from './orchestrator/orchestrator';
import { startTask, cancelTask, resolveConfirmation } from './orchestrator/task-executor';
import { createActionResult, evaluateActionRisk, parseDesktopAction } from '../shared/action-schema';
import { executeAgentAction } from './agent/agent-client';
import type { PublicModelProvider, StreamEvent } from '../shared/chat-contracts';
import { ModelRouter } from './models/model-router';
import { isFridayRole, type FridayRole } from './models/friday-key-roles';
import { toPublicModelProvider } from './models/model-registry';
import {
  createServiceClient,
  isSupabaseConfigured,
  checkSupabaseHealth
} from './database/supabase';
import { MemoryRepository } from './database/repositories/memory-repository';
import { PreferencesRepository } from './database/repositories/preferences-repository';

loadLocalEnv();

const env = readBackendEnv();

// Initialize Supabase if configured
const supabaseClient = isSupabaseConfigured(env) ? createServiceClient(env) : undefined;

const store = new ConversationStore(undefined, supabaseClient);
const taskStore = new TaskStore(supabaseClient);
const memoryRepo = supabaseClient ? new MemoryRepository(supabaseClient) : null;
const prefsRepo = supabaseClient ? new PreferencesRepository(supabaseClient) : null;

const modelRouter = new ModelRouter(env);
const keyManager = modelRouter.getKeyManager();
const app = express();

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

app.use((_req, _res, next) => {
  loadLocalEnv();
  const refreshedEnv = readBackendEnv();
  modelRouter.reload(refreshedEnv);
  next();
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(20000),
  conversationId: z.string().optional()
});

const startTaskSchema = z.object({
  goal: z.string().min(1).max(20000),
  conversationId: z.string().optional()
});

const confirmTaskSchema = z.object({
  confirmed: z.boolean()
});

const executeActionSchema = z.object({
  action: z.record(z.string(), z.unknown())
});

// Cache Supabase health to avoid polling on every request
let supabaseHealthCache: { status: 'healthy' | 'unavailable' | 'disabled'; checkedAt: number } = {
  status: 'disabled',
  checkedAt: 0
};
const HEALTH_CACHE_TTL_MS = 30_000;

app.get('/api/health', async (_req, res) => {
  // Refresh Supabase health check at most every 30s
  const now = Date.now();
  if (now - supabaseHealthCache.checkedAt > HEALTH_CACHE_TTL_MS) {
    supabaseHealthCache = {
      status: await checkSupabaseHealth(env),
      checkedAt: now
    };
  }

  res.json({
    ok: true,
    service: 'friday-backend',
    supabase: supabaseHealthCache.status,
    openrouter: Object.values(keyManager.getAllRoleStatuses()).some((r) => r.available) ? 'healthy' : 'unconfigured',
    localAgent: env.agentUrl,
    defaultAgentToken: isUsingDefaultAgentToken(env)
  });
});

// ─── Memories ──────────────────────────────────────────────────────────────────

const createMemorySchema = z.object({
  content: z.string().min(1).max(5000),
  category: z.string().max(100).optional(),
  importance: z.number().int().min(0).max(100).optional()
});

app.get('/api/memories', async (req, res, next) => {
  if (!memoryRepo) {
    res.status(503).json({ error: 'Supabase is not configured. Memories require a Supabase connection.' });
    return;
  }
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const memories = await memoryRepo.list(category, 50);
    res.json({ memories });
  } catch (error) {
    next(error);
  }
});

app.post('/api/memories', async (req, res, next) => {
  if (!memoryRepo) {
    res.status(503).json({ error: 'Supabase is not configured. Memories require a Supabase connection.' });
    return;
  }
  try {
    const body = createMemorySchema.parse(req.body);
    const memory = await memoryRepo.create(body.content, body.category, body.importance);
    res.status(201).json({ memory });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/memories/:id', async (req, res, next) => {
  if (!memoryRepo) {
    res.status(503).json({ error: 'Supabase is not configured. Memories require a Supabase connection.' });
    return;
  }
  try {
    const deleted = await memoryRepo.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ─── Preferences ───────────────────────────────────────────────────────────────

const setPreferenceSchema = z.object({
  value: z.unknown()
});

app.get('/api/preferences', async (_req, res, next) => {
  if (!prefsRepo) {
    res.status(503).json({ error: 'Supabase is not configured. Preferences require a Supabase connection.' });
    return;
  }
  try {
    const preferences = await prefsRepo.getAll();
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

app.put('/api/preferences/:key', async (req, res, next) => {
  if (!prefsRepo) {
    res.status(503).json({ error: 'Supabase is not configured. Preferences require a Supabase connection.' });
    return;
  }
  try {
    const body = setPreferenceSchema.parse(req.body);
    const pref = await prefsRepo.set(req.params.key, body.value);
    res.json({ preference: pref });
  } catch (error) {
    next(error);
  }
});



app.get('/api/models/status', (_req, res) => {
  const roles = keyManager.getAllRoleStatuses();
  res.json({ roles });
});

app.post('/api/models/test', async (req, res) => {
  try {
    const role = req.body?.role;
    if (!role || !isFridayRole(role)) {
      res.status(400).json({ error: 'Invalid or missing role' });
      return;
    }

    const result = await modelRouter.execute({
      role,
      messages: [{ role: 'user', content: 'Respond with OK.' }],
      timeoutMs: 15000
    });

    res.json({
      available: true,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackUsed: result.fallbackUsed
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Model test failed';
    res.status(502).json({
      available: false,
      error: msg
    });
  }
});

app.get('/api/settings/models', (_req, res) => {
  const roleKeys: FridayRole[] = ['general', 'coding', 'fast', 'complex', 'grammar'];
  const providers: PublicModelProvider[] = roleKeys.map((r) => toPublicModelProvider(r, keyManager));
  providers.push({
    taskType: 'computer',
    configured: true,
    model: 'Local Windows Agent',
    baseUrl: env.agentUrl,
    free: true,
    healthy: true
  });
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
    const task = taskStore.create(body.goal, body.conversationId);
    startTask(
      { goal: body.goal, conversationId: body.conversationId },
      {
        agent: { agentUrl: env.agentUrl, agentToken: env.agentToken },
        taskStore,
        onEvent: () => {}
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
      modelRouter,
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
      modelRouter,
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
