import { describe, it, expect } from 'vitest'
import { createBall, createInitialState, dropBall, tierForScore } from '../game/logic'
import { COLORS, DIFFICULTY_TIERS } from '../game/constants'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'

function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `test-${Math.random()}`, color, variant, weight }
}

function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: 0 }
}

function stateWith(seesaws: SeesawState[]): GameState {
  return {
    seesaws,
    score: 0,
    nextBall: ball('red', 1),
    phase: 'waiting',
    hoverSeesaw: null,
    hoverSide: null,
  }
}

describe('findMatches (via dropBall score)', () => {
  it('awards points for 3 same-color balls in vertical left stack', () => {
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
    expect(result.score).toBeGreaterThan(0)
  })

  it('awards points for 3 same-color balls in left-side horizontal row', () => {
    const initial: GameState = stateWith([
      seesaw([ball('blue')], []),
      seesaw([ball('blue')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withBlueNext = { ...initial, nextBall: ball('blue', 1) }

    const result = dropBall(withBlueNext, 2, 'left')
    expect(result.score).toBeGreaterThan(0)
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

describe('catapult', () => {
  it('catapults ball when weight difference exceeds threshold', () => {
    const initial: GameState = stateWith([
      seesaw([ball('red', 5)], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withNextBall, 0, 'left')

    expect(result.seesaws[0].right.length).toBe(0)
    expect(result.seesaws[1].left.length).toBe(1)
    expect(result.seesaws[1].left[0].color).toBe('blue')
  })

  it('does NOT catapult when difference is below threshold', () => {
    const initial: GameState = stateWith([
      seesaw([ball('red', 2)], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withNextBall, 0, 'left')
    expect(result.seesaws[0].right.length).toBe(1)
    expect(result.seesaws[1].left.length).toBe(0)
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
    const initial: GameState = stateWith([
      seesaw([ball('red', 1, 'half')], []),
      seesaw([ball('red', 1, 'half')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withHalfRedNext = { ...initial, nextBall: ball('red', 1, 'half') }
    const result = dropBall(withHalfRedNext, 2, 'left')
    expect(result.score).toBeGreaterThan(0)
  })

  it('catapulted half ball does not form a match with neighboring full balls of same color', () => {
    // Seesaw 0 has a heavy left side → catapults its top right ball to seesaw 1's left
    // Seesaw 1 already has two full-blue balls; if catapulted ball is half-blue, no match
    const initial: GameState = stateWith([
      seesaw([ball('red', 5)], [ball('blue', 1, 'half')]),
      seesaw([ball('blue', 1, 'full'), ball('blue', 1, 'full')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withGreenNext = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withGreenNext, 0, 'left')
    // half-blue catapulted to seesaw 1 left → stack becomes [full-blue, full-blue, half-blue] (no match)
    expect(result.score).toBe(0)
    expect(result.seesaws[1].left.length).toBe(3)
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
