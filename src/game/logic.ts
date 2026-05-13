import type { Ball, GameState, SeesawState, Variant } from './types'
import {
  NUM_SEESAWS,
  MAX_STACK,
  MATCH_MIN,
  COLORS,
  WEIGHT_POOL,
  CATAPULT_THRESHOLD,
  DIFFICULTY_TIERS,
} from './constants'
import { totalWeight, computeAngle } from './physics'

let ballIdCounter = 0

// Returns the active difficulty tier for the given score. Picks the highest
// tier whose minScore is <= score.
export function tierForScore(score: number) {
  let active = DIFFICULTY_TIERS[0]
  for (const tier of DIFFICULTY_TIERS) {
    if (score >= tier.minScore) active = tier
  }
  return active
}

// Generates a random ball using the active tier derived from current score.
// `score` defaults to 0 — useful for tests and the initial state.
export function createBall(score = 0, override?: Partial<Ball>): Ball {
  const tier = tierForScore(score)
  const color = COLORS[Math.floor(Math.random() * tier.activeColors)]
  const variant: Variant = tier.variants[Math.floor(Math.random() * tier.variants.length)]
  const weight = WEIGHT_POOL[Math.floor(Math.random() * WEIGHT_POOL.length)]
  return { id: `b${++ballIdCounter}`, color, variant, weight, ...override }
}

function makeSeesaw(): SeesawState {
  return { left: [], right: [], angle: 0 }
}

export function createInitialState(): GameState {
  return {
    seesaws: Array.from({ length: NUM_SEESAWS }, makeSeesaw),
    score: 0,
    nextBall: createBall(0),
    phase: 'waiting',
    hoverSeesaw: null,
    hoverSide: null,
    cranePositionIndex: 0, // start over seesaw 0, left side
  }
}

// Match key combines color and variant — full-red and half-red NEVER match.
function matchKey(b: Ball): string {
  return `${b.color}:${b.variant}`
}

// Processes catapult chain reactions starting from the seesaw where a ball was placed.
// Each seesaw catapults at most ONE ball per chain to keep both sides populated
// (enabling horizontal matches). Works on mutable deep copies for performance.
function processCatapults(seesaws: SeesawState[], startIndex: number): SeesawState[] {
  const s: SeesawState[] = seesaws.map(sw => ({
    ...sw,
    left: [...sw.left],
    right: [...sw.right],
  }))

  const queue: number[] = [startIndex]
  const visited = new Set<number>() // each seesaw fires at most once per chain

  while (queue.length > 0) {
    const i = queue.shift()!
    if (visited.has(i)) continue
    visited.add(i)

    const lw = totalWeight(s[i].left)
    const rw = totalWeight(s[i].right)

    if (lw > rw + CATAPULT_THRESHOLD && s[i].right.length > 0) {
      // Left heavier by threshold → right arm rises → top right ball catapults RIGHT
      const ball = s[i].right.pop()!
      s[i].angle = computeAngle(s[i].left, s[i].right)

      const t = i + 1
      if (t < NUM_SEESAWS && s[t].left.length < MAX_STACK) {
        s[t].left.push(ball)
        s[t].angle = computeAngle(s[t].left, s[t].right)
        queue.push(t) // check destination, but NOT i again
      }
      // else ball falls off the right edge — removed
    } else if (rw > lw + CATAPULT_THRESHOLD && s[i].left.length > 0) {
      // Right heavier by threshold → left arm rises → top left ball catapults LEFT
      const ball = s[i].left.pop()!
      s[i].angle = computeAngle(s[i].left, s[i].right)

      const t = i - 1
      if (t >= 0 && s[t].right.length < MAX_STACK) {
        s[t].right.push(ball)
        s[t].angle = computeAngle(s[t].left, s[t].right)
        queue.push(t)
      }
      // else ball falls off the left edge — removed
    }
  }

  return s
}

function scanRow(row: (Ball | null)[], toRemove: Set<string>) {
  let runKey: string | null = null
  let runStart = 0
  let runLen = 0

  const flush = (endIdx: number) => {
    if (runLen >= MATCH_MIN && runKey !== null) {
      for (let k = runStart; k < endIdx; k++) {
        const b = row[k]
        if (b) toRemove.add(b.id)
      }
    }
  }

  for (let k = 0; k <= row.length; k++) {
    const b = k < row.length ? row[k] : null
    const key = b ? matchKey(b) : null
    if (b && key === runKey) {
      runLen++
    } else {
      flush(k)
      runKey = key
      runStart = k
      runLen = b ? 1 : 0
    }
  }
}

// Returns -1 if this arm is down (heavier side), +1 if up (lighter side), 0 if balanced.
// When angle > 0: left is heavier → left arm is down, right arm is up.
function armOffset(angle: number, side: 'left' | 'right'): number {
  if (angle === 0) return 0
  if (side === 'left') return angle > 0 ? -1 : 1
  return angle > 0 ? 1 : -1
}

// Returns IDs of balls to remove.
// Horizontal rows match balls at the same PHYSICAL LEVEL (not array index).
// Level = stackIndex + armOffset: a tilted arm shifts all its balls up or down
// by one slot relative to a balanced arm, matching the original game's 3-level
// geometry (unten / mitte / oben).
// Vertically stacked same-type balls are cleared only when they are adjacent
// to a ball that is already part of a horizontal match.
function findMatches(seesaws: SeesawState[]): Set<string> {
  const toRemove = new Set<string>()

  function getBallAtLevel(sw: SeesawState, side: 'left' | 'right', L: number): Ball | null {
    const k = L - armOffset(sw.angle, side)
    if (k < 0 || k >= sw[side].length) return null
    return sw[side][k]
  }

  let minLevel = 0
  let maxLevel = 0
  for (const sw of seesaws) {
    for (const side of ['left', 'right'] as const) {
      const offset = armOffset(sw.angle, side)
      const len = sw[side].length
      if (len > 0) {
        minLevel = Math.min(minLevel, offset)
        maxLevel = Math.max(maxLevel, (len - 1) + offset)
      }
    }
  }

  for (let L = minLevel; L <= maxLevel; L++) {
    scanRow(seesaws.map(sw => getBallAtLevel(sw, 'left', L)), toRemove)
    scanRow(seesaws.map(sw => getBallAtLevel(sw, 'right', L)), toRemove)
    scanRow(seesaws.flatMap(sw => [getBallAtLevel(sw, 'left', L), getBallAtLevel(sw, 'right', L)]), toRemove)
  }

  if (toRemove.size === 0) return toRemove

  // Expand vertically: for each horizontally matched ball, also clear contiguous
  // same-type balls stacked directly above or below it in the same arm.
  for (let si = 0; si < seesaws.length; si++) {
    for (const side of ['left', 'right'] as const) {
      const stack = seesaws[si][side]
      for (let h = 0; h < stack.length; h++) {
        if (!toRemove.has(stack[h].id)) continue
        const key = matchKey(stack[h])
        for (let k = h + 1; k < stack.length; k++) {
          if (matchKey(stack[k]) === key) toRemove.add(stack[k].id)
          else break
        }
        for (let k = h - 1; k >= 0; k--) {
          if (matchKey(stack[k]) === key) toRemove.add(stack[k].id)
          else break
        }
      }
    }
  }

  return toRemove
}

function removeAndRecalc(seesaws: SeesawState[], toRemove: Set<string>): SeesawState[] {
  return seesaws.map(sw => {
    const left = sw.left.filter(b => !toRemove.has(b.id))
    const right = sw.right.filter(b => !toRemove.has(b.id))
    return { left, right, angle: computeAngle(left, right) }
  })
}

function isGameOver(seesaws: SeesawState[]): boolean {
  return seesaws.some(sw => sw.left.length >= MAX_STACK || sw.right.length >= MAX_STACK)
}

export function dropBall(state: GameState, seesawIndex: number, side: 'left' | 'right'): GameState {
  if (state.phase === 'gameover') return state

  const sw = state.seesaws[seesawIndex]
  const targetStack = side === 'left' ? sw.left : sw.right
  if (targetStack.length >= MAX_STACK) return state

  const ball = state.nextBall
  let seesaws = state.seesaws.map((s, i) => {
    if (i !== seesawIndex) return { ...s, left: [...s.left], right: [...s.right] }
    const left = [...s.left]
    const right = [...s.right]
    if (side === 'left') left.push(ball)
    else right.push(ball)
    return { left, right, angle: computeAngle(left, right) }
  })

  seesaws = processCatapults(seesaws, seesawIndex)

  // Cascade matches
  let totalRemoved = 0
  let toRemove = findMatches(seesaws)
  while (toRemove.size > 0) {
    totalRemoved += toRemove.size
    seesaws = removeAndRecalc(seesaws, toRemove)
    toRemove = findMatches(seesaws)
  }

  const matchBonus = totalRemoved > 0 ? Math.floor(totalRemoved / MATCH_MIN) * 50 + totalRemoved * 10 : 0
  const phase = isGameOver(seesaws) ? 'gameover' : 'waiting'
  const newScore = state.score + matchBonus

  return {
    ...state,
    seesaws,
    score: newScore,
    nextBall: createBall(newScore),
    phase,
  }
}
