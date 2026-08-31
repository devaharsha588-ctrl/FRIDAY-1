import { taskTypes, type TaskType } from '../../shared/task-types';
import type { PublicModelProvider } from '../../shared/chat-contracts';

export type ModelProvider = PublicModelProvider & {
  apiKey?: string;
};

function envKey(taskType: TaskType, suffix: 'API_KEY' | 'MODEL'): string {
  return `OPENROUTER_${taskType.toUpperCase()}_${suffix}`;
}

export function createModelRegistry(env: NodeJS.ProcessEnv = process.env): Record<TaskType, ModelProvider> {
  const baseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const defaultApiKey = env.OPENROUTER_DEFAULT_API_KEY || env.OPENROUTER_API_KEY;
  const defaultModel = env.OPENROUTER_DEFAULT_MODEL || env.OPENROUTER_MODEL;

  return taskTypes.reduce((registry, taskType) => {
    const apiKey = env[envKey(taskType, 'API_KEY')] || defaultApiKey;
    const model = env[envKey(taskType, 'MODEL')] || defaultModel;

    registry[taskType] = {
      taskType,
      configured: Boolean(apiKey && model),
      apiKey,
      model,
      baseUrl
    };

    return registry;
  }, {} as Record<TaskType, ModelProvider>);
}

export function getProviderForTask(taskType: TaskType, env: NodeJS.ProcessEnv = process.env): ModelProvider {
  return createModelRegistry(env)[taskType];
}

export function toPublicProvider(provider: ModelProvider): PublicModelProvider {
  return {
    taskType: provider.taskType,
    configured: provider.configured,
    model: provider.model,
    baseUrl: provider.baseUrl
  };
}

