-- FRIDAY Supabase Free-Tier — Row Level Security
-- Migration: 003_rls.sql
-- DO NOT edit after applied. Create a new migration for changes.
--
-- Architecture:
--   Browser → FRIDAY Backend → Supabase (service-role client)
--
-- The service-role key BYPASSES RLS automatically.
-- We enable RLS on all tables as defense-in-depth and to prepare for future Auth.
-- We do NOT create anonymous/public policies — the browser never hits Supabase directly.

-- ─── Enable RLS on all application tables ─────────────────────────────────────

ALTER TABLE conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_status    ENABLE ROW LEVEL SECURITY;

-- ─── Grant backend access to service_role ────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

-- ─── No anonymous/public policies ─────────────────────────────────────────────
--
-- The FRIDAY backend uses the service-role client which bypasses RLS.
-- No public/anonymous policies are created because the browser does not
-- access these tables directly.
--
-- When Auth is added in the future, per-user policies like:
--
--   CREATE POLICY "users_own_conversations"
--     ON conversations FOR ALL
--     USING (auth.uid() = user_id);
--
-- will be added here as new migrations.
--
-- For now, RLS is enabled (tables are locked) and the backend service-role
-- key is the only access path.
