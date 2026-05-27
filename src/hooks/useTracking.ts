'use client'

// Anonymous session tracking for the Swing game (issue #14).
//
// Watches `gameState.phase` and fires a single POST /api/track per game-over.
// Fire-and-forget: a failed request is silently ignored so it can never
// disturb the gameplay (no UI error, no crash, no retry).
//
// Per-tab in-memory bookkeeping:
//   - gameNumber:  1 for the first game in this tab, increments on each restart
//   - startTime:   ms timestamp set when the current game becomes active
//   - reported:    guards against double-firing for the same gameover
//
// The browser session id (UUID in localStorage) is shared across tabs;
// gameNumber is intentionally tab-local — that matches the issue spec.

import { useEffect, useRef } from 'react'
import type { GamePhase } from '@/game/types'
import { getOrCreateSessionId } from '@/lib/tracking'

interface TrackingInput {
  phase: GamePhase
  score: number
}

export function useTracking({ phase, score }: TrackingInput) {
  // Per-tab counter: 1 = current game is the first in this tab.
  // Initialised once; survives re-renders.
  const gameNumberRef = useRef<number>(1)
  // ms timestamp when the current game started (phase entered 'waiting').
  const startTimeRef = useRef<number>(Date.now())
  // Guards: only fire once per gameover; only count a restart once.
  const reportedForGameRef = useRef<boolean>(false)
  const prevPhaseRef = useRef<GamePhase>(phase)
  // Cached session id (looked up once on mount). null = tracking disabled
  // because localStorage is unavailable.
  const sessionIdRef = useRef<string | null>(null)

  // One-time setup: resolve the session id. Wrapped in an effect so it runs
  // client-side only.
  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId()
  }, [])

  useEffect(() => {
    const prevPhase = prevPhaseRef.current

    // Transition: waiting -> gameover  =>  send a track event.
    if (prevPhase !== 'gameover' && phase === 'gameover') {
      if (!reportedForGameRef.current) {
        reportedForGameRef.current = true
        const sessionId = sessionIdRef.current
        if (sessionId) {
          const durationMs = Math.max(0, Date.now() - startTimeRef.current)
          sendTrack({
            session_id: sessionId,
            score,
            duration_seconds: Math.round(durationMs / 1000),
            game_number: gameNumberRef.current,
          })
        }
      }
    }

    // Transition: gameover -> waiting  =>  a restart happened; arm the next game.
    if (prevPhase === 'gameover' && phase !== 'gameover') {
      gameNumberRef.current += 1
      startTimeRef.current = Date.now()
      reportedForGameRef.current = false
    }

    prevPhaseRef.current = phase
  }, [phase, score])
}

/**
 * Fire-and-forget POST to /api/track. All failures are silently swallowed —
 * tracking must never affect the gameplay. `keepalive: true` lets the browser
 * complete the request even if the tab is closing.
 */
function sendTrack(payload: {
  session_id: string
  score: number
  duration_seconds: number
  game_number: number
}): void {
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Swallow network errors — analytics is best-effort.
    })
  } catch {
    // Swallow synchronous errors (e.g. CSP blocks fetch in odd environments).
  }
}
