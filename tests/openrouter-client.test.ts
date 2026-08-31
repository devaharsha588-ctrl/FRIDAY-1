import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { OpenRouterClient } from '../src/backend/models/openrouter-client';

describe('OpenRouterClient (Phase 4)', () => {
  let fetchMock: Mock;
  let client: OpenRouterClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new OpenRouterClient({ baseUrl: 'https://openrouter.ai/api/v1', timeoutMs: 2000 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('successfully creates chat completion with correct headers and payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'gen-123',
        choices: [
          { message: { content: 'def hello_world():\n    return "Hello"' } }
        ],
        usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 }
      })
    });

    const res = await client.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: 'test-key-123',
      messages: [{ role: 'user', content: 'Write hello world in python' }]
    });

    expect(res.content).toContain('def hello_world');
    expect(res.model).toBe('poolside/laguna-s-2.1:free');
    expect(res.requestId).toBeDefined();
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-key-123'
      })
    }));
  });

  it('handles 429 rate limit error and classifies isRateLimit=true', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded'
    });

    await expect(client.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: 'test-key',
      messages: [{ role: 'user', content: 'test' }]
    })).rejects.toMatchObject({
      status: 429,
      isRateLimit: true,
      isAuthError: false
    });
  });

  it('handles 401 unauthorized error and classifies isAuthError=true', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key'
    });

    await expect(client.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: 'bad-key',
      messages: [{ role: 'user', content: 'test' }]
    })).rejects.toMatchObject({
      status: 401,
      isAuthError: true
    });
  });

  it('handles 500 server error and classifies isServerError=true', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error'
    });

    await expect(client.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'test' }]
    })).rejects.toMatchObject({
      status: 500,
      isServerError: true
    });
  });

  it('handles timeout gracefully', async () => {
    const fastClient = new OpenRouterClient({ baseUrl: 'https://openrouter.ai/api/v1', timeoutMs: 50 });
    fetchMock.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 300);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    await expect(fastClient.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'test' }]
    })).rejects.toMatchObject({
      isTimeout: true
    });
  });

  it('throws error immediately if API key is missing', async () => {
    await expect(client.createCompletion({
      model: 'poolside/laguna-s-2.1:free',
      apiKey: '',
      messages: [{ role: 'user', content: 'test' }]
    })).rejects.toMatchObject({
      isAuthError: true
    });
  });
});
