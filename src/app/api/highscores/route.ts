// API: /api/highscores
//
// GET  → returns the global Top-10 highscores (score DESC, created_at ASC).
// POST → inserts a new highscore entry. Anonymous (no auth required by design,
//        see issue #10). Input is strictly validated with Zod; the DB has
//        matching CHECK constraints as a second line of defence.
//
// The Supabase service-role key never leaves this route — the browser only
// ever talks to this proxy.

import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import {
  HIGHSCORE_TOP_N,
  highscoreInsertSchema,
  type HighscoreRow,
} from '@/lib/highscores'

// Don't cache: leaderboard changes whenever someone submits a new score.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const TABLE = 'swing_highscores'

// GET /api/highscores -------------------------------------------------------
export async function GET() {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, name, score, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(HIGHSCORE_TOP_N)

    if (error) {
      console.error('[highscores GET] supabase error:', error)
      return NextResponse.json(
        { error: 'Highscores konnten nicht geladen werden' },
        { status: 502 },
      )
    }

    return NextResponse.json({ highscores: (data ?? []) as HighscoreRow[] })
  } catch (err) {
    console.error('[highscores GET] unexpected error:', err)
    return NextResponse.json(
      { error: 'Highscores konnten nicht geladen werden' },
      { status: 500 },
    )
  }
}

// POST /api/highscores ------------------------------------------------------
export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Ungültiges JSON' },
      { status: 400 },
    )
  }

  const parsed = highscoreInsertSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Ungültige Eingabe',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        name: parsed.data.name,
        score: parsed.data.score,
      })
      .select('id, name, score, created_at')
      .single()

    if (error) {
      console.error('[highscores POST] supabase error:', error)
      return NextResponse.json(
        { error: 'Highscore konnte nicht gespeichert werden' },
        { status: 502 },
      )
    }

    return NextResponse.json({ highscore: data as HighscoreRow }, { status: 201 })
  } catch (err) {
    console.error('[highscores POST] unexpected error:', err)
    return NextResponse.json(
      { error: 'Highscore konnte nicht gespeichert werden' },
      { status: 500 },
    )
  }
}
