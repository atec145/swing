-- Issue #14: Anonymous usage analytics for the Swing game.
-- One row per finished game (game-over event). The browser sends an
-- anonymous, randomly generated session_id from localStorage; no IP,
-- name, or other personal identifier is stored.
--
-- The DB lives in the shared Supabase project (with sarah-todo); the
-- `swing_` prefix avoids cross-project collisions.

CREATE TABLE IF NOT EXISTS public.swing_game_sessions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id       UUID NOT NULL,
  score            INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000000000),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0 AND duration_seconds <= 86400),
  game_number      INTEGER NOT NULL CHECK (game_number >= 1 AND game_number <= 100000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the developer's analytics queries:
--   - "Unique Sessions pro Tag" — groups by date(created_at), counts session_id
--   - "Durchschnittliche Spiele pro Session" — groups by session_id
--   - "Score-Verteilung" — orders by score
-- A composite (created_at DESC, session_id) covers the time-window queries;
-- a separate index on session_id covers per-session aggregates.
CREATE INDEX IF NOT EXISTS idx_swing_game_sessions_created_at
  ON public.swing_game_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swing_game_sessions_session_id
  ON public.swing_game_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_swing_game_sessions_score
  ON public.swing_game_sessions (score DESC);

-- Row Level Security ---------------------------------------------------------
ALTER TABLE public.swing_game_sessions ENABLE ROW LEVEL SECURITY;

-- INSERT: anyone (anon) may submit a session record. The CHECK constraints
-- on score/duration/game_number plus server-side Zod validation provide
-- defense in depth. Writes are funneled through the /api/track Next.js
-- route, so the anon key is never actually used in this codebase — but
-- the policy still allows it as a documented intent.
DROP POLICY IF EXISTS "swing_game_sessions_insert_anon" ON public.swing_game_sessions;
CREATE POLICY "swing_game_sessions_insert_anon"
  ON public.swing_game_sessions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT: no policy for anon — only the service role (used by the developer
-- via Supabase Dashboard / SQL Editor) can read. Players cannot enumerate
-- other players' sessions.
-- Service role bypasses RLS entirely, so no explicit SELECT policy is needed
-- for developer analytics.

-- No UPDATE / DELETE policies => denied by default once RLS is enabled.
-- Session records are immutable from any non-service-role client.
