// Issue #14: contract tests for the tracking Zod schema.
// These guard the boundary between client and DB CHECK constraints —
// any change to one must update the other.

import { describe, it, expect } from 'vitest'
import {
  trackingInsertSchema,
  TRACKING_SCORE_MAX,
  TRACKING_DURATION_MAX_SECONDS,
  TRACKING_GAME_NUMBER_MAX,
} from '@/lib/tracking'

const validPayload = {
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  score: 1234,
  duration_seconds: 60,
  game_number: 1,
}

describe('trackingInsertSchema', () => {
  it('accepts a well-formed payload', () => {
    const r = trackingInsertSchema.safeParse(validPayload)
    expect(r.success).toBe(true)
  })

  it('accepts zero score and zero duration (very short games)', () => {
    expect(
      trackingInsertSchema.safeParse({
        ...validPayload,
        score: 0,
        duration_seconds: 0,
      }).success,
    ).toBe(true)
  })

  it('rejects a non-UUID session_id', () => {
    const r = trackingInsertSchema.safeParse({ ...validPayload, session_id: 'not-a-uuid' })
    expect(r.success).toBe(false)
  })

  it('rejects negative score', () => {
    const r = trackingInsertSchema.safeParse({ ...validPayload, score: -1 })
    expect(r.success).toBe(false)
  })

  it('rejects score above max', () => {
    const r = trackingInsertSchema.safeParse({
      ...validPayload,
      score: TRACKING_SCORE_MAX + 1,
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-integer score', () => {
    const r = trackingInsertSchema.safeParse({ ...validPayload, score: 12.5 })
    expect(r.success).toBe(false)
  })

  it('rejects negative duration', () => {
    const r = trackingInsertSchema.safeParse({ ...validPayload, duration_seconds: -1 })
    expect(r.success).toBe(false)
  })

  it('rejects duration above 24h cap', () => {
    const r = trackingInsertSchema.safeParse({
      ...validPayload,
      duration_seconds: TRACKING_DURATION_MAX_SECONDS + 1,
    })
    expect(r.success).toBe(false)
  })

  it('rejects game_number < 1', () => {
    const r = trackingInsertSchema.safeParse({ ...validPayload, game_number: 0 })
    expect(r.success).toBe(false)
  })

  it('rejects game_number above max', () => {
    const r = trackingInsertSchema.safeParse({
      ...validPayload,
      game_number: TRACKING_GAME_NUMBER_MAX + 1,
    })
    expect(r.success).toBe(false)
  })

  it('rejects extra noise like SQL strings in score', () => {
    const r = trackingInsertSchema.safeParse({
      ...validPayload,
      score: '1; DROP TABLE swing_game_sessions;--',
    })
    expect(r.success).toBe(false)
  })
})
