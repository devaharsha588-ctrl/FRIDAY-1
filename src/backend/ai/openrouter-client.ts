import type { ModelProvider } from './model-registry';

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CompletionOptions = {
  provider: ModelProvider;
  messages: OpenRouterMessage[];
  temperature?: number;
};

export async function createOpenRouterCompletion(options: CompletionOptions): Promise<string> {
  const { provider, messages, temperature = 0.4 } = options;

  if (!provider.apiKey || !provider.model) {
    throw new Error(`OpenRouter provider for ${provider.taskType} is not configured`);
  }

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://127.0.0.1:5173',
      'X-Title': 'FRIDAY'
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter response did not contain assistant content');
  }

  return content;
}

