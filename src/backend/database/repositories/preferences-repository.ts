import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { PreferenceRow, PreferenceInsert } from '../database-types';
import { assertGuard, guardPreferenceKey, guardJsonMetadata } from '../free-tier-guard';

const TABLE = 'preferences';

export class PreferencesRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(key: string): Promise<unknown | null> {
    assertGuard(guardPreferenceKey(key));

    const { data, error } = await this.db
      .from(TABLE)
      .select('value')
      .eq('key', key)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[PreferencesRepository] get failed: ${error.message}`);
    return (data as { value: unknown }).value;
  }

  async set(key: string, value: unknown): Promise<PreferenceRow> {
    assertGuard(guardPreferenceKey(key));
    assertGuard(guardJsonMetadata(value));

    const insert: PreferenceInsert = {
      id: nanoid(),
      key,
      value,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.db
      .from(TABLE)
      .upsert(insert, { onConflict: 'key' })
      .select()
      .single();

    if (error) throw new Error(`[PreferencesRepository] set failed: ${error.message}`);
    return data as PreferenceRow;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('key, value')
      .order('key', { ascending: true });

    if (error) throw new Error(`[PreferencesRepository] getAll failed: ${error.message}`);

    const result: Record<string, unknown> = {};
    for (const row of (data ?? []) as { key: string; value: unknown }[]) {
      result[row.key] = row.value;
    }
    return result;
  }

  async delete(key: string): Promise<boolean> {
    assertGuard(guardPreferenceKey(key));

    const { error, count } = await this.db
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('key', key);

    if (error) throw new Error(`[PreferencesRepository] delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }
}
