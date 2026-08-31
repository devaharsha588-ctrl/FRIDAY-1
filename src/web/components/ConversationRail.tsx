import { useState } from 'react';
import { MessageSquarePlus, PanelLeft, Trash, Trash2 } from 'lucide-react';
import type { ConversationSummary } from '../../shared/chat-contracts';

type ConversationRailProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleteConversation?: (id: string) => Promise<void>;
  onClearConversations?: () => Promise<void>;
};

export function ConversationRail({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDeleteConversation,
  onClearConversations
}: ConversationRailProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!onDeleteConversation) return;
    setDeletingId(id);
    try {
      await onDeleteConversation(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    if (!onClearConversations) return;
    try {
      await onClearConversations();
    } finally {
      setConfirmClear(false);
    }
  }

  return (
    <aside className="conversation-rail">
      <div className="brand-row">
        <div className="brand-mark">F</div>
        <div>
          <strong>FRIDAY</strong>
          <span>Desktop AI</span>
        </div>
      </div>
      <div className="rail-actions">
        <button className="rail-button" type="button" onClick={onNew}>
          <MessageSquarePlus size={17} aria-hidden="true" />
          <span>New</span>
        </button>
      </div>
      <div className="rail-title">
        <PanelLeft size={16} aria-hidden="true" />
        <span>History</span>
      </div>
      <nav className="conversation-list" aria-label="Conversation history">
        {conversations.length === 0 ? (
          <p className="rail-empty">No conversations yet.</p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={conversation.id === activeId ? 'conversation-item active' : 'conversation-item'}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(conversation.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(conversation.id);
              }}
            >
              <div className="conversation-text">
                <span>{conversation.title}</span>
                <small>{conversation.messageCount} messages</small>
              </div>
              {onDeleteConversation && (
                <button
                  type="button"
                  className="btn-delete-convo"
                  title="Delete this conversation"
                  aria-label={`Delete conversation ${conversation.title}`}
                  disabled={deletingId === conversation.id}
                  onClick={(e) => void handleDelete(e, conversation.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))
        )}
      </nav>

      {conversations.length > 0 && onClearConversations && (
        <div className="rail-footer">
          {confirmClear ? (
            <div className="clear-confirm-dialog">
              <p>Clear all conversation history?</p>
              <div className="confirm-btns">
                <button type="button" className="btn-confirm-danger" onClick={() => void handleClearAll()}>
                  Yes, Clear All
                </button>
                <button type="button" className="btn-cancel-small" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-clear-all"
              onClick={() => setConfirmClear(true)}
            >
              <Trash size={14} aria-hidden="true" />
              <span>Clear all history</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
