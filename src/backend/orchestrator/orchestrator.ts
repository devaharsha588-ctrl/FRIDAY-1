import type { ChatResponse, PublicModelProvider, StreamEvent } from '../../shared/chat-contracts';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import { executeAgentAction, type AgentClientConfig } from '../agent/agent-client';
import { ConversationStore } from '../memory/conversation-store';
import { describeUnsupportedComputerRequest, planComputerActions } from './planner';
import { routeSimpleCommand } from './command-router';
import { executeDirectAction } from './direct-action-executor';
import { ModelRouter, classifyPromptCapability } from '../models/model-router';
import { FRIDAY_KEY_ROLES, type FridayRole } from '../models/friday-key-roles';
import { validateEnvironment } from '../config/env-validator';
import { loadLocalEnv } from '../../shared/load-local-env';

export type ChatInput = {
  message: string;
  conversationId?: string;
};

export type OrchestratorOptions = {
  agent: AgentClientConfig;
  store: ConversationStore;
  modelRouter?: ModelRouter;
  onEvent?: (event: StreamEvent) => void | Promise<void>;
};

let defaultRouter: ModelRouter | null = null;

function getModelRouter(customRouter?: ModelRouter): ModelRouter {
  if (customRouter) return customRouter;
  loadLocalEnv();
  const env = validateEnvironment();
  if (!defaultRouter) {
    defaultRouter = new ModelRouter(env);
  } else {
    defaultRouter.reload(env);
  }
  return defaultRouter;
}

export async function handleChat(input: ChatInput, options: OrchestratorOptions): Promise<ChatResponse> {
  const userText = input.message.trim();
  if (!userText) {
    throw new Error('Message is required');
  }

  await options.onEvent?.({ type: 'status', message: 'Reading request' });
  const userEntry = await options.store.appendMessage(input.conversationId, 'user', userText);

  // ── Phase 3A: Fast path for simple deterministic commands ─────────────────
  const simpleRoute = routeSimpleCommand(userText);
  if (simpleRoute.isSimple) {
    const publicProvider: PublicModelProvider = {
      taskType: 'computer',
      configured: true,
      baseUrl: '',
      free: true,
      healthy: true
    };
    await options.onEvent?.({ type: 'classification', taskType: 'computer', provider: publicProvider });
    await options.onEvent?.({ type: 'planned_actions', actions: [simpleRoute.action] });
    await options.onEvent?.({ type: 'status', message: 'Running ' + simpleRoute.action.action });

    const directExec = await executeDirectAction(simpleRoute.action, {
      agent: options.agent,
      successMessage: simpleRoute.successMessage
    });

    await options.onEvent?.({ type: 'action_result', result: directExec.result });

    const assistantEntry = await options.store.appendMessage(
      userEntry.conversationId,
      'assistant',
      directExec.message
    );

    const response: ChatResponse = {
      conversationId: userEntry.conversationId,
      taskType: 'computer',
      provider: publicProvider,
      message: assistantEntry.message,
      plannedActions: [simpleRoute.action],
      actionResults: [directExec.result]
    };

    await options.onEvent?.({ type: 'final', response });
    return response;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Check if it's a computer / desktop automation task
  const computerPattern = /\b(open|close|click|type|keypress|keyboard|mouse|window|app|application|browser|tab|file|folder|desktop|read screen|screenshot)\b/i;
  const isComputerTask = computerPattern.test(userText);

  if (isComputerTask) {
    const plannedActions = planComputerActions(userText);
    const publicProvider: PublicModelProvider = {
      taskType: 'computer',
      configured: true,
      baseUrl: '',
      free: true,
      healthy: true
    };
    await options.onEvent?.({ type: 'classification', taskType: 'computer', provider: publicProvider });
    await options.onEvent?.({ type: 'planned_actions', actions: plannedActions });

    const actionResults: ActionResult[] = [];
    for (const action of plannedActions) {
      await options.onEvent?.({ type: 'status', message: `Running ${action.action}` });
      const result = await executeAgentAction(action, options.agent);
      actionResults.push(result);
      await options.onEvent?.({ type: 'action_result', result });
    }

    let content = '';
    if (plannedActions.length > 0) {
      const successes = actionResults.filter((result) => result.status === 'success').length;
      const blocked = actionResults.filter((result) => result.status !== 'success');
      if (blocked.length === 0) {
        content = `Done. I ran ${successes} structured action${successes === 1 ? '' : 's'} through the local desktop agent.`;
      } else {
        content = [
          `I ran ${successes} action${successes === 1 ? '' : 's'} and ${blocked.length} action${blocked.length === 1 ? '' : 's'} need attention.`,
          ...blocked.map((result) => `${result.action}: ${result.summary}`)
        ].join('\n');
      }
    } else {
      const unsupported = describeUnsupportedComputerRequest(userText);
      content = unsupported || 'Desktop action not recognized or supported.';
    }

    const assistantEntry = await options.store.appendMessage(userEntry.conversationId, 'assistant', content);

    const response: ChatResponse = {
      conversationId: userEntry.conversationId,
      taskType: 'computer',
      provider: publicProvider,
      message: assistantEntry.message,
      plannedActions,
      actionResults
    };

    await options.onEvent?.({ type: 'final', response });
    return response;
  }

  // ── Phase 4: Role-Based Model Routing (All-Free Models) ─────────────────────
  const role: FridayRole = classifyPromptCapability(userText);
  const router = getModelRouter(options.modelRouter);
  const keyManager = router.getKeyManager();
  const roleConfig = FRIDAY_KEY_ROLES[role];
  const roleHealth = keyManager.getRoleHealth(role);

  const publicProvider: PublicModelProvider = {
    taskType: role,
    configured: roleHealth.hasKey,
    model: roleConfig.primary,
    baseUrl: 'https://openrouter.ai/api/v1',
    keySlot: roleHealth.keySlot,
    free: true,
    healthy: roleHealth.state === 'healthy'
  };

  await options.onEvent?.({ type: 'classification', taskType: role, provider: publicProvider });

  if (!roleHealth.hasKey) {
    const errorMsg = `I classified this request under the **${roleConfig.displayName}** role (${roleConfig.primary}), but no API key is configured for slot **${roleConfig.keySlot}** (${roleConfig.keyEnvVar}). Please set ${roleConfig.keyEnvVar} in your .env.`;
    const assistantEntry = await options.store.appendMessage(userEntry.conversationId, 'assistant', errorMsg);
    const response: ChatResponse = {
      conversationId: userEntry.conversationId,
      taskType: role,
      provider: publicProvider,
      message: assistantEntry.message,
      plannedActions: [],
      actionResults: []
    };
    await options.onEvent?.({ type: 'final', response });
    return response;
  }

  await options.onEvent?.({ type: 'status', message: `Routing to ${roleConfig.displayName} (${roleConfig.primary})` });

  let assistantContent = '';
  try {
    const result = await router.execute({
      role,
      messages: [
        {
          role: 'system',
          content: 'You are FRIDAY, a concise local desktop AI assistant. Be helpful, clear, and direct.'
        },
        {
          role: 'user',
          content: userText
        }
      ]
    });
    assistantContent = result.content;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assistantContent = `Error contacting OpenRouter: ${msg}`;
  }

  const assistantEntry = await options.store.appendMessage(userEntry.conversationId, 'assistant', assistantContent);

  const response: ChatResponse = {
    conversationId: userEntry.conversationId,
    taskType: role,
    provider: publicProvider,
    message: assistantEntry.message,
    plannedActions: [],
    actionResults: []
  };

  await options.onEvent?.({ type: 'final', response });
  return response;
}
