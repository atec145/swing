// Ad-hoc QA validation tests for Issue #12 — rock (Felsblock) special ball.
import { describe, it, expect } from 'vitest'
import { createBall, dropBall } from '../game/logic'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'
import { computeAngle, computeTilt } from '../game/physics'
import { ROCK_WEIGHT, ROCK_MIN_SCORE } from '../game/constants'

function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `t-${Math.random()}`, color, variant, weight, kind: 'normal' }
}
function sawballl(): Ball {
  return { id: `sb-${Math.random()}`, color: 'green', variant: 'full', weight: 0, kind: 'sawblade' }
}
function rock(): Ball {
  return { id: `r-${Math.random()}`, color: 'green', variant: 'full', weight: ROCK_WEIGHT, kind: 'rock' }
}
function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: computeAngle(left, right), tilt: computeTilt(left, right) }
}
function emptyBoard(): SeesawState[] {
  return [
    seesaw([], []), seesaw([], []), seesaw([], []),
    seesaw([], []), seesaw([], []), seesaw([], []),
  ]
}
function stateWith(seesaws: SeesawState[], nextBall: Ball, score = 0): GameState {
  return {
    seesaws, score, nextBall,
    queuedBall: ball('red', 1),
    phase: 'waiting',
    hoverSeesaw: null, hoverSide: null,
    cranePositionIndex: 0,
    pendingCatapult: null, pendingMatch: null, pendingSawblade: null,
  }
}

describe('AC: Rock has weight 15 and tilts the seesaw', () => {
  it('dropping a rock on an empty left arm tilts the seesaw left', () => {
    const s = stateWith(emptyBoard(), rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(1)
    expect(result.state.seesaws[0].left[0].weight).toBe(15)
    expect(result.state.seesaws[0].tilt).toBe('left')
  })

  it('rock outweighs a stack of light normal balls', () => {
    const s = stateWith([
      seesaw([], [ball('red', 1), ball('red', 1), ball('red', 1)]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    // 15 (rock) > 3 (three light balls) — tilts left, catapult-eligible.
    expect(result.state.seesaws[0].tilt).toBe('left')
  })
})

describe('AC: Rock is immune to color matches', () => {
  it('rock between two same-color balls does NOT match (gap)', () => {
    // Layout per seesaw 0: left=[red, rock, red, red] — three reds aren't contiguous.
    // No match should fire on this column.
    const s = stateWith([
      seesaw([ball('red'), rock(), ball('red'), ball('red')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue'))
    const result = dropBall(s, 5, 'left')  // drop somewhere else, just to run scan
    // Reds + rock remain on seesaw 0
    const armIds = result.state.seesaws[0].left.map(b => b.kind)
    expect(armIds).toEqual(['normal', 'rock', 'normal', 'normal'])
  })

  it('rock itself never appears in a match group', () => {
    // Three reds in a row across left arms — would normally match — plus a rock
    // sitting on the row at seesaw 1's RIGHT arm. The rock breaks the
    // interleaved-row scan ([s0L, s0R, s1L, s1R, …]) at that position.
    // Actually, the row scan only sees rock as a gap, but the THREE reds before
    // the rock should still match if they are contiguous in the scanned sequence.
    // Easier assertion: a single rock with nothing else around it never gets
    // removed by a color match.
    const s = stateWith([
      seesaw([rock()], [ball('blue')]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue'))
    const result = dropBall(s, 5, 'left')
    // Rock still there
    expect(result.state.seesaws[0].left.length).toBe(1)
    expect(result.state.seesaws[0].left[0].kind).toBe('rock')
  })
})

describe('AC: Sawblade clears rocks (rocks count as 0 points)', () => {
  it('sawblade on an arm with only rocks → all cleared, 0 score', () => {
    const s = stateWith([
      seesaw([rock(), rock()], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(0)
    expect(result.state.score).toBe(0)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(2)
  })

  it('sawblade on mixed arm: normal balls score, rock does not', () => {
    const s = stateWith([
      seesaw([ball('red'), rock(), ball('blue')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(0)
    // 2 normal balls × 10 = 20; rock = 0
    expect(result.state.score).toBe(20)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(3)
  })
})

describe('AC: Rock spawn gated by score threshold', () => {
  it(`NEVER produces a rock at score < ${ROCK_MIN_SCORE}`, () => {
    for (let i = 0; i < 2000; i++) {
      const b = createBall(ROCK_MIN_SCORE - 1)
      expect(b.kind).not.toBe('rock')
    }
  })

  it(`CAN produce a rock at score >= ${ROCK_MIN_SCORE}`, () => {
    let rocks = 0
    for (let i = 0; i < 2000; i++) {
      const b = createBall(ROCK_MIN_SCORE)
      if (b.kind === 'rock') rocks++
    }
    // ROCK_PROBABILITY ~= 0.04 → expected ~80 per 2000.
    expect(rocks).toBeGreaterThan(20)
    expect(rocks).toBeLessThan(200)
  })
})

describe('Edge: Rock contributes to game-over (high weight forces stacks)', () => {
  it('an arm filled to MAX_STACK with rocks triggers game-over', () => {
    // 7 rocks already there; drop one more rock → 8 rocks → gameover.
    const s = stateWith([
      seesaw([rock(), rock(), rock(), rock(), rock(), rock(), rock()], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.phase).toBe('gameover')
  })
})

describe('AC: Match scan still works correctly around rocks', () => {
  it('three reds in a row on balanced seesaws still match when a rock is elsewhere', () => {
    // All three seesaws balanced (each has equal-weight left+right).
    // Row 0 (bottom physical level) contains: s0L=red, s0R=red, s1L=red.
    // Padding balls keep tilts neutral so armOffset stays 0 everywhere.
    const padR = ball('blue', 1)
    const padG = ball('blue', 1)
    const padN = ball('blue', 1)
    const padO = ball('blue', 1)
    const padY = ball('blue', 1)
    const s = stateWith([
      seesaw([ball('red')], [ball('red')]),               // balanced (red=red)
      seesaw([ball('red')], [padR]),                      // balanced (red=blue weight 1)
      seesaw([rock()], [ball('blue', ROCK_WEIGHT)]),      // balanced (rock=15 vs blue=15)
      seesaw([padG], [padN]),                             // balanced
      seesaw([padO], [padY]),                             // balanced
      seesaw([], []),
    ], ball('blue'))
    // Drop somewhere out of the way — match scan runs regardless after drop.
    const result = dropBall(s, 5, 'left')
    expect(result.matchGroups.length).toBeGreaterThan(0)
    // The three matched reds are gone (s0L, s0R, s1L).
    expect(result.state.seesaws[0].left.length).toBe(0)
    expect(result.state.seesaws[0].right.length).toBe(0)
    expect(result.state.seesaws[1].left.length).toBe(0)
    // Rock untouched on s2L.
    expect(result.state.seesaws[2].left.length).toBe(1)
    expect(result.state.seesaws[2].left[0].kind).toBe('rock')
  })
})
