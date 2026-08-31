import { nanoid } from 'nanoid';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type OpenRouterTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type CompletionRequest = {
  model: string;
  apiKey: string;
  messages: OpenRouterMessage[];
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: OpenRouterTool[];
  structuredOutput?: boolean;
  timeoutMs?: number;
};

export type CompletionResponse = {
  requestId: string;
  model: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  latencyMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type OpenRouterClientError = Error & {
  status?: number;
  isAuthError: boolean;
  isRateLimit: boolean;
  isTimeout: boolean;
  isServerError: boolean;
  requestId: string;
};

export class OpenRouterClient {
  private defaultBaseUrl: string;
  private defaultTimeoutMs: number;

  constructor(config: { baseUrl?: string; timeoutMs?: number } = {}) {
    this.defaultBaseUrl = (config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    this.defaultTimeoutMs = config.timeoutMs ?? 60000;
  }

  async createCompletion(req: CompletionRequest): Promise<CompletionResponse> {
    const requestId = nanoid();
    const startedAt = Date.now();
    const baseUrl = (req.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;

    if (!req.apiKey || req.apiKey.trim().length === 0) {
      const err = new Error(`[OpenRouter ${requestId}] Missing API key`) as OpenRouterClientError;
      err.isAuthError = true;
      err.isRateLimit = false;
      err.isTimeout = false;
      err.isServerError = false;
      err.requestId = requestId;
      throw err;
    }

    const payload: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.4
    };

    if (req.maxTokens) {
      payload.max_tokens = req.maxTokens;
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools;
    }

    if (req.structuredOutput) {
      payload.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://127.0.0.1:5173',
          'X-Title': 'FRIDAY Desktop AI'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        let errBody = '';
        try {
          errBody = await res.text();
        } catch {
          errBody = res.statusText;
        }

        const error = new Error(`OpenRouter HTTP ${res.status}: ${errBody.slice(0, 300)}`) as OpenRouterClientError;
        error.status = res.status;
        error.isAuthError = res.status === 401 || res.status === 403;
        error.isRateLimit = res.status === 429;
        error.isTimeout = res.status === 408 || res.status === 504;
        error.isServerError = res.status >= 500 && res.status !== 504;
        error.requestId = requestId;
        throw error;
      }

      const data = (await res.json()) as {
        id?: string;
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              id: string;
              function?: { name: string; arguments: string };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';

      const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || ''
      }));

      return {
        requestId,
        model: req.model,
        content,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        latencyMs,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens
            }
          : undefined
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err && typeof err === 'object' && 'isAuthError' in err) {
        throw err;
      }

      const isAborted = (err instanceof Error && err.name === 'AbortError') || String(err).includes('aborted');
      const error = new Error(
        isAborted ? `OpenRouter request timed out after ${timeoutMs}ms` : `OpenRouter network error: ${err instanceof Error ? err.message : String(err)}`
      ) as OpenRouterClientError;

      error.isTimeout = isAborted;
      error.isAuthError = false;
      error.isRateLimit = false;
      error.isServerError = false;
      error.requestId = requestId;
      throw error;
    }
  }

  async *streamCompletion(
    req: CompletionRequest
  ): AsyncGenerator<{ chunk: string; fullContent: string; done: boolean }> {
    const requestId = nanoid();
    const baseUrl = (req.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const timeoutMs = req.timeoutMs ?? this.defaultTimeoutMs;

    if (!req.apiKey || req.apiKey.trim().length === 0) {
      const err = new Error(`[OpenRouter ${requestId}] Missing API key`) as OpenRouterClientError;
      err.isAuthError = true;
      err.isRateLimit = false;
      err.isTimeout = false;
      err.isServerError = false;
      err.requestId = requestId;
      throw err;
    }

    const payload: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.4,
      stream: true
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://127.0.0.1:5173',
          'X-Title': 'FRIDAY Desktop AI'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isAborted = (err instanceof Error && err.name === 'AbortError') || String(err).includes('aborted');
      const error = new Error(
        isAborted ? `OpenRouter stream timed out after ${timeoutMs}ms` : `OpenRouter stream network error: ${err instanceof Error ? err.message : String(err)}`
      ) as OpenRouterClientError;
      error.isTimeout = isAborted;
      error.isAuthError = false;
      error.isRateLimit = false;
      error.isServerError = false;
      error.requestId = requestId;
      throw error;
    }

    if (!res.ok) {
      clearTimeout(timeoutId);
      const errText = await res.text();
      const error = new Error(`OpenRouter stream HTTP ${res.status}: ${errText.slice(0, 300)}`) as OpenRouterClientError;
      error.status = res.status;
      error.isAuthError = res.status === 401 || res.status === 403;
      error.isRateLimit = res.status === 429;
      error.isTimeout = res.status === 408 || res.status === 504;
      error.isServerError = res.status >= 500 && res.status !== 504;
      error.requestId = requestId;
      throw error;
    }

    if (!res.body) {
      clearTimeout(timeoutId);
      throw new Error('OpenRouter response body is null');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { chunk: '', fullContent: accumulatedContent, done: true };
            return;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const chunk = data.choices?.[0]?.delta?.content || '';
              if (chunk) {
                accumulatedContent += chunk;
                yield { chunk, fullContent: accumulatedContent, done: false };
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      yield { chunk: '', fullContent: accumulatedContent, done: true };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
