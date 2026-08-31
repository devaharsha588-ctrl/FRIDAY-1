import type { ChatResponse, PublicModelProvider, StreamEvent } from '../../shared/chat-contracts';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import { classifyTask } from '../ai/task-classifier';
import { createOpenRouterCompletion } from '../ai/openrouter-client';
import { getProviderForTask, toPublicProvider } from '../ai/model-registry';
import { executeAgentAction, type AgentClientConfig } from '../agent/agent-client';
import { ConversationStore } from '../memory/conversation-store';
import { describeUnsupportedComputerRequest, planComputerActions } from './planner';
import { routeSimpleCommand } from './command-router';
import { executeDirectAction } from './direct-action-executor';

export type ChatInput = {
  message: string;
  conversationId?: string;
};

export type OrchestratorOptions = {
  agent: AgentClientConfig;
  store: ConversationStore;
  onEvent?: (event: StreamEvent) => void | Promise<void>;
};

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
      baseUrl: ''
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

  const taskType = classifyTask(userText);
  const provider = getProviderForTask(taskType);
  const publicProvider = toPublicProvider(provider);
  await options.onEvent?.({ type: 'classification', taskType, provider: publicProvider });

  const plannedActions = taskType === 'computer' ? planComputerActions(userText) : [];
  await options.onEvent?.({ type: 'planned_actions', actions: plannedActions });

  const actionResults: ActionResult[] = [];
  for (const action of plannedActions) {
    await options.onEvent?.({ type: 'status', message: `Running ${action.action}` });
    const result = await executeAgentAction(action, options.agent);
    actionResults.push(result);
    await options.onEvent?.({ type: 'action_result', result });
  }

  const content = await createAssistantContent({
    userText,
    taskType,
    provider: publicProvider,
    plannedActions,
    actionResults
  });

  const assistantEntry = await options.store.appendMessage(userEntry.conversationId, 'assistant', content);

  const response: ChatResponse = {
    conversationId: userEntry.conversationId,
    taskType,
    provider: publicProvider,
    message: assistantEntry.message,
    plannedActions,
    actionResults
  };

  await options.onEvent?.({ type: 'final', response });
  return response;
}

async function createAssistantContent(context: {
  userText: string;
  taskType: ReturnType<typeof classifyTask>;
  provider: PublicModelProvider;
  plannedActions: DesktopAction[];
  actionResults: ActionResult[];
}): Promise<string> {
  const { userText, taskType, provider, plannedActions, actionResults } = context;

  if (plannedActions.length > 0) {
    const successes = actionResults.filter((result) => result.status === 'success').length;
    const blocked = actionResults.filter((result) => result.status !== 'success');
    if (blocked.length === 0) {
      return `Done. I ran ${successes} structured action${successes === 1 ? '' : 's'} through the local desktop agent.`;
    }

    return [
      `I ran ${successes} action${successes === 1 ? '' : 's'} and ${blocked.length} action${blocked.length === 1 ? '' : 's'} need attention.`,
      ...blocked.map((result) => `${result.action}: ${result.summary}`)
    ].join('\n');
  }

  if (taskType === 'computer') {
    const unsupported = describeUnsupportedComputerRequest(userText);
    if (unsupported) return unsupported;
  }

  if (!provider.configured) {
    return [
      `I classified this as a ${taskType} request, but no OpenRouter key/model is configured for that category yet.`,
      'Add the matching OPENROUTER_*_API_KEY and OPENROUTER_*_MODEL values in your environment and restart the backend.'
    ].join('\n');
  }

  return createOpenRouterCompletion({
    provider: {
      ...provider,
      apiKey: process.env[`OPENROUTER_${taskType.toUpperCase()}_API_KEY`] || process.env.OPENROUTER_DEFAULT_API_KEY || process.env.OPENROUTER_API_KEY
    },
    messages: [
      {
        role: 'system',
        content: 'You are FRIDAY, a concise local desktop AI assistant. Be useful, direct, and honest about available capabilities.'
      },
      { role: 'user', content: userText }
    ]
  });
}

