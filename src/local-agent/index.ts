import express from 'express';
import { z } from 'zod';
import { loadLocalEnv } from '../shared/load-local-env';
import { desktopActionSchema } from '../shared/action-schema';
import { readAgentEnv } from './config';
import { executeDesktopAction } from './executor';

loadLocalEnv();

const env = readAgentEnv();
const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (token !== env.token) {
    res.status(401).json({ error: 'Unauthorized local agent request' });
    return;
  }

  next();
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'friday-local-agent',
    capabilities: [
      'open_url',
      'new_tab',
      'open_app',
      'close_app',
      'wait',
      'file_operation'
    ],
    blockedUntilAdapter: [
      'click',
      'type_text',
      'keypress',
      'read_screen',
      'find_element',
      'switch_window'
    ]
  });
});

app.post('/actions', async (req, res, next) => {
  try {
    const action = desktopActionSchema.parse(req.body.action);
    const result = await executeDesktopAction(action, env);
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues.map((issue) => issue.message).join(', ') });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected local agent error';
  res.status(500).json({ error: message });
});

app.listen(env.port, '127.0.0.1', () => {
  if (env.token === 'dev-local-token-change-me') {
    console.warn('[FRIDAY Agent] Using default development token. Set FRIDAY_AGENT_TOKEN before real use.');
  }
  console.log(`[FRIDAY Agent] Listening on http://127.0.0.1:${env.port}`);
});
