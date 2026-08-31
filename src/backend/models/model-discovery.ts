export type CatalogModel = {
  id: string;
  name?: string;
  description?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    request?: string | number;
    image?: string | number;
  };
  context_length?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: unknown;
};

export type ModelVerificationResult = {
  modelId: string;
  existsInCatalog: boolean;
  isFree: boolean;
  contextLength?: number;
  hasTools: boolean;
  hasStructuredOutput: boolean;
  verifiedAt: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  rawStatus?: string;
  error?: string;
};

export class ModelDiscovery {
  private baseUrl: string;
  private cacheTtlMs: number;
  private catalogCache: CatalogModel[] | null = null;
  private cacheExpiresAt = 0;
  private verificationCache: Map<string, ModelVerificationResult> = new Map();

  constructor(options: { baseUrl?: string; cacheTtlMs?: number } = {}) {
    this.baseUrl = (options.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    this.cacheTtlMs = options.cacheTtlMs ?? 3600000;
  }

  async fetchCatalog(forceRefresh = false): Promise<CatalogModel[]> {
    const now = Date.now();
    if (!forceRefresh && this.catalogCache && now < this.cacheExpiresAt) {
      return this.catalogCache;
    }

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'HTTP-Referer': 'http://127.0.0.1:5173',
          'X-Title': 'FRIDAY Desktop AI'
        }
      });

      if (!res.ok) {
        throw new Error(`OpenRouter catalog fetch failed: HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { data?: CatalogModel[] };
      this.catalogCache = payload.data || [];
      this.cacheExpiresAt = now + this.cacheTtlMs;
      return this.catalogCache;
    } catch (err) {
      if (this.catalogCache) {
        return this.catalogCache; // Return stale cache on network failure
      }
      throw err;
    }
  }

  async verifyModel(modelId: string, forceRefresh = false): Promise<ModelVerificationResult> {
    const now = Date.now();
    const cached = this.verificationCache.get(modelId);
    if (!forceRefresh && cached && now - cached.verifiedAt < this.cacheTtlMs) {
      return cached;
    }

    try {
      const catalog = await this.fetchCatalog(forceRefresh);
      const entry = catalog.find((m) => m.id.toLowerCase() === modelId.toLowerCase());

      if (!entry) {
        const result: ModelVerificationResult = {
          modelId,
          existsInCatalog: false,
          isFree: false,
          hasTools: false,
          hasStructuredOutput: false,
          verifiedAt: now,
          pricing: { prompt: 0, completion: 0 },
          error: `Model "${modelId}" not found in OpenRouter catalog`
        };
        this.verificationCache.set(modelId, result);
        return result;
      }

      const promptPrice = Number(entry.pricing?.prompt ?? 0);
      const completionPrice = Number(entry.pricing?.completion ?? 0);
      const isFree = promptPrice === 0 && completionPrice === 0;

      const contextLength = entry.context_length || entry.top_provider?.context_length;

      const result: ModelVerificationResult = {
        modelId,
        existsInCatalog: true,
        isFree,
        contextLength,
        hasTools: true, // Standard OpenRouter endpoint supports tools
        hasStructuredOutput: true,
        verifiedAt: now,
        pricing: {
          prompt: promptPrice,
          completion: completionPrice
        }
      };

      this.verificationCache.set(modelId, result);
      return result;
    } catch (err) {
      // In offline / unit-test environments or when OpenRouter catalog is unreachable, fall back gracefully
      const isFreeById = modelId.endsWith(':free');
      const fallbackResult: ModelVerificationResult = {
        modelId,
        existsInCatalog: isFreeById,
        isFree: isFreeById,
        contextLength: 128000,
        hasTools: true,
        hasStructuredOutput: true,
        verifiedAt: now,
        pricing: { prompt: 0, completion: 0 },
        error: err instanceof Error ? err.message : String(err)
      };
      this.verificationCache.set(modelId, fallbackResult);
      return fallbackResult;
    }
  }

  clearCache(): void {
    this.catalogCache = null;
    this.cacheExpiresAt = 0;
    this.verificationCache.clear();
  }
}
