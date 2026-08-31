import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { ModelDiscovery } from '../src/backend/models/model-discovery';

describe('ModelDiscovery (Phase 4)', () => {
  let fetchMock: Mock;
  let discovery: ModelDiscovery;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    discovery = new ModelDiscovery({ baseUrl: 'https://openrouter.ai/api/v1', cacheTtlMs: 5000 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('verifies exact free model existence and $0 pricing from OpenRouter catalog', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'poolside/laguna-s-2.1:free',
            name: 'Laguna S 2.1',
            context_length: 131072,
            pricing: { prompt: '0', completion: '0' }
          },
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            context_length: 128000,
            pricing: { prompt: '0.000005', completion: '0.000015' }
          }
        ]
      })
    });

    const result = await discovery.verifyModel('poolside/laguna-s-2.1:free');
    expect(result.existsInCatalog).toBe(true);
    expect(result.isFree).toBe(true);
    expect(result.contextLength).toBe(131072);
    expect(result.pricing.prompt).toBe(0);
    expect(result.pricing.completion).toBe(0);

    // Verify paid model is correctly identified as not free
    const paidResult = await discovery.verifyModel('openai/gpt-4o');
    expect(paidResult.existsInCatalog).toBe(true);
    expect(paidResult.isFree).toBe(false);
  });

  it('caches catalog responses and reuses cache within TTL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'minimax/minimax-m3:free', pricing: { prompt: 0, completion: 0 } }
        ]
      })
    });

    await discovery.fetchCatalog();
    await discovery.fetchCatalog();
    await discovery.fetchCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports existsInCatalog=false when model is missing from catalog', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'other/model:free', pricing: { prompt: 0, completion: 0 } }]
      })
    });

    const result = await discovery.verifyModel('nonexistent/fake-model:free');
    expect(result.existsInCatalog).toBe(false);
    expect(result.isFree).toBe(false);
  });
});
