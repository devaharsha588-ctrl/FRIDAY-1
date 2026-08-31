import { useEffect, useMemo, useState } from 'react';
import { Monitor, Settings2 } from 'lucide-react';
import type { ActionResult, DesktopAction } from '../shared/action-schema';
import type {
  ConversationMessage,
  ConversationSummary,
  PublicModelProvider,
  StreamEvent
} from '../shared/chat-contracts';
import type { TaskType } from '../shared/task-types';
import { ActionTimeline } from './components/ActionTimeline';
import { ChatComposer } from './components/ChatComposer';
import { ConversationRail } from './components/ConversationRail';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusStrip } from './components/StatusStrip';
import { fetchConversations, fetchMessages, fetchModelProviders, streamChat } from './api/fridayApi';

export function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [providers, setProviders] = useState<PublicModelProvider[]>([]);
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [activeProvider, setActiveProvider] = useState<PublicModelProvider | undefined>();
  const [plannedActions, setPlannedActions] = useState<DesktopAction[]>([]);
  const [actionResults, setActionResults] = useState<ActionResult[]>([]);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshConversations();
    void fetchModelProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  const visibleMessages = useMemo(() => messages.filter((message) => message.role !== 'system'), [messages]);

  async function refreshConversations() {
    const loaded = await fetchConversations().catch(() => []);
    setConversations(loaded);
  }

  async function selectConversation(id: string) {
    setConversationId(id);
    setMessages(await fetchMessages(id));
    setPlannedActions([]);
    setActionResults([]);
    setStatus('Ready');
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setPlannedActions([]);
    setActionResults([]);
    setStatus('Ready');
  }

  async function sendMessage(content: string) {
    const optimistic: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, optimistic]);
    setBusy(true);
    setStatus('Thinking');
    setPlannedActions([]);
    setActionResults([]);

    try {
      const response = await streamChat({ message: content, conversationId }, handleStreamEvent);
      if (response) {
        setConversationId(response.conversationId);
        setMessages((current) => [...current, response.message]);
        await refreshConversations();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FRIDAY stream failed';
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: message,
          createdAt: new Date().toISOString()
        }
      ]);
      setStatus('Needs attention');
    } finally {
      setBusy(false);
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === 'status') {
      setStatus(event.message);
      return;
    }

    if (event.type === 'classification') {
      setTaskType(event.taskType);
      setActiveProvider(event.provider);
      setStatus('Routed');
      return;
    }

    if (event.type === 'planned_actions') {
      setPlannedActions(event.actions);
      return;
    }

    if (event.type === 'action_result') {
      setActionResults((current) => [...current.filter((result) => result.id !== event.result.id), event.result]);
      setStatus(event.result.status === 'success' ? 'Action complete' : 'Action needs attention');
      return;
    }

    if (event.type === 'error') {
      setStatus('Needs attention');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: event.message,
          createdAt: new Date().toISOString()
        }
      ]);
      return;
    }

    if (event.type === 'final') {
      setTaskType(event.response.taskType);
      setActiveProvider(event.response.provider);
      setPlannedActions(event.response.plannedActions);
      setActionResults(event.response.actionResults);
      setStatus('Ready');
    }
  }

  return (
    <div className="app-shell">
      <ConversationRail
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNew={startNewConversation}
      />
      <main className="main-workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Local desktop assistant</span>
            <h1>A computer you can talk to.</h1>
          </div>
          <button className="topbar-action" type="button">
            <Settings2 size={18} aria-hidden="true" />
            <span>Settings</span>
          </button>
        </header>
        <StatusStrip taskType={taskType} provider={activeProvider} status={status} />
        <section className="chat-surface" aria-label="Conversation">
          {visibleMessages.length === 0 ? (
            <div className="empty-chat">
              <Monitor size={28} aria-hidden="true" />
              <h2>What should FRIDAY do?</h2>
              <p>Try "open https://example.com", "open Notepad", or "list files in ."</p>
            </div>
          ) : (
            <div className="message-list">
              {visibleMessages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span>{message.role === 'user' ? 'You' : 'FRIDAY'}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          )}
        </section>
        <ChatComposer disabled={busy} onSubmit={sendMessage} />
      </main>
      <div className="right-column">
        <ActionTimeline plannedActions={plannedActions} results={actionResults} />
        <SettingsPanel providers={providers} />
      </div>
    </div>
  );
}

