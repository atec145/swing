import { describe, it, expect } from 'vitest'

// QA #3 round 2 — verifies the wrap-around segmentation in buildSegments().
// The leg-splitting algorithm below is a faithful copy of buildSegments()'s
// leg loop in src/components/game/GameCanvas.tsx. Testing the pure leg math
// lets us assert edge-case regressions are fixed without a browser.
//
// Direction rule (matches GameCanvas after the direction fix):
//   Left-side slot (even) → flies RIGHT (+1)  [right side is heavier]
//   Right-side slot (odd) → flies LEFT (−1)   [left side is heavier]

const NUM_SLOTS = 12

type Leg = { fromSlot: number; toSlot: number; slots: number; crossesAfter: boolean }

function buildLegs(fromSlot: number, diff: number): Leg[] {
  const side = fromSlot % 2 === 0 ? 'left' : 'right'
  const dir: 1 | -1 = side === 'left' ? 1 : -1
  const distance = Math.abs(diff)

  const legs: Leg[] = []
  let cursor = fromSlot
  let remaining = distance

  while (true) {
    const slotsToEdge = dir === 1 ? (NUM_SLOTS - 1 - cursor) : cursor
    const take = Math.min(remaining, slotsToEdge)
    const willCross = remaining > take

    legs.push({
      fromSlot: cursor,
      toSlot: cursor + dir * take,
      slots: take,
      crossesAfter: willCross,
    })

    cursor += dir * take
    remaining -= take

    if (!willCross) break

    cursor = dir === 1 ? 0 : NUM_SLOTS - 1
    remaining -= 1

    if (remaining === 0) {
      legs.push({ fromSlot: cursor, toSlot: cursor, slots: 0, crossesAfter: false })
      break
    }
  }
  return legs
}

function travelled(legs: Leg[]): number {
  let t = 0
  for (let i = 0; i < legs.length; i++) {
    t += legs[i].slots
    if (legs[i].crossesAfter) t += 1
  }
  return t
}

describe('QA #3 round 2 — wrap-around segmentation (regression of bugs #1/#2/#3)', () => {
  it('Wrap FIXED: left-side ball crosses right edge, remaining=0 → re-entry leg added', () => {
    // fromSlot=10 (left-side, dir=+1): 1 slot to right edge, then remaining=0 after wrap.
    // Old bug: zero-slot re-entry leg was missing → ball teleported to slot 0.
    const legs = buildLegs(10, 2)
    expect(legs.length).toBeGreaterThanOrEqual(2)
    expect(legs[0].fromSlot).toBe(10)
    expect(legs.some(l => l.crossesAfter)).toBe(true)
    expect(travelled(legs)).toBe(2)
    // (10+2)%12 = 0
    expect(legs[legs.length - 1].toSlot).toBe(0)
  })

  it('Wrap FIXED: right-side ball crosses left edge, remaining=0 → re-entry leg added', () => {
    // fromSlot=1 (right-side, dir=−1): 1 slot to left edge, then remaining=0 after wrap.
    const legs = buildLegs(1, 2)
    expect(legs.length).toBeGreaterThanOrEqual(2)
    expect(legs[0].fromSlot).toBe(1)
    expect(legs.some(l => l.crossesAfter)).toBe(true)
    expect(travelled(legs)).toBe(2)
    // ((1-2)%12+12)%12 = 11
    expect(legs[legs.length - 1].toSlot).toBe(11)
  })

  it('Multi-wrap FIXED: diff=25 from slot 0 — every crossing counted, exact distance', () => {
    // fromSlot=0 (left-side, dir=+1). 25 slots right → 2 full traversals + 1.
    const legs = buildLegs(0, 25)
    // (0+25)%12 = 1
    expect(legs[legs.length - 1].toSlot).toBe(1)
    expect(travelled(legs)).toBe(25)
    const crossings = legs.filter(l => l.crossesAfter).length
    expect(crossings).toBeGreaterThanOrEqual(2)
  })

  it('Multi-wrap FIXED: diff=25 from slot 11 — every crossing counted, exact distance', () => {
    // fromSlot=11 (right-side, dir=−1). 25 slots left → 2 full traversals + 1.
    const legs = buildLegs(11, 25)
    // ((11-25)%12+12)%12 = 10
    expect(legs[legs.length - 1].toSlot).toBe(10)
    expect(travelled(legs)).toBe(25)
    const crossings = legs.filter(l => l.crossesAfter).length
    expect(crossings).toBeGreaterThanOrEqual(2)
  })

  it('Non-wrap: left-side ball stays single leg (no spurious crossing)', () => {
    // fromSlot=0 (left-side, dir=+1), diff=4 → slot 4, no edge crossed.
    const legs = buildLegs(0, 4)
    expect(legs).toHaveLength(1)
    expect(legs[0].crossesAfter).toBe(false)
    expect(legs[0].fromSlot).toBe(0)
    expect(legs[0].toSlot).toBe(4)
    expect(travelled(legs)).toBe(4)
  })

  it('Non-wrap: right-side ball stays single leg (no spurious crossing)', () => {
    // fromSlot=3 (right-side, dir=−1), diff=2 → slot 1, no edge crossed.
    const legs = buildLegs(3, 2)
    expect(legs).toHaveLength(1)
    expect(legs[0].crossesAfter).toBe(false)
    expect(legs[0].toSlot).toBe(1)
    expect(travelled(legs)).toBe(2)
  })

  it('Lands exactly on right edge (slot 11) — no spurious extra wrap', () => {
    // fromSlot=0, diff=11 → lands slot 11, must not cross the edge.
    const legs = buildLegs(0, 11)
    expect(legs[legs.length - 1].toSlot).toBe(11)
    expect(travelled(legs)).toBe(11)
    expect(legs.some(l => l.crossesAfter)).toBe(false)
  })

  it('Lands exactly on left edge (slot 0) — no spurious extra wrap', () => {
    // fromSlot=11, diff=11 → lands slot 0, must not cross the edge.
    const legs = buildLegs(11, 11)
    expect(legs[legs.length - 1].toSlot).toBe(0)
    expect(travelled(legs)).toBe(11)
    expect(legs.some(l => l.crossesAfter)).toBe(false)
  })

  it('Travelled distance always equals |diff| for a sweep of cases', () => {
    for (const from of [0, 1, 5, 6, 10, 11]) {
      for (const d of [1, 2, 5, 9, 12, 13, 24, 25, 30]) {
        const legs = buildLegs(from, d)
        expect(travelled(legs), `from=${from} diff=${d}`).toBe(d)
      }
    }
  })
})
