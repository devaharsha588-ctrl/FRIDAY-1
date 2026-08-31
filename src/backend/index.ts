import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { loadLocalEnv } from '../shared/load-local-env';
import { createModelRegistry, toPublicProvider } from './ai/model-registry';
import { readBackendEnv, isUsingDefaultAgentToken } from './config/env';
import { ConversationStore } from './memory/conversation-store';
import { handleChat } from './orchestrator/orchestrator';
import { createActionResult, evaluateActionRisk, parseDesktopAction } from '../shared/action-schema';
import { executeAgentAction } from './agent/agent-client';
import type { StreamEvent } from '../shared/chat-contracts';

loadLocalEnv();

const env = readBackendEnv();
const store = new ConversationStore();
const app = express();

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

const chatRequestSchema = z.object({
  message: z.string().min(1).max(12000),
  conversationId: z.string().optional()
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
