import { describe, it, expect } from 'vitest'
import { createBall, createInitialState, dropBall } from '../game/logic'
import type { Ball, SeesawState, GameState } from '../game/types'

function ball(color: 'red' | 'blue' | 'green' | 'yellow' | 'purple', weight = 1): Ball {
  return { id: `test-${Math.random()}`, color, weight }
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
    // Set up: seesaw 0 left has [red, red] already
    const initial: GameState = stateWith([
      seesaw([ball('red'), ball('red')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withRedNext = { ...initial, nextBall: ball('red', 1) }

    // Drop another red on seesaw 0 left → 3-in-a-column match
    const result = dropBall(withRedNext, 0, 'left')
    expect(result.score).toBeGreaterThan(0)
  })

  it('awards points for 3 same-color balls in left-side horizontal row', () => {
    // Put same-color balls at height 0 on left side of 3 consecutive seesaws
    const initial: GameState = stateWith([
      seesaw([ball('blue')], []),
      seesaw([ball('blue')], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withBlueNext = { ...initial, nextBall: ball('blue', 1) }

    // Drop blue on seesaw 2 left → s0.left[0]=blue, s1.left[0]=blue, s2.left[0]=blue → match
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
    // Put heavy ball on left, light balls on right, diff > CATAPULT_THRESHOLD(3)
    // left total = 5, right total = 1 → diff = 4 > 3 → catapult
    const initial: GameState = stateWith([
      seesaw([ball('red', 5)], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    // Drop weight-1 on left: lw=6, rw=1, diff=5 > 3 → catapult blue from right → seesaw 1 left
    const withNextBall = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withNextBall, 0, 'left')

    // Seesaw 0 right should be empty (ball catapulted)
    expect(result.seesaws[0].right.length).toBe(0)
    // Seesaw 1 left should have the catapulted blue ball
    expect(result.seesaws[1].left.length).toBe(1)
    expect(result.seesaws[1].left[0].color).toBe('blue')
  })

  it('does NOT catapult when difference is below threshold', () => {
    // left=2, right=1, diff=1 < 3 → no catapult
    const initial: GameState = stateWith([
      seesaw([ball('red', 2)], [ball('blue', 1)]),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
      seesaw([], []),
    ])
    const withNextBall = { ...initial, nextBall: ball('green', 1) }
    const result = dropBall(withNextBall, 0, 'left') // lw=3, rw=1, diff=2 < 3
    expect(result.seesaws[0].right.length).toBe(1) // blue still there
    expect(result.seesaws[1].left.length).toBe(0)  // nothing catapulted
  })
})
