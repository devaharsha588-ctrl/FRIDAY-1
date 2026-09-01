import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { ConversationRow, ConversationInsert, ConversationUpdate } from '../database-types';
import {
  assertGuard,
  guardConversationTitle,
  guardJsonMetadata
} from '../free-tier-guard';

const TABLE = 'conversations';
const DEFAULT_PAGE_SIZE = 20;

export class ConversationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(title: string, metadata?: Record<string, unknown>): Promise<ConversationRow> {
    assertGuard(guardConversationTitle(title));
    if (metadata) assertGuard(guardJsonMetadata(metadata));

    const insert: ConversationInsert = {
      id: nanoid(),
      title,
      metadata: metadata ?? null
    };

    const { data, error } = await this.db
      .from(TABLE)
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`[ConversationRepository] create failed: ${error.message}`);
    return data as ConversationRow;
  }

  async get(id: string): Promise<ConversationRow | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, title, created_at, updated_at, metadata')
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return null; // not found
    if (error) throw new Error(`[ConversationRepository] get failed: ${error.message}`);
    return data as ConversationRow;
  }

  async list(limit = DEFAULT_PAGE_SIZE, offset = 0): Promise<ConversationRow[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, title, created_at, updated_at, metadata')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`[ConversationRepository] list failed: ${error.message}`);
    return (data ?? []) as ConversationRow[];
  }

  async update(id: string, updates: ConversationUpdate): Promise<ConversationRow | null> {
    if (updates.title) assertGuard(guardConversationTitle(updates.title));
    if (updates.metadata) assertGuard(guardJsonMetadata(updates.metadata));

    const payload: ConversationUpdate = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.db
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[ConversationRepository] update failed: ${error.message}`);
    return data as ConversationRow;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await this.db
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new Error(`[ConversationRepository] delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async deleteAll(): Promise<void> {
    const { error } = await this.db.from(TABLE).delete().neq('id', '');
    if (error) throw new Error(`[ConversationRepository] deleteAll failed: ${error.message}`);
  }
}
