import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { nanoid } from 'nanoid';
import type { ConversationMessage, ConversationSummary } from '../../shared/chat-contracts';

type ConversationRecord = {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

type StoreShape = {
  conversations: ConversationRecord[];
};

const defaultStorePath = resolve(process.cwd(), '.friday', 'conversations.json');

export class ConversationStore {
  private data: StoreShape = { conversations: [] };
  private loaded = false;

  constructor(private readonly storePath = defaultStorePath) {}

  async listSummaries(): Promise<ConversationSummary[]> {
    await this.load();
    return this.data.conversations
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    await this.load();
    return this.data.conversations.find((conversation) => conversation.id === conversationId)?.messages || [];
  }

  async appendMessage(
    conversationId: string | undefined,
    role: ConversationMessage['role'],
    content: string
  ): Promise<{ conversationId: string; message: ConversationMessage }> {
    await this.load();

    const now = new Date().toISOString();
    let conversation = conversationId
      ? this.data.conversations.find((candidate) => candidate.id === conversationId)
      : undefined;

    if (!conversation) {
      conversation = {
        id: nanoid(),
        title: createTitle(content),
        messages: [],
        createdAt: now,
        updatedAt: now
      };
      this.data.conversations.push(conversation);
    }

    const message: ConversationMessage = {
      id: nanoid(),
      role,
      content,
      createdAt: now
    };

    conversation.messages.push(message);
    conversation.updatedAt = now;
    await this.save();

    return { conversationId: conversation.id, message };
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    await this.load();
    const initialLen = this.data.conversations.length;
    this.data.conversations = this.data.conversations.filter((c) => c.id !== conversationId);
    if (this.data.conversations.length !== initialLen) {
      await this.save();
      return true;
    }
    return false;
  }

  async clearAllConversations(): Promise<void> {
    await this.load();
    this.data.conversations = [];
    await this.save();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const raw = await readFile(this.storePath, 'utf8');
      this.data = JSON.parse(raw) as StoreShape;
    } catch {
      this.data = { conversations: [] };
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

function createTitle(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return 'New conversation';
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}
