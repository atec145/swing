// Final QA tests for Issue #12 - additional edge cases discovered during review.
import { describe, it, expect } from 'vitest'
import { createBall, dropBall, applyManualDrop } from '../game/logic'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'
import { computeAngle, computeTilt } from '../game/physics'
import { ROCK_WEIGHT, ROCK_MIN_SCORE, MAX_STACK } from '../game/constants'

function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `t-${Math.random()}`, color, variant, weight, kind: 'normal' }
}
function sawball(): Ball {
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
    ballsSinceSawblade: 0, ballsSinceRock: 0,
  }
}

describe('AC: Score threshold prevents rock spawn below 500', () => {
  it('score = 499: never spawns a rock', () => {
    for (let i = 0; i < 5000; i++) {
      const b = createBall(499)
      expect(b.kind).not.toBe('rock')
    }
  })
})

describe('Edge: rock landing on top of normal stack is fine', () => {
  it('dropping a rock on a stack of normal balls works', () => {
    const s = stateWith([
      seesaw([ball('red'), ball('blue'), ball('green')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(4)
    expect(result.state.seesaws[0].left[3].kind).toBe('rock')
  })
})

describe('Edge: rock at bottom of stack', () => {
  it('rock at bottom does not prevent normal matches above when balanced', () => {
    // Build: s0L=[rock,blue,blue], balanced with s0R=red(17).
    // To form a horizontal match at level 0 we need three balanced blue
    // anchors. Use balanced blue+blue seesaws at s1 and s2.
    const s = stateWith([
      seesaw([rock(), ball('blue'), ball('blue')], [
        { id: 'pad-17', color: 'red', variant: 'full', weight: 17, kind: 'normal' },
      ]),
      seesaw([ball('blue')], [ball('blue')]),     // balanced (1=1)
      seesaw([ball('blue')], [ball('blue')]),     // balanced (1=1)
      seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green'))
    const result = dropBall(s, 5, 'left')
    // Bottom row (L=0): null(ROCK), red(17), blue, blue, blue, blue
    // → 4 contiguous blues match → match cascades
    expect(result.matchGroups.length).toBeGreaterThan(0)
    // Rock still at bottom of s0L
    expect(result.state.seesaws[0].left[0].kind).toBe('rock')
    // Two blues above rock are NOT in the bottom row and NOT contiguously
    // adjacent in the stack to a matched ball at s0L bottom (because s0L
    // bottom is the rock, not a matched blue). They should survive.
    // s0L: [rock, blue, blue] — 3 balls
    expect(result.state.seesaws[0].left.length).toBe(3)
  })
})

describe('Edge: dropping a rock when a catapult chain would fire from another seesaw', () => {
  it('rock drop triggers correct catapult based on its own weight', () => {
    // Pre-drop: s0 balanced (left=10, right=10)
    // Drop rock on left → left=25, right=10 → diff=15 > 3 → catapult fires
    const s = stateWith([
      seesaw(
        [{ id: 'L1', color: 'red', variant: 'full', weight: 10, kind: 'normal' }],
        [{ id: 'R1', color: 'red', variant: 'full', weight: 10, kind: 'normal' }],
      ),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    // Catapult should fire — right arm rises (left heavier now)
    expect(result.catapultEvents.length).toBeGreaterThan(0)
    // Right-side ball flies (NOT the rock — rock just landed on left)
    expect(result.catapultEvents[0].ball.color).toBe('red')
    expect(result.catapultEvents[0].ball.kind).toBe('normal')
  })
})

describe('Edge: rock as queued/next ball gets dropped correctly', () => {
  it('rock is the active ball and gets placed', () => {
    const s = stateWith(emptyBoard(), rock())
    const result = dropBall(s, 2, 'right')
    expect(result.state.seesaws[2].right.length).toBe(1)
    expect(result.state.seesaws[2].right[0].kind).toBe('rock')
    expect(result.state.seesaws[2].right[0].weight).toBe(15)
    // The next ball was the queued ball (red w/1)
    expect(result.state.nextBall.color).toBe('red')
  })
})

describe('Sawblade chain: blade does not score for rocks but reports them', () => {
  it('clearedBalls array includes rocks in original order', () => {
    const r1 = rock(), r2 = rock()
    const b1 = ball('red'), b2 = ball('blue')
    const s = stateWith([
      seesaw([r1, b1, r2, b2], []),  // bottom-to-top order
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawball())
    const result = dropBall(s, 0, 'left')
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(4)
    // Order preserved (bottom = index 0 in cleared array)
    expect(result.sawbladeEvent?.clearedBalls[0].id).toBe(r1.id)
    expect(result.sawbladeEvent?.clearedBalls[1].id).toBe(b1.id)
    expect(result.sawbladeEvent?.clearedBalls[2].id).toBe(r2.id)
    expect(result.sawbladeEvent?.clearedBalls[3].id).toBe(b2.id)
  })
})

describe('Rock physics affect catapult chain reactions', () => {
  it('rock landing causes weight imbalance that triggers chain', () => {
    // s0L=[rock] = 15, s0R=[ball(10)] = 10 → s0 currently tilts left (diff 5 > 3).
    // Drop ball(1) on s0R: left=15, right=11. Pre-drop tilt = left. Post-drop tilt = left.
    // No tilt change → no catapult on s0.
    // BUT if pre-drop is balanced and post-drop is tilted, catapult fires.
    // s0L=[ball(10)] = 10, s0R=[ball(10)]=10. Balanced. Drop rock on s0L:
    //   s0L=25, s0R=10 → tilt 'left'. Right arm rises, ball(10) flies.
    const s = stateWith([
      seesaw(
        [{ id: 'L1', color: 'red', variant: 'full', weight: 10, kind: 'normal' }],
        [{ id: 'R1', color: 'blue', variant: 'full', weight: 10, kind: 'normal' }],
      ),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    expect(result.catapultEvents.length).toBeGreaterThanOrEqual(1)
    // Diff after drop = 25-10 = 15. Catapult event diff matches.
    expect(result.catapultEvents[0].diff).toBe(15)
  })
})

describe('Catapult lands a ball on an arm containing a rock', () => {
  it('ball can land on top of an arm with a rock at bottom', () => {
    // Set up: s0 will catapult a ball onto s1. s1 has a rock at bottom.
    // Pre-drop: s0 balanced (ball10 = ball10). Drop ball(5) on s0L → left=15, right=10, diff=5 > 3.
    // Right arm rises, topmost s0R ball (the ball10) flies LEFT by 5 slots.
    // Wait — left heavier means right arm rises → flies LEFT.
    // We want the ball to land on s1, so it must fly RIGHT.
    // Make right heavier instead. s0L=ball(10), s0R=ball(10). Drop ball(5) on s0R.
    // post: left=10, right=15, diff=5 > 3. Left arm rises, top s0L flies RIGHT 5 slots.
    // fromSlot = 0 (s0L), intended = 0+5 = 5 = s2R. Lands on s2R.
    // Adjust: put rock on s2R first.
    const s = stateWith([
      seesaw(
        [{ id: 'L1', color: 'red', variant: 'full', weight: 10, kind: 'normal' }],
        [{ id: 'R1', color: 'blue', variant: 'full', weight: 10, kind: 'normal' }],
      ),
      seesaw([], []),
      seesaw([], [rock()]),
      seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green', 5))
    const result = dropBall(s, 0, 'right')
    // Verify catapult happened
    expect(result.catapultEvents.length).toBeGreaterThanOrEqual(1)
    // Verify the ball landed on top of the rock at s2R
    const s2R = result.state.seesaws[2].right
    expect(s2R.length).toBe(2)
    expect(s2R[0].kind).toBe('rock')
    // Top ball is the catapulted red
    expect(s2R[1].color).toBe('red')
    expect(s2R[1].kind).toBe('normal')
  })
})

describe('AC: Felsblock-Vorschau zeigt korrekten Icon (data correctness)', () => {
  it('queuedBall remains the rock until consumed', () => {
    const s = stateWith(emptyBoard(), ball('blue'))
    s.queuedBall = rock()
    const result = dropBall(s, 0, 'left')
    // After drop: nextBall should be the rock (was queued)
    expect(result.state.nextBall.kind).toBe('rock')
  })
})

describe('Rock-specific edge: dropping into full arm', () => {
  it('cannot drop rock into a full arm; arm stays at MAX_STACK', () => {
    const full = Array.from({ length: MAX_STACK }, () => ball('red'))
    const s = stateWith([
      seesaw(full, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(MAX_STACK)
    // The crane held ball (rock) was NOT consumed — state should be identical
    expect(result.state.nextBall.kind).toBe('rock')
  })
})

describe('Sawblade can target empty arm with rock on opposite side', () => {
  it('clears empty side, leaves the other side intact', () => {
    const r = rock()
    const s = stateWith([
      seesaw([], [r, ball('blue')]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawball())
    const result = dropBall(s, 0, 'left')
    // Left side cleared (was empty)
    expect(result.state.seesaws[0].left.length).toBe(0)
    // Right side untouched
    expect(result.state.seesaws[0].right.length).toBe(2)
    expect(result.state.seesaws[0].right[0].id).toBe(r.id)
    // No score (empty arm cleared)
    expect(result.state.score).toBe(0)
  })
})

describe('AC: BallKind extension is complete', () => {
  it('rock-kind ball has all required fields', () => {
    const r = createBall(ROCK_MIN_SCORE + 100, 0, 0, { kind: 'rock', weight: ROCK_WEIGHT })
    expect(r.kind).toBe('rock')
    expect(r.weight).toBe(15)
    expect(r.id).toBeTruthy()
    expect(r.color).toBeTruthy()  // exists (dummy)
    expect(r.variant).toBe('full')  // exists (dummy)
  })
})

describe('Pure-rock arm scenarios', () => {
  it('arm with only rocks tilts the seesaw correctly (15 vs 0 = left)', () => {
    const s = applyManualDrop(emptyBoard(), 0, 'left', rock())
    expect(s[0].tilt).toBe('left')
  })

  it('mirrored rocks (both sides) → balanced', () => {
    const sw = seesaw([rock()], [rock()])
    expect(sw.tilt).toBe('balanced')
  })

  it('two rocks vs one rock → catapult threshold exceeded (diff 15)', () => {
    const sw = seesaw([rock(), rock()], [rock()])
    expect(sw.tilt).toBe('left')
  })
})
