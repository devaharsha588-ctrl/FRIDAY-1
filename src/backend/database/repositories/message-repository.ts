import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { MessageRow, MessageInsert } from '../database-types';
import { assertGuard, guardMessageContent, guardJsonMetadata } from '../free-tier-guard';

const TABLE = 'messages';
const DEFAULT_PAGE_SIZE = 50;

export class MessageRepository {
  constructor(private readonly db: SupabaseClient) {}

  async append(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<MessageRow> {
    assertGuard(guardMessageContent(content));
    if (metadata) assertGuard(guardJsonMetadata(metadata));

    const insert: MessageInsert = {
      id: nanoid(),
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata ?? null
    };

    const { data, error } = await this.db
      .from(TABLE)
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`[MessageRepository] append failed: ${error.message}`);
    return data as MessageRow;
  }

  /**
   * Returns messages for a conversation, paginated.
   * Default: most recent 50 messages in ascending order (oldest first).
   */
  async getByConversation(
    conversationId: string,
    limit = DEFAULT_PAGE_SIZE,
    offset = 0
  ): Promise<MessageRow[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, conversation_id, role, content, created_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`[MessageRepository] getByConversation failed: ${error.message}`);
    return (data ?? []) as MessageRow[];
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    const { error } = await this.db
      .from(TABLE)
      .delete()
      .eq('conversation_id', conversationId);

    if (error) throw new Error(`[MessageRepository] deleteByConversation failed: ${error.message}`);
  }
}
