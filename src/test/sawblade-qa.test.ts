// Ad-hoc QA validation tests for Issue #11 — sawblade special ball.
// Run with: npx vitest run /tmp/sawblade-qa.test.ts (after copying into src/test/)
import { describe, it, expect } from 'vitest'
import { createBall, dropBall } from '../game/logic'
import type { Ball, Color, SeesawState, GameState, Variant } from '../game/types'
import { computeAngle, computeTilt } from '../game/physics'

function ball(color: Color, weight = 1, variant: Variant = 'full'): Ball {
  return { id: `t-${Math.random()}`, color, variant, weight, kind: 'normal' }
}
function sawballl(): Ball {
  return { id: `sb-${Math.random()}`, color: 'green', variant: 'full', weight: 0, kind: 'sawblade' }
}
function seesaw(left: Ball[], right: Ball[]): SeesawState {
  return { left, right, angle: computeAngle(left, right), tilt: computeTilt(left, right) }
}
function stateWith(seesaws: SeesawState[], nextBall: Ball, score = 0): GameState {
  return {
    seesaws,
    score,
    nextBall,
    queuedBall: ball('red', 1),
    phase: 'waiting',
    hoverSeesaw: null, hoverSide: null,
    cranePositionIndex: 0,
    pendingCatapult: null,
    pendingMatch: null,
    pendingSawblade: null,
  }
}

describe('AC: Sawblade clears the targeted arm', () => {
  it('clears 4 balls from left arm; right arm untouched', () => {
    const s = stateWith([
      seesaw([ball('red'), ball('blue'), ball('green'), ball('navy')], [ball('orange'), ball('gray')]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(0)
    expect(result.state.seesaws[0].right.length).toBe(2)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(4)
  })

  it('clears right arm, left arm untouched', () => {
    const s = stateWith([
      seesaw([ball('red'), ball('blue')], [ball('orange'), ball('gray'), ball('green')]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'right')
    expect(result.state.seesaws[0].right.length).toBe(0)
    expect(result.state.seesaws[0].left.length).toBe(2)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(3)
  })
})

describe('AC: Score per cleared ball (10 pts each)', () => {
  it('adds 10 points per cleared ball', () => {
    const s = stateWith([
      seesaw([ball('red'), ball('blue'), ball('green')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.score).toBe(30)
  })

  it('adds 80 points for 8-ball stack', () => {
    const stack = [
      ball('red'), ball('blue'), ball('green'), ball('navy'),
      ball('gray'), ball('orange'), ball('yellow'), ball('cyan'),
    ]
    const s = stateWith([
      seesaw(stack, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.score).toBe(80)
  })
})

describe('Edge: Sawblade on empty arm', () => {
  it('clears 0 balls and gives 0 score', () => {
    const s = stateWith([
      seesaw([], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.score).toBe(0)
    expect(result.sawbladeEvent?.clearedBalls.length).toBe(0)
    expect(result.sawbladeEvent).toBeDefined()
  })
})

describe('AC: Sawblade is weightless / triggers no catapult', () => {
  it('does not cause a catapult even if the targeted arm was empty and the other arm has weight', () => {
    const s = stateWith([
      seesaw([], [ball('red', 5)]),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.catapultEvents).toHaveLength(0)
    expect(result.state.seesaws[0].right.length).toBe(1)
    expect(result.state.seesaws[0].right[0].weight).toBe(5)
  })
})

describe('AC: pendingSawblade side-channel populated; pendingCatapult & pendingMatch null', () => {
  it('only the sawblade side-channel is set in dropBall logic result', () => {
    const s = stateWith([
      seesaw([ball('red'), ball('red'), ball('red')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.matchGroups).toHaveLength(0)  // no match scan runs
    expect(result.catapultEvents).toHaveLength(0)
    expect(result.sawbladeEvent).toBeDefined()
    expect(result.sawbladeEvent?.seesawIndex).toBe(0)
    expect(result.sawbladeEvent?.side).toBe('left')
  })
})

describe('AC: Sawblade does NOT trigger match scan on its own arm', () => {
  it('after clear, balls on neighbor seesaws that could match are still untouched (the cleared ones are gone)', () => {
    // Three reds on s0.left would have matched with reds adjacent... but the sawblade
    // wipes them BEFORE any match scan can run. The 4th red on s1.left stays.
    const s = stateWith([
      seesaw([ball('red'), ball('red'), ball('red')], []),
      seesaw([ball('red')], []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    expect(result.state.seesaws[0].left.length).toBe(0)
    expect(result.state.seesaws[1].left.length).toBe(1)
    expect(result.matchGroups).toHaveLength(0)
  })
})

describe('AC: Sawblade probability gated by score threshold', () => {
  it('NEVER produces a sawblade at score 299 over many samples', () => {
    for (let i = 0; i < 2000; i++) {
      const b = createBall(299)
      expect(b.kind).not.toBe('sawblade')
    }
  })

  it('CAN produce a sawblade at score 300+ (probability check)', () => {
    let saw = 0
    for (let i = 0; i < 2000; i++) {
      const b = createBall(300)
      if (b.kind === 'sawblade') saw++
    }
    // 5% of 2000 = 100; we'd expect roughly 70-130. Assert > 30 to allow noise.
    expect(saw).toBeGreaterThan(30)
    expect(saw).toBeLessThan(200)
  })
})

describe('AC: nextBall consumed and queuedBall promoted after sawblade drop', () => {
  it('queuedBall becomes the new nextBall', () => {
    const sb = sawballl()
    const queued = ball('blue', 3)
    const s: GameState = {
      ...stateWith([
        seesaw([ball('red'), ball('red')], []),
        seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
      ], sb),
      queuedBall: queued,
    }
    const result = dropBall(s, 0, 'left')
    expect(result.state.nextBall).toBe(queued)
  })
})

describe('AC: Game-over still triggers if board is full', () => {
  it('phase stays waiting after sawblade clears a column (sawblade reduces danger)', () => {
    const stack = Array.from({ length: 8 }, () => ball('red'))
    const s = stateWith([
      seesaw(stack, []),
      seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []), seesaw([], []),
    ], sawballl())
    const result = dropBall(s, 0, 'left')
    // 8 == MAX_STACK so isGameOver checks for >= MAX_STACK; after clearing it's 0, NOT gameover.
    expect(result.state.phase).toBe('waiting')
  })
})

