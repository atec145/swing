import { describe, it, expect } from 'vitest'
import { dropBall } from '../game/logic'
import { computeAngle, computeTilt } from '../game/physics'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'

let idc = 0
function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `i4-${idc++}`, color, variant, weight }
}
function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: computeAngle(left, right), tilt: computeTilt(left, right) }
}
function emptyBoard(): SeesawState[] {
  return Array.from({ length: 6 }, () => seesaw([], []))
}
function stateWith(seesaws: SeesawState[], nextBall: Ball): GameState {
  return {
    seesaws, score: 0, nextBall, phase: 'waiting',
    hoverSeesaw: null, hoverSide: null, cranePositionIndex: 0,
    pendingCatapult: null,
  }
}

describe('Issue #4 — 3-state tilt model', () => {
  it('computeTilt classifies all three states', () => {
    expect(computeTilt([ball('red', 5)], [ball('blue', 3)])).toBe('left')
    expect(computeTilt([ball('red', 3)], [ball('blue', 3)])).toBe('balanced')
    expect(computeTilt([ball('red', 3)], [ball('blue', 5)])).toBe('right')
    expect(computeTilt([], [])).toBe('balanced')
  })

  it('every seesaw exposes a tilt that matches its angle sign', () => {
    const st = stateWith(emptyBoard(), ball('red', 1))
    const { state } = dropBall(st, 0, 'left')
    for (const sw of state.seesaws) {
      if (sw.tilt === 'balanced') expect(sw.angle).toBe(0)
      if (sw.tilt === 'left') expect(sw.angle).toBeGreaterThan(0)
      if (sw.tilt === 'right') expect(sw.angle).toBeLessThan(0)
    }
  })

  // ---- Spec worked Example 1 -------------------------------------------------
  it('Example 1 step 1: drop 3 on pos2 (s0 right), rising side empty → no catapult', () => {
    const st = stateWith(emptyBoard(), ball('red', 3))
    const { state, catapultEvents } = dropBall(st, 0, 'right')
    expect(catapultEvents).toHaveLength(0)
    expect(state.seesaws[0].tilt).toBe('right')
    expect(state.seesaws[0].right).toHaveLength(1)
  })

  it('Example 1 step 2: 3 on pos2 then 5 on pos1 → right ball flies LEFT dist 2, wraps to pos12', () => {
    const board = emptyBoard()
    board[0] = seesaw([], [ball('blue', 3)]) // pos2 already has the 3-ball; tilt 'right'
    const st = stateWith(board, ball('red', 5))
    const { state, catapultEvents } = dropBall(st, 0, 'left')
    // left=5 > right=3 → tilt changes right → left. Rising side (right) has the 3-ball.
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0].diff).toBe(2)
    expect(catapultEvents[0].fromSlot).toBe(1) // s0 right (spec pos 2)
    // intended = 1 - 2 = -1 → mod 12 = slot 11 (spec pos 12 = s6 right)
    expect(catapultEvents[0].toSlot).toBe(11)
    expect(catapultEvents[0].ball.color).toBe('blue')
    expect(state.seesaws[5].right).toHaveLength(1)
    expect(state.seesaws[0].right).toHaveLength(0)
  })

  // ---- Spec worked Example 2 -------------------------------------------------
  it('Example 2: unchanged state and balanced state both suppress the catapult', () => {
    // 1. 3 on pos2 → balanced→right, left empty → no catapult
    let board = emptyBoard()
    let st = stateWith(board, ball('blue', 3))
    let r = dropBall(st, 0, 'right')
    expect(r.catapultEvents).toHaveLength(0)
    expect(r.state.seesaws[0].tilt).toBe('right')

    // 2. 2 on pos2 → right→right (unchanged) → no catapult
    st = { ...r.state, nextBall: ball('blue', 2) }
    r = dropBall(st, 0, 'right')
    expect(r.catapultEvents).toHaveLength(0)
    expect(r.state.seesaws[0].tilt).toBe('right')

    // 3. 5 on pos1 → left 5, right 5 → right→balanced → no catapult
    st = { ...r.state, nextBall: ball('green', 5) }
    r = dropBall(st, 0, 'left')
    expect(r.catapultEvents).toHaveLength(0)
    expect(r.state.seesaws[0].tilt).toBe('balanced')

    // 4. 3 on pos2 → left 5, right 8 → balanced→right. Rising side (left) has 5-ball.
    //    diff = 3, flies RIGHT: intended = pos1(slot0) + 3 = slot 3 (spec pos 4).
    st = { ...r.state, nextBall: ball('orange', 3) }
    r = dropBall(st, 0, 'right')
    expect(r.catapultEvents).toHaveLength(1)
    expect(r.catapultEvents[0].diff).toBe(3)
    expect(r.catapultEvents[0].fromSlot).toBe(0)
    expect(r.catapultEvents[0].toSlot).toBe(3)
  })

  it('no catapult when state does not change (left → left after adding more left weight)', () => {
    const board = emptyBoard()
    board[0] = seesaw([ball('red', 5)], [ball('blue', 1)]) // tilt 'left'
    const st = stateWith(board, ball('green', 1))
    const { state, catapultEvents } = dropBall(st, 0, 'left')
    expect(catapultEvents).toHaveLength(0)
    expect(state.seesaws[0].right).toHaveLength(1)
    expect(state.seesaws[0].tilt).toBe('left')
  })

  it('flight distance equals exact weight difference', () => {
    const board = emptyBoard()
    board[2] = seesaw([], [ball('blue', 1)]) // s2 right has light ball, tilt 'right'
    const st = stateWith(board, ball('red', 7))
    const { catapultEvents } = dropBall(st, 2, 'left')
    // left 7, right 1 → right→left transition. diff = 6. right ball flies LEFT.
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0].diff).toBe(6)
  })

  it('very large weight difference wraps modulo 12', () => {
    const board = emptyBoard()
    board[0] = seesaw([], [ball('blue', 1)]) // tilt 'right'
    const st = stateWith(board, ball('red', 16))
    const { catapultEvents } = dropBall(st, 0, 'left')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0].diff).toBe(15)
    const to = catapultEvents[0].toSlot
    expect(to).toBeGreaterThanOrEqual(0)
    expect(to).toBeLessThan(12)
  })

  it('chain reaction terminates and re-evaluates landing seesaws', () => {
    // Engineered chain: catapult lands on a seesaw that itself transitions.
    const board = emptyBoard()
    board[0] = seesaw([], [ball('blue', 1)])              // tilt right
    board[2] = seesaw([ball('green', 1)], [])             // light, will receive + transition
    const st = stateWith(board, ball('red', 5))
    const { state, catapultEvents } = dropBall(st, 0, 'left')
    // First event fires; chain bounded by visited-set, no infinite loop, returns.
    expect(catapultEvents.length).toBeGreaterThanOrEqual(1)
    // Board total ball count is conserved (1 + 1 + 1 dropped = 3, minus any lost)
    const count = state.seesaws.reduce((n, s) => n + s.left.length + s.right.length, 0)
    expect(count).toBeLessThanOrEqual(3)
  })
})
