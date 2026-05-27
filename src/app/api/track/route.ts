// API: /api/track
//
// POST → records an anonymous game-session event (issue #14).
//        Fire-and-forget from the browser; no authentication is required by
//        design (the feature is anonymous usage analytics). Input is strictly
//        validated with Zod; the DB has matching CHECK constraints as a
//        second line of defence.
//
// The Supabase service-role key never leaves this route — the browser only
// ever talks to this proxy.

import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { trackingInsertSchema } from '@/lib/tracking'

// Don't cache: this endpoint is write-only and per-request.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const TABLE = 'swing_game_sessions'

// POST /api/track -----------------------------------------------------------
export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  const parsed = trackingInsertSchema.safeParse(payload)
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
    const { error } = await supabase.from(TABLE).insert({
      session_id: parsed.data.session_id,
      score: parsed.data.score,
      duration_seconds: parsed.data.duration_seconds,
      game_number: parsed.data.game_number,
    })

    if (error) {
      // Log server-side but don't leak DB details to the client. The browser
      // ignores this response anyway (fire-and-forget), so we keep the body
      // minimal.
      console.error('[track POST] supabase error:', error)
      return NextResponse.json(
        { error: 'Tracking konnte nicht gespeichert werden' },
        { status: 502 },
      )
    }

    // No body needed — the client doesn't read the response.
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[track POST] unexpected error:', err)
    return NextResponse.json(
      { error: 'Tracking konnte nicht gespeichert werden' },
      { status: 500 },
    )
  }
}
