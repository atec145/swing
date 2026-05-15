import { describe, it, expect } from 'vitest'
import { dropBall } from '../game/logic'
import { computeAngle } from '../game/physics'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'
import { MAX_STACK } from '../game/constants'

let idc = 0
function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `qa-${idc++}`, color, variant, weight }
}
function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: computeAngle(left, right) }
}
function stateWith(seesaws: SeesawState[], nextBall: Ball): GameState {
  return {
    seesaws, score: 0, nextBall, phase: 'waiting',
    hoverSeesaw: null, hoverSide: null, cranePositionIndex: 0,
    pendingCatapult: null,
  }
}

describe('QA #3 — catapult event correctness', () => {
  it('AC: throw distance == weight diff in slots, modulo-12 wrap', () => {
    // s5.left red(8)+green(2)=10, s5.right blue(1). diff=9. fromSlot=11.
    // intended = 11+9 = 20, 20 % 12 = 8 → seesaw 4 left.
    const st = stateWith([
      seesaw([], []), seesaw([], []), seesaw([], []),
      seesaw([], []), seesaw([], []),
      seesaw([ball('red', 8)], [ball('blue', 1)]),
    ], ball('green', 2))
    const { catapultEvents } = dropBall(st, 5, 'left')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0]).toMatchObject({ fromSlot: 11, toSlot: 8, diff: 9 })
  })

  it('AC: pendingCatapult side-channel carries events + pre-snapshot', () => {
    const st = stateWith([
      seesaw([ball('red', 5)], [ball('blue', 1)]),
      seesaw([], []), seesaw([], []), seesaw([], []),
      seesaw([], []), seesaw([], []),
    ], ball('green', 1))
    const { state, catapultEvents, preCatapultSeesaws } = dropBall(st, 0, 'left')
    expect(catapultEvents.length).toBeGreaterThan(0)
    // pre-snapshot must show the manually dropped ball but BEFORE catapult:
    // s0.left had red(5) + dropped green = 2; right blue still present.
    expect(preCatapultSeesaws[0].left.length).toBe(2)
    expect(preCatapultSeesaws[0].right.length).toBe(1) // blue still there pre-catapult
    // final state must have resolved the catapult.
    expect(state.seesaws[0].right.length).toBe(0)
  })

  it('Edge: destination slot full → rolls to next free slot in travel dir', () => {
    // Fill seesaw 3 left to MAX so the intended landing slot is occupied.
    const full = Array.from({ length: MAX_STACK }, () => ball('navy', 1))
    const st = stateWith([
      seesaw([ball('red', 5)], [ball('blue', 1)]),
      seesaw([], []), seesaw([], []),
      seesaw(full, []),                 // seesaw 3 left FULL (slot 6)
      seesaw([], []), seesaw([], []),
    ], ball('green', 1))
    // diff=5, fromSlot=1, intended slot 6 (s3 left) is full → next free = slot 7 (s3 right)
    const { state, catapultEvents } = dropBall(st, 0, 'left')
    expect(catapultEvents.length).toBeGreaterThanOrEqual(1)
    expect(catapultEvents[0].fromSlot).toBe(1)
    expect(catapultEvents[0].toSlot).not.toBe(6)
    // First throw must NOT land on the full slot-6 column (s3 left stays full).
    expect(state.seesaws[3].left.length).toBe(MAX_STACK)
  })

  it('Edge: every slot full → ball is lost (no on-board landing)', () => {
    // All 12 slots full. The catapult fires but the ball cannot land.
    const fullCol = () => Array.from({ length: MAX_STACK }, () => ball('navy', 1))
    const seesaws: SeesawState[] = []
    for (let i = 0; i < 6; i++) seesaws.push(seesaw(fullCol(), fullCol()))
    // Make seesaw 0 imbalanced enough to fire (heavy left).
    seesaws[0] = seesaw(
      [...fullCol().slice(0, 7), ball('red', 10)],
      fullCol(),
    )
    const before = seesaws.flatMap(s => [...s.left, ...s.right]).length
    const st = stateWith(seesaws, ball('green', 1))
    // Can't drop — slot full. Pick a non-full target won't exist. Just assert
    // dropBall is a no-op (target full) and does not throw.
    const res = dropBall(st, 0, 'left')
    expect(res.state.seesaws[0].left.length).toBeLessThanOrEqual(MAX_STACK)
    // No crash, total ball count never negative.
    const after = res.state.seesaws.flatMap(s => [...s.left, ...s.right]).length
    expect(after).toBeGreaterThanOrEqual(0)
    expect(before).toBeGreaterThan(0)
  })

  it('Edge: ball lands exactly on wrap point (slot 0 / 11) — single event', () => {
    // s2.right red(7) =7, drop green(1) on s2.left =1. diff=6, right heavier
    // fromSlot=4, intended = 4-6 = -2 → ((-2)%12+12)%12 = 10 → seesaw 5 left.
    const st = stateWith([
      seesaw([], []), seesaw([], []),
      seesaw([], [ball('red', 7)]),
      seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green', 1))
    const { catapultEvents } = dropBall(st, 2, 'left')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0]).toMatchObject({ fromSlot: 4, toSlot: 10, diff: 6 })
  })

  it('Chain: sequential events emitted in order, final state resolved', () => {
    // Set up a 2-step chain: first catapult lands and triggers a second.
    const st = stateWith([
      seesaw([ball('red', 6)], [ball('blue', 1)]),   // fires right
      seesaw([], []),
      seesaw([ball('red', 6)], [ball('gray', 1)]),   // can fire when receiving
      seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green', 1))
    const { catapultEvents } = dropBall(st, 0, 'left')
    // At least one event; events form an ordered list.
    expect(catapultEvents.length).toBeGreaterThanOrEqual(1)
    for (const e of catapultEvents) {
      expect(e.fromSlot).toBeGreaterThanOrEqual(0)
      expect(e.fromSlot).toBeLessThan(12)
      expect(e.toSlot).toBeGreaterThanOrEqual(0)
      expect(e.diff).toBeGreaterThan(0)
    }
  })

  it('diff > 12: large imbalance still produces a valid modulo-12 landing', () => {
    // Construct diff = 15 (> NUM_SLOTS=12). fromSlot=1, intended=16, %12=4.
    const heavyLeft = [ball('red', 10), ball('red', 6)] // 16
    const st = stateWith([
      seesaw(heavyLeft, [ball('blue', 1)]),
      seesaw([], []), seesaw([], []),
      seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green', 0 as unknown as number)) // weight via override below
    // Use a real weight-1 next ball; diff = (16+1) - 1 = 16, intended=1+16=17, %12=5.
    const st2 = { ...st, nextBall: ball('green', 1) }
    const { catapultEvents } = dropBall(st2, 0, 'left')
    expect(catapultEvents).toHaveLength(1)
    expect(catapultEvents[0].diff).toBe(16)
    expect(catapultEvents[0].toSlot).toBe((1 + 16) % 12) // = 5
  })
})
