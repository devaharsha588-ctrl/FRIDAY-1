import { KeyManager } from './key-manager';
import { OpenRouterClient, type OpenRouterMessage, type OpenRouterTool, type CompletionResponse } from './openrouter-client';
import { ModelDiscovery } from './model-discovery';
import { getRoleModels, isModelFree } from './model-registry';
import { FRIDAY_KEY_ROLES, type FridayRole } from './friday-key-roles';
import type { ValidatedBackendEnv } from '../config/env-validator';

export type RouterExecuteOptions = {
  role: FridayRole;
  messages: OpenRouterMessage[];
  requirements?: {
    tools?: OpenRouterTool[];
    structuredOutput?: boolean;
    maxTokens?: number;
    temperature?: number;
  };
  timeoutMs?: number;
};

export type RouterExecuteResult = {
  content: string;
  role: FridayRole;
  model: string;
  keySlot: string;
  fallbackUsed: boolean;
  latencyMs: number;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export class ModelRouter {
  private keyManager: KeyManager;
  private client: OpenRouterClient;
  private discovery: ModelDiscovery;
  private env: ValidatedBackendEnv;

  constructor(
    env: ValidatedBackendEnv,
    keyManager?: KeyManager,
    client?: OpenRouterClient,
    discovery?: ModelDiscovery
  ) {
    this.env = env;
    this.keyManager = keyManager || new KeyManager(env);
    this.client = client || new OpenRouterClient({ baseUrl: env.openRouterBaseUrl });
    this.discovery = discovery || new ModelDiscovery({ baseUrl: env.openRouterBaseUrl, cacheTtlMs: env.modelCacheTtlMs });
  }

  getKeyManager(): KeyManager {
    return this.keyManager;
  }

  getDiscovery(): ModelDiscovery {
    return this.discovery;
  }

  async execute(options: RouterExecuteOptions): Promise<RouterExecuteResult> {
    const { role, messages, requirements, timeoutMs } = options;
    const roleModels = getRoleModels(role);
    const candidateModels = [roleModels.primary, ...roleModels.fallbacks];

    const slot = this.keyManager.getKeySlotForRole(role);
    const apiKey = this.keyManager.getKeyForRole(role);

    if (!apiKey) {
      throw new Error(`[ModelRouter] No OpenRouter API key configured for role "${role}" (${FRIDAY_KEY_ROLES[role].keyEnvVar}). Please provide an API key.`);
    }

    const errors: Array<{ model: string; error: string }> = [];

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      const isFallback = i > 0;

      // ── Hard Guardrail: Paid Model Lockout ──────────────────────────────────
      if (!isModelFree(model) && !this.env.allowPaidModels) {
        throw new Error(`[ModelRouter Security Lockout] Model "${model}" is not a free model and FRIDAY_ALLOW_PAID_MODELS is false. Paid models are locked out.`);
      }

      // Check key health for this model
      const health = this.keyManager.getRoleHealth(role, model);
      if (health.state === 'invalid') {
        throw new Error(`[ModelRouter] OpenRouter key for slot "${slot}" is invalid (HTTP 401/403). Please check your credentials.`);
      }

      try {
        const response: CompletionResponse = await this.client.createCompletion({
          model,
          apiKey,
          messages,
          baseUrl: this.env.openRouterBaseUrl,
          temperature: requirements?.temperature,
          maxTokens: requirements?.maxTokens,
          tools: requirements?.tools,
          structuredOutput: requirements?.structuredOutput,
          timeoutMs
        });

        // Record successful usage
        this.keyManager.recordUsage(slot, model);
        this.keyManager.recordSuccess(slot, role);

        return {
          content: response.content,
          role,
          model,
          keySlot: slot,
          fallbackUsed: isFallback,
          latencyMs: response.latencyMs,
          toolCalls: response.toolCalls,
          usage: response.usage
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ model, error: errMsg });

        const isAuthError = (err && typeof err === 'object' && 'isAuthError' in err && (err as { isAuthError: boolean }).isAuthError) || errMsg.includes('401') || errMsg.includes('403');
        const isRateLimit = (err && typeof err === 'object' && 'isRateLimit' in err && (err as { isRateLimit: boolean }).isRateLimit) || errMsg.includes('429');

        if (isAuthError) {
          this.keyManager.recordAuthFailure(slot, errMsg);
          throw new Error(`[ModelRouter] Authentication failed for key slot "${slot}": ${errMsg}`);
        } else if (isRateLimit) {
          this.keyManager.recordRateLimit(slot, this.env.modelFailureCooldownMs, errMsg);
        } else {
          this.keyManager.recordGenericFailure(slot, errMsg);
        }

        // Continue loop to try next fallback for the SAME role
      }
    }

    const failureSummary = errors.map((e) => `${e.model}: ${e.error}`).join('; ');
    throw new Error(`[ModelRouter] All free models for role "${role}" failed (${failureSummary}). FRIDAY will not automatically switch to paid models.`);
  }

  async *executeStream(
    options: RouterExecuteOptions
  ): AsyncGenerator<{ chunk: string; fullContent: string; done: boolean; model: string }> {
    const { role, messages, requirements, timeoutMs } = options;
    const roleModels = getRoleModels(role);
    const candidateModels = [roleModels.primary, ...roleModels.fallbacks];

    const slot = this.keyManager.getKeySlotForRole(role);
    const apiKey = this.keyManager.getKeyForRole(role);

    if (!apiKey) {
      throw new Error(`[ModelRouter] No OpenRouter API key configured for role "${role}" (${FRIDAY_KEY_ROLES[role].keyEnvVar}).`);
    }

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];

      if (!isModelFree(model) && !this.env.allowPaidModels) {
        throw new Error(`[ModelRouter Security Lockout] Model "${model}" is not a free model.`);
      }

      try {
        const stream = this.client.streamCompletion({
          model,
          apiKey,
          messages,
          baseUrl: this.env.openRouterBaseUrl,
          temperature: requirements?.temperature,
          maxTokens: requirements?.maxTokens,
          tools: requirements?.tools,
          structuredOutput: requirements?.structuredOutput,
          timeoutMs
        });

        for await (const chunk of stream) {
          yield { ...chunk, model };
        }

        this.keyManager.recordUsage(slot, model);
        this.keyManager.recordSuccess(slot, role);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('401') || errMsg.includes('403')) {
          this.keyManager.recordAuthFailure(slot, errMsg);
          throw err;
        }
        this.keyManager.recordGenericFailure(slot, errMsg);
      }
    }

    throw new Error(`[ModelRouter] All stream attempts for role "${role}" failed.`);
  }
}

/**
 * Deterministic capability classifier for Phase 4 requests.
 * Maps user queries to the appropriate specialized free role without unnecessary LLM hops.
 */
export function classifyPromptCapability(input: string): FridayRole {
  const text = input.trim();
  const lower = text.toLowerCase();

  // 1. Coding specialist (Laguna S 2.1)
  const codeSignals = [
    'code', 'bug', 'debug', 'typescript', 'javascript', 'python', 'react', 'node', 'html', 'css',
    'function', 'algorithm', 'refactor', 'git', 'compile', 'build', 'syntax error', 'sql', 'query',
    'api endpoint', 'regex', 'rust', 'c++', 'java', 'go'
  ];
  if (
    codeSignals.some((sig) => {
      const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(lower) || lower.includes(sig);
    })
  ) {
    return 'coding';
  }

  // 2. Grammar & text refinement (MiniMax M3)
  const grammarSignals = [
    'grammar', 'correct the grammar', 'correct this sentence', 'proofread', 'fix spelling',
    'rewrite professionally', 'paraphrase', 'improve writing', 'tone check', 'spelling'
  ];
  if (grammarSignals.some((sig) => lower.includes(sig))) {
    return 'grammar';
  }

  // 3. Complex reasoning & deep analysis (Nemotron 3 Ultra 550B)
  const complexSignals = [
    'explain deeply', 'deep analysis', 'step by step proof', 'architect', 'system design',
    'compare and contrast in detail', 'mathematical proof', 'solve this logic puzzle',
    'strategic roadmap', 'complex analysis'
  ];
  if (complexSignals.some((sig) => lower.includes(sig))) {
    return 'complex';
  }

  // 4. Fast & lightweight (Nemotron 3.5 Lightning)
  const fastSignals = [
    'quick answer', 'short answer', 'fast answer', 'in one word', 'yes or no', 'briefly answer', 'tldr',
    'quick question', 'quick reply', 'what is', 'how much is', 'define'
  ];
  if (fastSignals.some((sig) => lower.includes(sig))) {
    return 'fast';
  }

  // 5. General assistant (MiniMax M2.7)
  return 'general';
}
