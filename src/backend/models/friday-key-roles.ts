export type FridayRole = 'coding' | 'fast' | 'complex' | 'grammar' | 'general';

export type KeySlot = 'key_1' | 'key_2' | 'key_3' | 'key_4' | 'key_5';

export type RoleConfig = {
  keyEnvVar: string;
  keySlot: KeySlot;
  primary: string;
  fallback1?: string;
  fallback2?: string;
  free: true;
  displayName: string;
  functionalRole: string;
};

export const FRIDAY_KEY_ROLES: Record<FridayRole, RoleConfig> = {
  coding: {
    keyEnvVar: 'OPENROUTER_KEY_1',
    keySlot: 'key_1',
    primary: 'poolside/laguna-s-2.1:free',
    fallback1: 'cohere/north-mini-code:free',
    fallback2: 'poolside/laguna-xs-2.1:free',
    free: true,
    displayName: 'Coding Specialist',
    functionalRole: "Agentic coding specialist (plays Claude's role)"
  },

  fast: {
    keyEnvVar: 'OPENROUTER_KEY_2',
    keySlot: 'key_2',
    primary: 'nvidia/nemotron-3.5-lightning:free',
    fallback1: 'liquid/lfm-2.5-2.6b:free',
    free: true,
    displayName: 'Fast & Lightweight',
    functionalRole: "Low-latency, lightweight answers (plays Grok's role)"
  },

  complex: {
    keyEnvVar: 'OPENROUTER_KEY_3',
    keySlot: 'key_3',
    primary: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    fallback1: 'minimax/minimax-m3:free',
    free: true,
    displayName: 'Complex Reasoning',
    functionalRole: "Deep reasoning, large context (plays GPT's role)"
  },

  grammar: {
    keyEnvVar: 'OPENROUTER_KEY_4',
    keySlot: 'key_4',
    primary: 'minimax/minimax-m3:free',
    fallback1: 'thinkingmachines/inkling-small:free',
    free: true,
    displayName: 'Grammar & Text Refinement',
    functionalRole: "Multimodal and text quality (plays Gemini's role)"
  },

  general: {
    keyEnvVar: 'OPENROUTER_KEY_5',
    keySlot: 'key_5',
    primary: 'minimax/minimax-m2.7:free',
    fallback1: 'z-ai/glm-5.2:free',
    free: true,
    displayName: 'General Assistant',
    functionalRole: 'Conversation, summarization, documents'
  }
} as const;

export const FRIDAY_ROLES = Object.keys(FRIDAY_KEY_ROLES) as FridayRole[];

export function isFridayRole(value: string): value is FridayRole {
  return value in FRIDAY_KEY_ROLES;
}
