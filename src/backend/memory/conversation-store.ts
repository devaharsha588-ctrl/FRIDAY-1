import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { nanoid } from 'nanoid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationMessage, ConversationSummary } from '../../shared/chat-contracts';
import { ConversationRepository } from '../database/repositories/conversation-repository';
import { MessageRepository } from '../database/repositories/message-repository';

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

  // Supabase repositories (set only when Supabase is configured)
  private conversationRepo: ConversationRepository | null = null;
  private messageRepo: MessageRepository | null = null;
  private useSupabase = false;

  constructor(
    private readonly storePath = defaultStorePath,
    supabaseClient?: SupabaseClient
  ) {
    if (supabaseClient) {
      this.conversationRepo = new ConversationRepository(supabaseClient);
      this.messageRepo = new MessageRepository(supabaseClient);
      this.useSupabase = true;
    }
  }

  async listSummaries(): Promise<ConversationSummary[]> {
    if (this.useSupabase && this.conversationRepo) {
      try {
        const rows = await this.conversationRepo.list(50);
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          updatedAt: r.updated_at,
          messageCount: (r.metadata as { messageCount?: number } | null)?.messageCount ?? 0
        }));
      } catch {
        // fall through to file store
      }
    }

    await this.load();
    return this.data.conversations
      .map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    if (this.useSupabase && this.messageRepo) {
      try {
        const rows = await this.messageRepo.getByConversation(conversationId, 200);
        return rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          createdAt: r.created_at
        }));
      } catch {
        // fall through to file store
      }
    }

    await this.load();
    return this.data.conversations.find((c) => c.id === conversationId)?.messages ?? [];
  }

  async appendMessage(
    conversationId: string | undefined,
    role: ConversationMessage['role'],
    content: string
  ): Promise<{ conversationId: string; message: ConversationMessage }> {
    if (this.useSupabase && this.conversationRepo && this.messageRepo) {
      try {
        const now = new Date().toISOString();

        // Create conversation if needed
        let convId = conversationId;
        if (!convId) {
          const conv = await this.conversationRepo.create(createTitle(content));
          convId = conv.id;
        } else {
          // Ensure conversation exists; create if not (handles race / first message)
          const existing = await this.conversationRepo.get(convId);
          if (!existing) {
            const conv = await this.conversationRepo.create(createTitle(content));
            convId = conv.id;
          }
        }

        const msgRow = await this.messageRepo.append(convId, role, content);

        // Update conversation updated_at + message count (lightweight metadata)
        const summaries = await this.messageRepo.getByConversation(convId, 1, 0);
        await this.conversationRepo.update(convId, {
          updated_at: now,
          metadata: { messageCount: summaries.length }
        });

        return {
          conversationId: convId,
          message: {
            id: msgRow.id,
            role: msgRow.role,
            content: msgRow.content,
            createdAt: msgRow.created_at
          }
        };
      } catch {
        // fall through to file store
      }
    }

    // ── File store fallback ────────────────────────────────────────────────────
    await this.load();

    const now = new Date().toISOString();
    let conversation = conversationId
      ? this.data.conversations.find((c) => c.id === conversationId)
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
    if (this.useSupabase && this.conversationRepo) {
      try {
        return await this.conversationRepo.delete(conversationId);
      } catch {
        // fall through
      }
    }

    await this.load();
    const before = this.data.conversations.length;
    this.data.conversations = this.data.conversations.filter((c) => c.id !== conversationId);
    if (this.data.conversations.length !== before) {
      await this.save();
      return true;
    }
    return false;
  }

  async clearAllConversations(): Promise<void> {
    if (this.useSupabase && this.conversationRepo) {
      try {
        await this.conversationRepo.deleteAll();
        return;
      } catch {
        // fall through
      }
    }

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
