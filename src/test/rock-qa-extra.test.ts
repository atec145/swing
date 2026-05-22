// Extra QA tests for Issue #12 — rock (Felsblock) covering deeper edge cases.
//
// These augment src/test/rock-qa.test.ts with targeted regression / boundary
// checks added during QA review.
import { describe, it, expect } from 'vitest'
import { createBall, dropBall } from '../game/logic'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'
import { computeAngle, computeTilt } from '../game/physics'
import {
  ROCK_WEIGHT, ROCK_MIN_SCORE, ROCK_PROBABILITY,
  MATCH_MIN, MAX_STACK,
} from '../game/constants'

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
  }
}

// -----------------------------------------------------------------------------
// 1. Match immunity — vertical pass shouldn't extend through rocks
// -----------------------------------------------------------------------------
describe('Vertical match expansion is blocked by a rock', () => {
  it('reds above a rock survive when reds below match horizontally (balanced seesaws)', () => {
    // Layout per seesaw (kept balanced so armOffset=0 across the board):
    //   s0L = [red, red, red, rock, red, red, red]  (3 reds + rock + 3 reds)
    //   s0R = [pad(weight to balance s0L)]
    //   s1L bottom = red, s1R bottom = pad(weight 1)
    //   s2L bottom = red, s2R bottom = pad(weight 1)
    // Bottom physical row 0: s0L=red, s0R=pad-blue, s1L=red, s1R=pad-blue, s2L=red ...
    // Interleaved: red, blue, red, blue, red — no 3-in-a-row → NO match.
    //
    // Instead, build the row so three reds ARE contiguous in the interleaved
    // sequence: s0L=red, s0R=red, s1L=red, s1R=anything.
    // s0L weight = 1+1+1+15+1+1+1 = 21. s0R must = 21 to keep balanced.
    // Cheapest: a single manual ball(21).
    const s = stateWith([
      seesaw(
        [ball('red'), ball('red'), ball('red'), rock(), ball('red'), ball('red'), ball('red')],
        [{ id: 'm-1', color: 'red', variant: 'full', weight: 21, kind: 'normal' }],   // balances s0
      ),
      seesaw([ball('red')], [ball('blue')]),  // balanced (1=1)
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue'))
    const result = dropBall(s, 5, 'left')

    // Bottom row (level 0) interleaved: red, red, red, blue, ... → 3 reds match.
    expect(result.matchGroups.length).toBeGreaterThan(0)
    const s0L = result.state.seesaws[0].left
    // Rock still present
    const rockIdx = s0L.findIndex(b => b.kind === 'rock')
    expect(rockIdx).toBeGreaterThanOrEqual(0)
    // 3 reds ABOVE the rock survive intact (vertical expansion blocked by rock)
    const aboveRock = s0L.slice(rockIdx + 1)
    expect(aboveRock.length).toBe(3)
    expect(aboveRock.every(b => b.kind === 'normal' && b.color === 'red')).toBe(true)
    // The bottom red on s0L (anchor of the horizontal match) is gone, and
    // vertical expansion took the rest of the reds below the rock too.
    // Result: [red, red, rock, red, red, red] reduces to [rock, red, red, red]
    expect(s0L[0].kind).toBe('rock')
  })
})

// -----------------------------------------------------------------------------
// 2. Rock + catapult interaction
// -----------------------------------------------------------------------------
describe('Rock interacts correctly with catapults', () => {
  it('catapult triggered by tilt change near a rock launches the correct (top, non-rock) ball', () => {
    // Pre-drop tilt = 'left' (s0L=[rock]=15, s0R=[blue(1)]=1 → left heavier).
    // Drop ball(20) on s0R: not possible (weight max 10).
    // Use a TILT TRANSITION test:
    // Pre-drop: balanced (s0L=[rock,blue(1)]=16, s0R=[ball(15) hand-crafted]=15+1=16).
    // Actually let's just verify: drop on the LIGHT side of a rock-heavy column
    // with NO transition → no catapult (correct behavior).
    // For a transition: pre-drop balanced (both = 16); drop ball(5) on s0L:
    //   post-drop s0L=21, s0R=16 → left heavier. Tilt: 'balanced' → 'left'.
    //   Right arm rises, topmost s0R ball flies left.
    const s = stateWith([
      seesaw(
        [rock(), ball('blue', 1)],
        [{ id: 'm-x', color: 'red', variant: 'full', weight: 16, kind: 'normal' }],
      ),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('green', 5))
    const result = dropBall(s, 0, 'left')
    // Tilt transition balanced → left → right arm rises → flies the s0R ball.
    expect(result.catapultEvents.length).toBeGreaterThan(0)
    expect(result.catapultEvents[0].ball.kind).not.toBe('rock')
    expect(result.catapultEvents[0].ball.color).toBe('red')
  })

  it('topmost rock CAN be catapulted off (rocks are catapult-eligible)', () => {
    // s0L = [rock] (15), s0R = [] → left heavier, but right arm needs >= 1 ball
    // to rise (rule #3 in processCatapults: rising side must have >= 1 ball).
    // Drop a ball on s0R → right has [ball], left has [rock] → left STILL heavier.
    // Right arm rises but only has the freshly-dropped ball. Topmost RIGHT ball
    // (the dropped ball, not the rock) flies left.
    //
    // To force a rock to fly: s0L = [rock], s0R = [rock] → balanced. Drop a
    // tiny ball on s0L → left becomes (15+1)=16, right=15 → left heavier.
    // BUT diff = 1 which is NOT > CATAPULT_THRESHOLD = 3.
    //
    // So rocks fly only when diff > 3. Construct that:
    // s0L = [rock], s0R = [rock, ball(1)] → balanced left=15 vs right=16.
    // Drop a ball(5) on s0L: left=20 vs right=16 → diff=4 > 3. Right arm rises,
    // top RIGHT ball is the ball(1), which flies — NOT the rock.
    //
    // To make a rock fly: s0R top must be a rock. Try:
    // s0L = [ball(1)], s0R = [rock] → right=15 vs left=1 → right heavier by 14.
    // BUT we need left arm to rise → drop ball on left makes left heavier.
    // Instead, target the rock fro the left side:
    // s0L = [rock], s0R = [ball(20)] cannot exist (max single weight 10).
    //
    // Conclusion: it's HARD to actually launch a rock under normal weight pools.
    // The interesting check is that NOTHING in the code prevents it. Let's
    // construct: s0L = [rock, ball(1)] = 16, s0R = [ball(2), rock] = 17.
    // Initially balanced/right (right is heavier). Drop ball(8) on s0R:
    // s0R = [ball(2), rock, ball(8)] = 25, s0L = 16. Diff = 9 > 3. Left arm
    // rises. Topmost LEFT ball is ball(1) → flies right. Not the rock.
    //
    // Hmm. To launch a rock, the rock must be on top.
    // s0L = [ball(5), rock] = 20, s0R = [ball(1)] = 1. Diff = 19, left already heavier.
    // Drop a ball(1) on s0R: right=2, left=20. Diff=18 > 3, right arm rises.
    // Top right is the freshly dropped ball → flies left. Still not the rock.
    //
    // Use a sequence: pre-drop tilt should be balanced/right, post-drop should
    // make the side with the rock-on-top rise. The rising side topmost = rock.
    //
    // s0L = [ball(7), rock], s0R = [ball(7), ball(8)] → left=22, right=15.
    // diff=7, left heavier. Drop ball(1) on s0R: right=16, left=22. STILL left heavier.
    // Right rises, top right (ball(8)) flies. Still not the rock.
    //
    // s0L = [rock, ball(8)], s0R = [ball(1)] → left=23, right=1.
    // Drop ball(1) on s0L: left=24, right=1. Already left heavier. We need a
    // TRANSITION. Initial state must NOT be left-heavier.
    //
    // s0L = [rock], s0R = [ball(8), ball(8)] → left=15, right=16. Right heavier.
    // Drop ball(2) on s0L: left=17, right=16. diff=1 → NOT > 3. No catapult.
    // Drop ball(5) on s0L: left=20, right=16. diff=4 > 3. left becomes heavier.
    // Right arm rises. Top right = ball(8) → flies left. Rock still not flying.
    //
    // Only way: put the rock on the RISING side as topmost.
    // After drop, rising side = opposite of the heavier side.
    // To have a rock on the rising side as topmost, the rock must be on the
    // LIGHTER side. But if the rock is on the lighter side it tends to MAKE
    // that side heavier. The only way: rock on light side AND total weight
    // there is still lower than the other side.
    //
    // s0L = [rock], s0R = [ball(10), ball(10)] → left=15, right=20. Right heavier.
    // Drop ball(1) on s0R: left=15, right=21. Already right heavier, diff was 5,
    // now 6 — wait, pre-drop was right heavier (diff 5), post-drop right heavier (diff 6).
    // Same tilt direction → no transition → no catapult.
    //
    // Pre-drop must be balanced or different tilt. s0L = [rock] = 15, s0R = [] = 0.
    // Pre-drop: left heavier. Drop ball(10) on s0R: right=10. Left still heavier (15>10).
    // No tilt change. Drop ball(10) twice (impossible, one drop only).
    //
    // Try: s0L = [], s0R = [rock]. Pre-drop right heavier by 15. Drop a ball on s0L:
    // ball(5) → left=5, right=15. Still right heavier. ball(15+) impossible.
    //
    // s0L = [rock], s0R = [rock]. Balanced. Drop ball(5) on s0R: right=20, left=15.
    // Right heavier, diff=5 > 3. Left arm rises. Top LEFT = rock → flies right!
    const s = stateWith([
      seesaw([rock()], [rock()]),  // balanced
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue', 5))
    const result = dropBall(s, 0, 'right')
    expect(result.catapultEvents.length).toBeGreaterThan(0)
    // The flung ball IS the rock (top of rising left arm)
    expect(result.catapultEvents[0].ball.kind).toBe('rock')
  })
})

// -----------------------------------------------------------------------------
// 3. Sawblade clearing — edge cases
// -----------------------------------------------------------------------------
describe('Sawblade vs rock — comprehensive', () => {
  it('sawblade on empty arm with no rocks: score 0, no exception', () => {
    const s = stateWith([
      seesaw([], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawball())
    const result = dropBall(s, 0, 'left')
    expect(result.state.score).toBe(0)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(0)
  })

  it('sawblade clears all 8 rocks in a full arm at once', () => {
    const arm = [rock(), rock(), rock(), rock(), rock(), rock(), rock(), rock()]
    const s = stateWith([
      seesaw(arm, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawball())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(0)
    expect(result.state.score).toBe(0)  // all rocks = 0 pts
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(8)
  })

  it('sawblade scoring is correct on mixed arm (4 normal + 3 rocks)', () => {
    const s = stateWith([
      seesaw([ball('red'), rock(), ball('blue'), rock(), ball('green'), rock(), ball('navy')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawball())
    const result = dropBall(s, 0, 'left')
    // 4 normal × 10 = 40; rocks = 0
    expect(result.state.score).toBe(40)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(7)
  })
})

// -----------------------------------------------------------------------------
// 4. Spawn probability sanity
// -----------------------------------------------------------------------------
describe('Spawn probability behaviour', () => {
  it('exactly at threshold (score = ROCK_MIN_SCORE) can spawn rocks', () => {
    let rocks = 0
    for (let i = 0; i < 5000; i++) {
      const b = createBall(ROCK_MIN_SCORE)
      if (b.kind === 'rock') rocks++
    }
    // Expected ~5000 * ROCK_PROBABILITY (independent of sawblade roll above
    // ROCK_MIN_SCORE = 500, where sawblade is also enabled at 0.035).
    // Effective rock spawn = (1 - 0.035) * 0.04 ≈ 0.0386.
    // Expected ~193 over 5000.
    expect(rocks).toBeGreaterThan(80)
    expect(rocks).toBeLessThan(400)
  })

  it('at boundary score - 1: no rocks', () => {
    for (let i = 0; i < 3000; i++) {
      const b = createBall(ROCK_MIN_SCORE - 1)
      expect(b.kind).not.toBe('rock')
    }
  })

  it('rock and sawblade are mutually exclusive in a single createBall call', () => {
    // Sawblade roll fires first; if it succeeds, the rock roll is skipped.
    // Sanity: spawn many balls; if any ball is both kinds simultaneously we fail.
    // (BallKind is a string union — impossible by type. Verifies the runtime
    // matches the type contract.)
    for (let i = 0; i < 2000; i++) {
      const b = createBall(ROCK_MIN_SCORE + 100)
      expect(['normal', 'sawblade', 'rock']).toContain(b.kind)
    }
  })

  it('rock has weight exactly equal to ROCK_WEIGHT (15)', () => {
    let rocks = 0
    for (let i = 0; i < 10000 && rocks < 50; i++) {
      const b = createBall(ROCK_MIN_SCORE + 100)
      if (b.kind === 'rock') {
        expect(b.weight).toBe(15)
        rocks++
      }
    }
    expect(rocks).toBeGreaterThan(0)
  })
})

// -----------------------------------------------------------------------------
// 5. Match scan robustness around rocks
// -----------------------------------------------------------------------------
describe('Match scan robustness', () => {
  it('long horizontal row split by a rock: only the longest contiguous run matches', () => {
    // Plan an interleaved-row sequence: [s0L, s0R, s1L, s1R, s2L, s2R, ...]
    // Want: red, red, ROCK, red, red, red
    // → s0L=red, s0R=red, s1L=rock, s1R=red, s2L=red, s2R=red
    // The 3-red run on the right of the rock should match; the 2-red run on the
    // left should not. All seesaws balanced so armOffset=0 (matched at level 0).
    const s = stateWith([
      seesaw([ball('red')], [ball('red')]),       // balanced (1=1)
      seesaw([rock()], [ball('red')]),            // s1L=rock(15), s1R=red(1) → right heavier — armOffset for left is +1
      // We need s1 balanced so the rock sits at level 0 and the row interleaves.
      // Set s1R such that weights balance: s1L=15, s1R=red(?)... we need exactly 15.
      // ball('red', 15) — but WEIGHT_POOL maxes at 10. For the test we can use
      // a hand-crafted ball with weight 15.
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue'))
    // Replace seesaw 1 with a manual balanced pair (rock + ball with weight 15)
    s.seesaws[1] = seesaw(
      [rock()],
      [{ id: 'manual-1', color: 'red', variant: 'full', weight: 15, kind: 'normal' }],
    )
    s.seesaws[2] = seesaw([ball('red')], [ball('red')])  // balanced (1=1)

    // Drop somewhere out of the way → triggers match scan.
    const result = dropBall(s, 5, 'left')
    // The interleaved row at level 0:
    //   s0L=red s0R=red s1L=ROCK→null s1R=red(weight15) s2L=red s2R=red
    // After the rock-as-null gap, the sequence is: red,red,null,red,red,red,red
    // First run = 2 reds (< 3) → no match. Second run = 4 reds (>= 3) → match.
    expect(result.matchGroups.length).toBeGreaterThan(0)
    // The 2 left-side reds (s0L, s0R) survive
    expect(result.state.seesaws[0].left.length).toBe(1)
    expect(result.state.seesaws[0].right.length).toBe(1)
    // The rock survives
    expect(result.state.seesaws[1].left.length).toBe(1)
    expect(result.state.seesaws[1].left[0].kind).toBe('rock')
    // The matched 4-red run is gone (s1R, s2L, s2R, and one more — actually
    // there are only 4 reds in that contiguous run; all should be cleared)
    expect(result.state.seesaws[1].right.length).toBe(0)
    expect(result.state.seesaws[2].left.length).toBe(0)
    expect(result.state.seesaws[2].right.length).toBe(0)
  })
})

// -----------------------------------------------------------------------------
// 6. Game-over scenarios involving rocks
// -----------------------------------------------------------------------------
describe('Game-over with rocks', () => {
  it('mixed arm reaching MAX_STACK with a rock at the top causes game-over', () => {
    const arm = [
      ball('red'), ball('blue'), ball('green'), ball('navy'),
      ball('gray'), ball('orange'), ball('yellow'),
    ]
    const s = stateWith([
      seesaw(arm, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(MAX_STACK)
    expect(result.state.phase).toBe('gameover')
  })

  it('dropping ANY ball after game-over is a no-op', () => {
    const s = stateWith(emptyBoard(), rock())
    s.phase = 'gameover'
    const result = dropBall(s, 0, 'left')
    expect(result.state).toBe(s)  // identical reference
    expect(result.state.seesaws[0].left.length).toBe(0)
  })

  it('cannot drop into a full arm (max stack honored even for rocks)', () => {
    const arm = Array.from({ length: MAX_STACK }, () => ball('red'))
    const s = stateWith([
      seesaw(arm, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], rock())
    const result = dropBall(s, 0, 'left')
    // Should return unchanged state — drop refused
    expect(result.state.seesaws[0].left.length).toBe(MAX_STACK)
    // Rock is NOT added
    expect(result.state.seesaws[0].left.every(b => b.kind !== 'rock')).toBe(true)
  })
})

// -----------------------------------------------------------------------------
// 7. Rock identity & determinism
// -----------------------------------------------------------------------------
describe('Rock identity & determinism', () => {
  it('every created rock has a unique id', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const r = createBall(ROCK_MIN_SCORE + 100, { kind: 'rock' })
      ids.add(r.id)
    }
    expect(ids.size).toBe(200)
  })

  it('rock kind is preserved through dropBall', () => {
    const s = stateWith(emptyBoard(), rock())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left[0].kind).toBe('rock')
    expect(result.state.seesaws[0].left[0].weight).toBe(15)
  })
})

// -----------------------------------------------------------------------------
// 8. MATCH_MIN sanity around rocks (regression for #7-like bug)
// -----------------------------------------------------------------------------
describe('No false matches involving rocks', () => {
  it('three rocks in a row do NOT match each other (each has a unique matchKey)', () => {
    // Row 0: s0L, s0R, s1L all = rocks. Without proper handling they could chain
    // (e.g. matchKey === 'rock' for all). Verify they survive.
    const s = stateWith([
      seesaw([rock()], [rock()]),  // balanced (15=15)
      seesaw([rock()], [{ id: 'pad-1', color: 'blue', variant: 'full', weight: 15, kind: 'normal' }]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], ball('blue'))
    const result = dropBall(s, 5, 'left')
    // All 3 rocks still present
    expect(result.state.seesaws[0].left[0].kind).toBe('rock')
    expect(result.state.seesaws[0].right[0].kind).toBe('rock')
    expect(result.state.seesaws[1].left[0].kind).toBe('rock')
  })
})
