import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { MemoryRow, MemoryInsert, MemoryUpdate } from '../database-types';
import { assertGuard, guardMemoryContent, guardJsonMetadata } from '../free-tier-guard';

const TABLE = 'memories';
const DEFAULT_PAGE_SIZE = 50;

export class MemoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(
    content: string,
    category?: string,
    importance?: number,
    metadata?: Record<string, unknown>
  ): Promise<MemoryRow> {
    assertGuard(guardMemoryContent(content));
    if (metadata) assertGuard(guardJsonMetadata(metadata));

    // Clamp importance to SMALLINT range (0–100 for practical use)
    const clampedImportance = importance !== undefined
      ? Math.max(0, Math.min(100, Math.round(importance)))
      : null;

    const insert: MemoryInsert = {
      id: nanoid(),
      content,
      category: category ?? null,
      importance: clampedImportance,
      metadata: metadata ?? null
    };

    const { data, error } = await this.db
      .from(TABLE)
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`[MemoryRepository] create failed: ${error.message}`);
    return data as MemoryRow;
  }

  async get(id: string): Promise<MemoryRow | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, content, category, importance, created_at, updated_at, metadata')
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[MemoryRepository] get failed: ${error.message}`);
    return data as MemoryRow;
  }

  async list(category?: string, limit = DEFAULT_PAGE_SIZE): Promise<MemoryRow[]> {
    let query = this.db
      .from(TABLE)
      .select('id, content, category, importance, created_at, updated_at, metadata')
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[MemoryRepository] list failed: ${error.message}`);
    return (data ?? []) as MemoryRow[];
  }

  async update(id: string, updates: MemoryUpdate): Promise<MemoryRow | null> {
    if (updates.content) assertGuard(guardMemoryContent(updates.content));
    if (updates.metadata) assertGuard(guardJsonMetadata(updates.metadata));

    const payload: MemoryUpdate = {
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
    if (error) throw new Error(`[MemoryRepository] update failed: ${error.message}`);
    return data as MemoryRow;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await this.db
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new Error(`[MemoryRepository] delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }
}
