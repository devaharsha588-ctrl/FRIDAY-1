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
import {
  clearAllConversations,
  deleteConversation,
  executeAction,
  fetchConversations,
  fetchMessages,
  fetchModelProviders,
  streamChat
} from './api/fridayApi';

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

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversation(id);
      if (conversationId === id) {
        startNewConversation();
      }
      await refreshConversations();
    } catch {
      setStatus('Failed to delete conversation');
    }
  }

  async function handleClearAllConversations() {
    try {
      await clearAllConversations();
      startNewConversation();
      await refreshConversations();
    } catch {
      setStatus('Failed to clear conversations');
    }
  }

  async function handleConfirmAction(action: DesktopAction) {
    setStatus(`Executing ${action.action}...`);
    try {
      const confirmedAction: DesktopAction = { ...action, confirmed: true };
      const result = await executeAction(confirmedAction);
      setActionResults((current) => [
        ...current.filter((r) => r.id !== result.id),
        result
      ]);
      setStatus(result.status === 'success' ? 'Action complete' : 'Action failed');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.status === 'success'
            ? `Action executed: ${result.summary}`
            : `Action failed: ${result.summary}`,
          createdAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Execution failed';
      setStatus('Action failed');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Failed to execute action: ${msg}`,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  function handleCancelAction(actionId: string) {
    setActionResults((current) => {
      const existing = current.find((r) => r.id === actionId);
      const updated: ActionResult = {
        id: actionId,
        action: existing?.action || 'action',
        status: 'cancelled',
        summary: 'Action cancelled by user.',
        startedAt: existing?.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
      return [...current.filter((r) => r.id !== actionId), updated];
    });
    setStatus('Action cancelled');
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
      if (event.result.status === 'success') {
        setStatus('Action complete');
      } else if (event.result.status === 'needs_confirmation') {
        setStatus('Confirmation required');
      } else {
        setStatus('Action needs attention');
      }
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
      const hasPendingConfirm = event.response.actionResults.some((r) => r.status === 'needs_confirmation');
      setStatus(hasPendingConfirm ? 'Confirmation required' : 'Ready');
    }
  }

  return (
    <div className="app-shell">
      <ConversationRail
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNew={startNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onClearConversations={handleClearAllConversations}
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
              <p>Try "take a screenshot", "open Notepad", "list files in .", or "close Notepad".</p>
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
        <ActionTimeline
          plannedActions={plannedActions}
          results={actionResults}
          onConfirmAction={handleConfirmAction}
          onCancelAction={handleCancelAction}
        />
        <SettingsPanel providers={providers} />
      </div>
    </div>
  );
}
