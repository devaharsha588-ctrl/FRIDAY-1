import { FRIDAY_KEY_ROLES, type FridayRole } from './friday-key-roles';
import type { KeyManager } from './key-manager';
import type { PublicModelProvider } from '../../shared/chat-contracts';

export type ModelMetadata = {
  id: string;
  provider: string;
  role: FridayRole;
  displayName: string;
  contextLength: number;
  free: true;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsMultimodal: boolean;
  priority: number;
  pricing: {
    input: number;
    output: number;
  };
};

export const FRIDAY_MODEL_METADATA: Record<string, ModelMetadata> = {
  'poolside/laguna-s-2.1:free': {
    id: 'poolside/laguna-s-2.1:free',
    provider: 'Poolside',
    role: 'coding',
    displayName: 'Laguna S 2.1 (Free)',
    contextLength: 131072,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 1,
    pricing: { input: 0, output: 0 }
  },
  'cohere/north-mini-code:free': {
    id: 'cohere/north-mini-code:free',
    provider: 'Cohere',
    role: 'coding',
    displayName: 'North Mini Code (Free)',
    contextLength: 65536,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 2,
    pricing: { input: 0, output: 0 }
  },
  'poolside/laguna-xs-2.1:free': {
    id: 'poolside/laguna-xs-2.1:free',
    provider: 'Poolside',
    role: 'coding',
    displayName: 'Laguna XS 2.1 (Free)',
    contextLength: 65536,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 3,
    pricing: { input: 0, output: 0 }
  },

  'nvidia/nemotron-3.5-lightning:free': {
    id: 'nvidia/nemotron-3.5-lightning:free',
    provider: 'NVIDIA',
    role: 'fast',
    displayName: 'Nemotron 3.5 Lightning (Free)',
    contextLength: 131072,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 1,
    pricing: { input: 0, output: 0 }
  },
  'liquid/lfm-2.5-2.6b:free': {
    id: 'liquid/lfm-2.5-2.6b:free',
    provider: 'Liquid',
    role: 'fast',
    displayName: 'LFM 2.5 2.6B (Free)',
    contextLength: 32768,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 2,
    pricing: { input: 0, output: 0 }
  },

  'nvidia/nemotron-3-ultra-550b-a55b:free': {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    provider: 'NVIDIA',
    role: 'complex',
    displayName: 'Nemotron 3 Ultra 550B (Free)',
    contextLength: 1048576,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 1,
    pricing: { input: 0, output: 0 }
  },

  'minimax/minimax-m3:free': {
    id: 'minimax/minimax-m3:free',
    provider: 'MiniMax',
    role: 'grammar',
    displayName: 'MiniMax M3 (Free)',
    contextLength: 262144,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: true,
    priority: 1,
    pricing: { input: 0, output: 0 }
  },
  'thinkingmachines/inkling-small:free': {
    id: 'thinkingmachines/inkling-small:free',
    provider: 'ThinkingMachines',
    role: 'grammar',
    displayName: 'Inkling Small (Free)',
    contextLength: 32768,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 2,
    pricing: { input: 0, output: 0 }
  },

  'minimax/minimax-m2.7:free': {
    id: 'minimax/minimax-m2.7:free',
    provider: 'MiniMax',
    role: 'general',
    displayName: 'MiniMax M2.7 (Free)',
    contextLength: 131072,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 1,
    pricing: { input: 0, output: 0 }
  },
  'z-ai/glm-5.2:free': {
    id: 'z-ai/glm-5.2:free',
    provider: 'Z-AI',
    role: 'general',
    displayName: 'GLM 5.2 (Free)',
    contextLength: 131072,
    free: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsMultimodal: false,
    priority: 2,
    pricing: { input: 0, output: 0 }
  }
};

export function getModelMetadata(modelId: string): ModelMetadata | undefined {
  return FRIDAY_MODEL_METADATA[modelId];
}

export function isModelFree(modelId: string): boolean {
  if (modelId.endsWith(':free')) return true;
  const meta = getModelMetadata(modelId);
  return meta ? meta.free : false;
}

export function getRoleModels(role: FridayRole): { primary: string; fallbacks: string[] } {
  const config = FRIDAY_KEY_ROLES[role];
  const fallbacks: string[] = [];
  if (config.fallback1) fallbacks.push(config.fallback1);
  if (config.fallback2) fallbacks.push(config.fallback2);
  return {
    primary: config.primary,
    fallbacks
  };
}

export function toPublicModelProvider(role: FridayRole, keyManager: KeyManager): PublicModelProvider {
  const config = FRIDAY_KEY_ROLES[role];
  const health = keyManager.getRoleHealth(role);

  return {
    taskType: role,
    configured: health.hasKey,
    model: config.primary,
    baseUrl: 'https://openrouter.ai/api/v1'
  };
}
