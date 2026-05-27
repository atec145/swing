// Shared types + Zod schema for anonymous session tracking (issue #14).
// Imported by both the /api/track route handler and the client-side hook
// so the contract stays in lock-step with database CHECK constraints.

import { z } from 'zod'

// localStorage key for the per-browser session UUID.
// Lives for the lifetime of localStorage; not regenerated per tab/reload.
export const SESSION_ID_STORAGE_KEY = 'swing_session_id'

// Upper bounds for the tracking payload. The DB enforces matching CHECK
// constraints (see migration 0002) as a second line of defence.
export const TRACKING_SCORE_MAX = 1_000_000_000
export const TRACKING_DURATION_MAX_SECONDS = 86_400 // 24 h — generous cap
export const TRACKING_GAME_NUMBER_MAX = 100_000

// Strict UUID validation — the client generates the id with crypto.randomUUID(),
// so anything that doesn't parse as a UUID is treated as bogus input.
export const trackingInsertSchema = z.object({
  session_id: z.string().uuid('session_id muss eine UUID sein'),
  score: z
    .number()
    .int('Score muss eine ganze Zahl sein')
    .min(0, 'Score darf nicht negativ sein')
    .max(TRACKING_SCORE_MAX, 'Score zu groß'),
  duration_seconds: z
    .number()
    .int('Dauer muss eine ganze Zahl sein')
    .min(0, 'Dauer darf nicht negativ sein')
    .max(TRACKING_DURATION_MAX_SECONDS, 'Dauer zu groß'),
  game_number: z
    .number()
    .int('game_number muss eine ganze Zahl sein')
    .min(1, 'game_number muss mindestens 1 sein')
    .max(TRACKING_GAME_NUMBER_MAX, 'game_number zu groß'),
})

export type TrackingInsert = z.infer<typeof trackingInsertSchema>

/**
 * Read the existing session id from localStorage, or create + persist a new
 * one if none exists. Returns `null` when localStorage is unavailable
 * (private mode, disabled cookies, SSR) — callers should treat that as
 * "tracking disabled" and silently skip.
 */
export function getOrCreateSessionId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    const existing = window.localStorage.getItem(SESSION_ID_STORAGE_KEY)
    if (existing && isUuid(existing)) {
      return existing
    }
    const fresh = newUuid()
    window.localStorage.setItem(SESSION_ID_STORAGE_KEY, fresh)
    return fresh
  } catch {
    // localStorage can throw in private mode / quota-exceeded — swallow.
    return null
  }
}

// crypto.randomUUID is available in all modern browsers (and Node 19+),
// but we keep a tiny v4 fallback just in case.
function newUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  // RFC4122 v4 fallback using crypto.getRandomValues when available.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
