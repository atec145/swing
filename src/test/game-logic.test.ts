import { describe, it, expect } from 'vitest'
import { createBall, createInitialState, dropBall as dropBallRaw, tierForScore } from '../game/logic'
import { COLORS, DIFFICULTY_TIERS } from '../game/constants'
import { computeAngle, computeTilt } from '../game/physics'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'

// Most assertions only care about the resulting GameState; this thin wrapper
// keeps them readable. Catapult-event-specific tests use dropBallRaw directly.
function dropBall(state: GameState, seesawIndex: number, side: 'left' | 'right'): GameState {
  return dropBallRaw(state, seesawIndex, side).state
}

function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `test-${Math.random()}`, color, variant, weight }
}

function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: computeAngle(left, right), tilt: computeTilt(left, right) }
}

function stateWith(seesaws: SeesawState[]): GameState {
  return {
    seesaws,
    score: 0,
    nextBall: ball('red', 1),
    queuedBall: ball('red', 1),
    phase: 'waiting',
    hoverSeesaw: null,
    hoverSide: null,
    cranePositionIndex: 0,
    pendingCatapult: null,
    pendingMatch: null,
  }
}

describe('findMatches (via dropBall score)', () => {
  it('vertical stack alone does NOT award points', () => {
    const initial: GameState = stateWith([
      seesaw([ball('red'), ball('red')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withRedNext = { ...initial, nextBall: ball('red', 1) }

    const result = dropBall(withRedNext, 0, 'left')
    expect(result.score).toBe(0)
  })

  it('awards points for 3 same-color balls in a contiguous interleaved run', () => {
    // s0 is balanced (both arms have blue) → both balls at level 0.
    // s1.left=[blue]: initially left-heavy. Dropping blue on s1.right balances it
    // → s1.left[0] and s1.right[0] also at level 0.
    // Interleaved at L=0: [blue(s0.left), blue(s0.right), blue(s1.left), blue(s1.right), ...]
    // → contiguous run of 4, match fires.
    const initial: GameState = stateWith([
      seesaw([ball('blue')], [ball('blue')]),
      seesaw([ball('blue')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withBlueNext = { ...initial, nextBall: ball('blue', 1) }

    const result = dropBall(withBlueNext, 1, 'right')
    expect(result.score).toBeGreaterThan(0)
    expect(result.seesaws[0].left.length).toBe(0)
    expect(result.seesaws[0].right.length).toBe(0)
    expect(result.seesaws[1].left.length).toBe(0)
    expect(result.seesaws[1].right.length).toBe(0)
  })

  it('horizontal match also clears vertically adjacent same-color balls', () => {
    // s0 balanced with 2 blue on each arm (levels 0 and 1).
    // s1 balanced with 1 blue on each arm (level 0).
    // Dropping any ball on s2.left triggers findMatches which finds the run
    // [blue(s0.left@0), blue(s0.right@0), blue(s1.left@0), blue(s1.right@0)] → match.
    // Vertical expansion then adds the level-1 balls in s0.
    const initial: GameState = stateWith([
      seesaw([ball('blue'), ball('blue')], [ball('blue'), ball('blue')]),
      seesaw([ball('blue')], [ball('blue')]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    // Drop a non-blue ball so s2 doesn't interfere with the match
    const withGreenNext = { ...initial, nextBall: ball('green', 1) }

    const result = dropBall(withGreenNext, 2, 'left')
    expect(result.score).toBeGreaterThan(0)
    expect(result.seesaws[0].left.length).toBe(0)
    expect(result.seesaws[0].right.length).toBe(0)
    expect(result.seesaws[1].left.length).toBe(0)
    expect(result.seesaws[1].right.length).toBe(0)
  })

  it('same-side balls with empty opposite arms do NOT match (Bug #7 regression)', () => {
    // s0, s1, s2 each balanced with blue only on the left arm — so left arm is
    // at level 0 and right arm is empty. In the interleaved layout these balls
    // appear at positions 0, 2, 4 with nulls at 1, 3, 5 between them — NOT a
    // contiguous run, so no match should fire.
    const initial: GameState = stateWith([
      seesaw([ball('blue')], [ball('red')]),  // balanced: left=blue, right=red
      seesaw([ball('blue')], [ball('red')]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    // Drop blue on s2.left. After drop: s2 left-heavy, blue at level -1.
    // s0 and s1 are balanced so their left blues are at level 0.
    // Interleaved at L=0: [blue(s0.left), red(s0.right), blue(s1.left), red(s1.right), null, null, ...]
    // No 3-ball contiguous blue run → no match.
    const withBlueNext = { ...initial, nextBall: ball('blue', 1) }
    const result = dropBall(withBlueNext, 2, 'left')
    expect(result.score).toBe(0)
    expect(result.seesaws[0].left.length).toBe(1)
    expect(result.seesaws[1].left.length).toBe(1)
    expect(result.seesaws[2].left.length).toBe(1)
  })

  it('adjacent same-color ball on opposite arm IS included when run is contiguous (Bug #7 regression)', () => {
    // s0 balanced (blue on both arms at level 0).
    // s1 balanced (blue on both arms at level 0).
    // Interleaved at L=0: [blue, blue, blue, blue, ...] — run of 4.
    // All four balls must be cleared (s0.left is part of the run, not skipped).
    const initial: GameState = stateWith([
      seesaw([ball('blue')], [ball('blue')]),
      seesaw([ball('blue')], [ball('blue')]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withGreenNext = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withGreenNext, 2, 'left')
    expect(result.score).toBeGreaterThan(0)
    expect(result.seesaws[0].left.length).toBe(0)
    expect(result.seesaws[0].right.length).toBe(0)
    expect(result.seesaws[1].left.length).toBe(0)
    expect(result.seesaws[1].right.length).toBe(0)
  })

  it('no points when balls do not match', () => {
    const initial: GameState = stateWith([
      seesaw([ball('red')], []),
      seesaw([ball('blue')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withGreenNext = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withGreenNext, 2, 'left')
    expect(result.score).toBe(0)
  })
})

describe('catapult (slot-based throw distance)', () => {
  it('catapults ball diff slots to the LEFT when left side is heavier', () => {
    // s0 starts right-heavy (blue 1, left empty → tilt 'right'). Dropping
    // red(6) on the left flips it to 'left' (transition). lw=6, rw=1, diff=5,
    // fromSlot = 1 (s0 right), ball flies LEFT: intended = 1-5 = -4 → slot 8.
    const initial: GameState = stateWith([
      seesaw([], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('red', 6) }
    const { state, catapultEvents } = dropBallRaw(withNextBall, 0, 'left')

    expect(state.seesaws[0].right.length).toBe(0)
    expect(state.seesaws[4].left.length).toBe(1)
    expect(state.seesaws[4].left[0].color).toBe('blue')

    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0]).toMatchObject({ fromSlot: 1, toSlot: 8, diff: 5 })
    expect(catapultEvents[0].ball.color).toBe('blue')
  })

  it('catapults ball diff slots to the RIGHT when right side is heavier', () => {
    // s2.left = blue(1). Drop red(5) on s2.right → rw=5, lw=1, diff=4, right heavier.
    // addedSide='right' → seesaw tips right → fromSlot = 4 (s2 left), ball flies RIGHT:
    // intended = 4+4 = 8 → slot 8 (seesaw 4 left).
    const initial: GameState = stateWith([
      seesaw([], []),
      seesaw([], []),
      seesaw([ball('blue', 1)], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('red', 5) }
    const { state, catapultEvents } = dropBallRaw(withNextBall, 2, 'right')

    expect(state.seesaws[2].left.length).toBe(0)
    expect(state.seesaws[4].left.length).toBe(1)
    expect(state.seesaws[4].left[0].color).toBe('blue')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0]).toMatchObject({ fromSlot: 4, toSlot: 8, diff: 4 })
  })

  it('large diff: left heavier on s5, ball flies left without wrapping', () => {
    // s5 starts right-heavy (blue 1). Drop red(10) on s5.left → left=10,
    // right=1 → transition right→left. diff = 9.
    // fromSlot = 11, flies LEFT: intended = 11-9 = 2 → seesaw 1 left.
    const initial: GameState = stateWith([
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], [ball('blue', 1)]),
    ])
    const withNextBall = { ...initial, nextBall: ball('red', 10) }
    const { state, catapultEvents } = dropBallRaw(withNextBall, 5, 'left')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0]).toMatchObject({ fromSlot: 11, toSlot: 2, diff: 9 })
    expect(state.seesaws[1].left.length).toBe(1)
    expect(state.seesaws[1].left[0].color).toBe('blue')
  })

  it('does NOT catapult when the tilt state does not change', () => {
    // s0 is already left-heavy (red 2 vs blue 1 → tilt 'left'). Adding more
    // weight to the left keeps it 'left' → no transition → no catapult.
    const initial: GameState = stateWith([
      seesaw([ball('red', 2)], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('green', 1) }
    const { state, catapultEvents } = dropBallRaw(withNextBall, 0, 'left')
    expect(state.seesaws[0].right.length).toBe(1)
    expect(catapultEvents).toHaveLength(0)
  })
})

describe('variant-aware matching', () => {
  it('full-red and half-red do NOT match', () => {
    // Three reds in a row, but one is half-variant → no match
    const initial: GameState = stateWith([
      seesaw([ball('red', 1, 'full')], []),
      seesaw([ball('red', 1, 'half')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withFullRedNext = { ...initial, nextBall: ball('red', 1, 'full') }
    const result = dropBall(withFullRedNext, 2, 'left')
    expect(result.score).toBe(0)
    // All three balls should still be on the board
    expect(result.seesaws[0].left.length).toBe(1)
    expect(result.seesaws[1].left.length).toBe(1)
    expect(result.seesaws[2].left.length).toBe(1)
  })

  it('three half-red balls DO match', () => {
    // s0 balanced (half-red on both arms at level 0), s1.left=half-red.
    // Dropping half-red on s1.right balances s1 → contiguous interleaved run of 4.
    const initial: GameState = stateWith([
      seesaw([ball('red', 1, 'half')], [ball('red', 1, 'half')]),
      seesaw([ball('red', 1, 'half')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withHalfRedNext = { ...initial, nextBall: ball('red', 1, 'half') }
    const result = dropBall(withHalfRedNext, 1, 'right')
    expect(result.score).toBeGreaterThan(0)
  })

  it('catapulted half ball does not form a match with full balls of the same color', () => {
    // s0 starts right-heavy (half-blue 1, left empty → tilt 'right'). Dropping
    // red(6) on the left flips it to 'left' (transition). diff=5,
    // fromSlot=1 (right), flies LEFT: intended = 1-5 = -4 → slot 8 (s4 left).
    // Two full-blue balls sit on seesaw 3 right — different slot, no match possible.
    const initial: GameState = stateWith([
      seesaw([], [ball('blue', 1, 'half')]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], [ball('blue', 1, 'full'), ball('blue', 1, 'full')]),
      seesaw([], []),
      seesaw([], []),
    ])
    const withGreenNext = { ...initial, nextBall: ball('red', 6) }
    const result = dropBall(withGreenNext, 0, 'left')
    expect(result.score).toBe(0)
    // half-blue landed on seesaw 4 left; full-blue pair untouched on s3 right.
    expect(result.seesaws[4].left.length).toBe(1)
    expect(result.seesaws[4].left[0].variant).toBe('half')
    expect(result.seesaws[3].right.length).toBe(2)
  })
})

describe('difficulty tiers', () => {
  it('tierForScore returns the lowest tier at score 0', () => {
    const t = tierForScore(0)
    expect(t.activeColors).toBe(5)
    expect(t.variants).toEqual(['full'])
  })

  it('tierForScore returns 6-color tier at score 1000', () => {
    const t = tierForScore(1000)
    expect(t.activeColors).toBe(6)
    expect(t.variants).toEqual(['full'])
  })

  it('tierForScore returns 7-color tier at score 3000', () => {
    const t = tierForScore(3000)
    expect(t.activeColors).toBe(7)
    expect(t.variants).toEqual(['full'])
  })

  it('tierForScore opens the half-ball gate at score 6000', () => {
    const t = tierForScore(6000)
    expect(t.activeColors).toBe(7)
    expect(t.variants).toEqual(['full', 'half'])
  })

  it('tierForScore returns final 8-color full+half tier at score 10000', () => {
    const t = tierForScore(10000)
    expect(t.activeColors).toBe(8)
    expect(t.variants).toEqual(['full', 'half'])
  })

  it('tier transitions are strictly one-way and correctly ordered', () => {
    for (let i = 1; i < DIFFICULTY_TIERS.length; i++) {
      expect(DIFFICULTY_TIERS[i].minScore).toBeGreaterThan(DIFFICULTY_TIERS[i - 1].minScore)
      expect(DIFFICULTY_TIERS[i].activeColors).toBeGreaterThanOrEqual(DIFFICULTY_TIERS[i - 1].activeColors)
    }
  })
})

describe('createBall (score-driven generation)', () => {
  it('only emits the first 5 colors at score 0 over many samples', () => {
    const startingColors = new Set(COLORS.slice(0, 5))
    for (let i = 0; i < 200; i++) {
      const b = createBall(0)
      expect(startingColors.has(b.color)).toBe(true)
      expect(b.variant).toBe('full')
    }
  })

  it('only emits full variant below score 6000', () => {
    for (let i = 0; i < 100; i++) {
      expect(createBall(5999).variant).toBe('full')
    }
  })

  it('emits both full and half variants at score 6000+', () => {
    const variants = new Set<string>()
    for (let i = 0; i < 200; i++) {
      variants.add(createBall(6000).variant)
    }
    expect(variants.has('full')).toBe(true)
    expect(variants.has('half')).toBe(true)
  })

  it('can emit weights up to 10', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      seen.add(createBall(0).weight)
    }
    // Sanity: weights 1 (most common) and 10 (rare, high) should both be reachable
    expect(seen.has(1)).toBe(true)
    expect(Math.max(...seen)).toBe(10)
  })
})

describe('createInitialState', () => {
  it('returns a 5-color, full-variant ball at the start', () => {
    const startingColors = new Set(COLORS.slice(0, 5))
    const s = createInitialState()
    expect(s.score).toBe(0)
    expect(startingColors.has(s.nextBall.color)).toBe(true)
    expect(s.nextBall.variant).toBe('full')
  })
})
