-- FRIDAY Supabase Free-Tier — Indexes
-- Migration: 002_indexes.sql
-- Only indexes needed by real queries. Indexes consume storage — keep minimal.
-- DO NOT edit after applied. Create a new migration for changes.

-- conversations: list sorted by updated_at desc
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations (updated_at DESC);

-- messages: load messages for a conversation in chronological order
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at ASC);

-- tasks: list tasks for a conversation in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_tasks_conversation_started
  ON tasks (conversation_id, started_at DESC);

-- task_actions: load actions for a task in order
CREATE INDEX IF NOT EXISTS idx_task_actions_task_started
  ON task_actions (task_id, started_at ASC);

-- memories: filter by category, sort by importance then created_at
CREATE INDEX IF NOT EXISTS idx_memories_category_importance
  ON memories (category, importance DESC, created_at DESC);

-- preferences: lookup by key (already covered by UNIQUE constraint, listed for documentation)
-- No additional index needed — UNIQUE constraint on preferences(key) creates one automatically.
