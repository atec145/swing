-- Issue #10: Global Top-10 highscore ranking for the Swing game.
-- This DB is shared with sarah-todo; all tables for this project carry the
-- `swing_` prefix to avoid collisions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.swing_highscores (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20),
  score      INTEGER NOT NULL CHECK (score > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Top-10 query: ORDER BY score DESC, created_at ASC (tie-break: older first).
-- A single composite index serves both columns in the order they're used.
CREATE INDEX IF NOT EXISTS idx_swing_highscores_score_created
  ON public.swing_highscores (score DESC, created_at ASC);

-- Row Level Security ---------------------------------------------------------
ALTER TABLE public.swing_highscores ENABLE ROW LEVEL SECURITY;

-- Public read: anyone (anon) may read the leaderboard.
DROP POLICY IF EXISTS "swing_highscores_select_anon" ON public.swing_highscores;
CREATE POLICY "swing_highscores_select_anon"
  ON public.swing_highscores
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public insert: anyone (anon) may submit a score. The CHECK constraints on
-- name length and score>0 plus server-side Zod validation provide defense in
-- depth. No additional row-level restriction is needed for anonymous entries.
DROP POLICY IF EXISTS "swing_highscores_insert_anon" ON public.swing_highscores;
CREATE POLICY "swing_highscores_insert_anon"
  ON public.swing_highscores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No UPDATE / DELETE policies => those operations are denied by default once
-- RLS is enabled. Highscores are immutable from the client.
