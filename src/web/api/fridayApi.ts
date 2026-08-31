import type { ActionResult, DesktopAction } from '../../shared/action-schema';
import type {
  ChatResponse,
  ConversationMessage,
  ConversationSummary,
  PublicModelProvider,
  StreamEvent
} from '../../shared/chat-contracts';

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const response = await fetch('/api/conversations');
  if (!response.ok) throw new Error('Failed to load conversations');
  const payload = await response.json() as { conversations: ConversationSummary[] };
  return payload.conversations;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete conversation');
}

export async function clearAllConversations(): Promise<void> {
  const response = await fetch('/api/conversations', { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to clear conversations');
}

export async function fetchMessages(conversationId: string): Promise<ConversationMessage[]> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!response.ok) throw new Error('Failed to load conversation');
  const payload = await response.json() as { messages: ConversationMessage[] };
  return payload.messages;
}

export async function fetchModelProviders(): Promise<PublicModelProvider[]> {
  const response = await fetch('/api/settings/models');
  if (!response.ok) throw new Error('Failed to load model settings');
  const payload = await response.json() as { providers: PublicModelProvider[] };
  return payload.providers;
}

export async function executeAction(action: DesktopAction): Promise<ActionResult> {
  const response = await fetch('/api/actions/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Action execution failed: ${errorBody.slice(0, 300)}`);
  }

  const payload = await response.json() as { result: ActionResult };
  return payload.result;
}

export async function streamChat(
  input: { message: string; conversationId?: string },
  onEvent: (event: StreamEvent) => void
): Promise<ChatResponse | undefined> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok || !response.body) {
    throw new Error('Failed to start FRIDAY stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResponse: ChatResponse | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const line = frame.split('\n').find((entry) => entry.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as StreamEvent;
      onEvent(event);
      if (event.type === 'final') finalResponse = event.response;
    }
  }

  return finalResponse;
}
