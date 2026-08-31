import { MessageSquarePlus, PanelLeft, Search } from 'lucide-react';
import type { ConversationSummary } from '../../shared/chat-contracts';

type ConversationRailProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ConversationRail({ conversations, activeId, onSelect, onNew }: ConversationRailProps) {
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
        <button className="icon-button" type="button" title="Search conversations" aria-label="Search conversations">
          <Search size={17} aria-hidden="true" />
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
            <button
              key={conversation.id}
              className={conversation.id === activeId ? 'conversation-item active' : 'conversation-item'}
              type="button"
              onClick={() => onSelect(conversation.id)}
            >
              <span>{conversation.title}</span>
              <small>{conversation.messageCount} messages</small>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}

