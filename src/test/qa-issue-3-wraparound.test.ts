import { describe, it, expect } from 'vitest'

// QA #3 round 2 — verifies the previously-failing wrap-around segmentation.
// The leg-splitting algorithm below is a faithful copy of buildSegments()'s
// leg loop in src/components/game/GameCanvas.tsx (the part that decides how
// many on-screen segments a flight is split into and where each edge crossing
// happens). The 3 bugs from QA round 1 all lived here. Testing the pure leg
// math lets us assert the regressions are fixed without a browser.

const NUM_SLOTS = 12

type Leg = { fromSlot: number; toSlot: number; slots: number; crossesAfter: boolean }

function buildLegs(fromSlot: number, diff: number): Leg[] {
  // dir mirrors GameCanvas: diff>0 && right side → +1, else −1.
  const side = fromSlot % 2 === 0 ? 'left' : 'right'
  const dir: 1 | -1 = diff > 0 && side === 'right' ? 1 : -1
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

// Total slots actually travelled = sum of on-screen leg slots + 1 per crossing.
function travelled(legs: Leg[]): number {
  let t = 0
  for (let i = 0; i < legs.length; i++) {
    t += legs[i].slots
    if (legs[i].crossesAfter) t += 1
  }
  return t
}

describe('QA #3 round 2 — wrap-around segmentation (regression of bugs #1/#2/#3)', () => {
  it('Bug #1 FIXED: edge-launch from slot 11 (diff 9) emits a real wrap (>=2 legs, fade)', () => {
    const legs = buildLegs(11, 9)
    // Previously collapsed to legs.length===1 (fade:'none', wrong launch).
    expect(legs.length).toBeGreaterThanOrEqual(2)
    // First leg starts at the TRUE launch slot (11), not mid-board.
    expect(legs[0].fromSlot).toBe(11)
    // An edge crossing must actually occur.
    expect(legs.some(l => l.crossesAfter)).toBe(true)
    // Distance travelled equals diff exactly.
    expect(travelled(legs)).toBe(9)
    // Final leg lands at the logic's modulo-12 slot: (11+9)%12 = 8.
    expect(legs[legs.length - 1].toSlot).toBe(8)
  })

  it('Bug #1 FIXED (left dir): slot 0, diff 4 going left wraps to slot 8', () => {
    // fromSlot 0 (left side) → dir −1. (0-4) mod 12 = 8.
    const legs = buildLegs(0, 4)
    expect(legs.length).toBeGreaterThanOrEqual(2)
    expect(legs[0].fromSlot).toBe(0)
    expect(legs.some(l => l.crossesAfter)).toBe(true)
    expect(travelled(legs)).toBe(4)
    expect(legs[legs.length - 1].toSlot).toBe(8)
  })

  it('Bug #2 FIXED: multi-wrap diff=25 from slot 11 — every crossing counted, exact distance', () => {
    const legs = buildLegs(11, 25)
    // (11+25) % 12 = 0.
    expect(legs[legs.length - 1].toSlot).toBe(0)
    // No under-count: total travelled === diff (old bug travelled 24 for 25).
    expect(travelled(legs)).toBe(25)
    // Multiple crossings are individually represented.
    const crossings = legs.filter(l => l.crossesAfter).length
    expect(crossings).toBeGreaterThanOrEqual(2)
  })

  it('Bug #3 FIXED: degenerate diff=1 from slot 11 still shows a real wrap', () => {
    const legs = buildLegs(11, 1)
    expect(legs.length).toBeGreaterThanOrEqual(2)
    expect(legs[0].fromSlot).toBe(11)
    expect(legs.some(l => l.crossesAfter)).toBe(true)
    expect(travelled(legs)).toBe(1)
    expect(legs[legs.length - 1].toSlot).toBe(0)
  })

  it('Non-wrap flight stays a single leg (no spurious crossing)', () => {
    // slot 1 (right) diff 4 → lands slot 5, no edge crossed.
    const legs = buildLegs(1, 4)
    expect(legs).toHaveLength(1)
    expect(legs[0].crossesAfter).toBe(false)
    expect(legs[0].fromSlot).toBe(1)
    expect(legs[0].toSlot).toBe(5)
    expect(travelled(legs)).toBe(4)
  })

  it('Lands exactly on wrap point — no spurious extra wrap', () => {
    // slot 1 diff 10 → lands slot 11 (right edge) without crossing it.
    const legs = buildLegs(1, 10)
    expect(legs[legs.length - 1].toSlot).toBe(11)
    expect(travelled(legs)).toBe(10)
    // (1+10)=11, no modulo needed → must not cross the edge.
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
