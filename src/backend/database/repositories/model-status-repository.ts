import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import type { ModelStatusRow, ModelStatusInsert } from '../database-types';

const TABLE = 'model_status';

export type ModelStatusInput = {
  role: string;
  modelId: string;
  provider?: string;
  free: boolean;
  available: boolean;
  healthy: boolean;
  verificationStatus?: string;
};

export class ModelStatusRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Upserts model status. Never stores API keys or credentials.
   * Only safe public metadata: role, model_id, free, available, healthy.
   */
  async upsert(input: ModelStatusInput): Promise<ModelStatusRow> {
    const now = new Date().toISOString();

    const insert: ModelStatusInsert = {
      id: nanoid(),
      role: input.role,
      model_id: input.modelId,
      provider: input.provider ?? null,
      free: input.free,
      available: input.available,
      healthy: input.healthy,
      verification_status: input.verificationStatus ?? null,
      verified_at: input.healthy ? now : null,
      updated_at: now
    };

    // Upsert on (role) — one row per role
    const { data, error } = await this.db
      .from(TABLE)
      .upsert(insert, { onConflict: 'role' })
      .select()
      .single();

    if (error) throw new Error(`[ModelStatusRepository] upsert failed: ${error.message}`);
    return data as ModelStatusRow;
  }

  async getAll(): Promise<ModelStatusRow[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, role, model_id, provider, free, available, healthy, verification_status, verified_at, updated_at')
      .order('role', { ascending: true });

    if (error) throw new Error(`[ModelStatusRepository] getAll failed: ${error.message}`);
    return (data ?? []) as ModelStatusRow[];
  }

  async getByRole(role: string): Promise<ModelStatusRow | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, role, model_id, provider, free, available, healthy, verification_status, verified_at, updated_at')
      .eq('role', role)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`[ModelStatusRepository] getByRole failed: ${error.message}`);
    return data as ModelStatusRow;
  }
}
