import type { Ball, GameState, SeesawState } from './types'
import { NUM_SEESAWS, MAX_STACK, MATCH_MIN, COLORS, WEIGHT_POOL } from './constants'
import { totalWeight, computeAngle } from './physics'

let ballIdCounter = 0

export function createBall(override?: Partial<Ball>): Ball {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const weight = WEIGHT_POOL[Math.floor(Math.random() * WEIGHT_POOL.length)]
  return { id: `b${++ballIdCounter}`, color, weight, ...override }
}

function makeSeesaw(): SeesawState {
  return { left: [], right: [], angle: 0 }
}

export function createInitialState(): GameState {
  return {
    seesaws: Array.from({ length: NUM_SEESAWS }, makeSeesaw),
    score: 0,
    nextBall: createBall(),
    phase: 'waiting',
    hoverSeesaw: null,
    hoverSide: null,
  }
}

// Processes all catapult physics after a ball is placed.
// Works on mutable copies of seesaw state for performance.
function processCatapults(seesaws: SeesawState[]): SeesawState[] {
  // Deep copy so we can mutate freely
  const s: SeesawState[] = seesaws.map(sw => ({
    ...sw,
    left: [...sw.left],
    right: [...sw.right],
  }))

  const queue: number[] = Array.from({ length: NUM_SEESAWS }, (_, i) => i)
  const visits = new Array<number>(NUM_SEESAWS).fill(0)

  while (queue.length > 0) {
    const i = queue.shift()!
    if (visits[i]++ > 16) continue

    const lw = totalWeight(s[i].left)
    const rw = totalWeight(s[i].right)

    if (lw > rw && s[i].right.length > 0) {
      // Left heavier → right arm rises → top right ball catapults RIGHT
      const ball = s[i].right.pop()!
      s[i].angle = computeAngle(s[i].left, s[i].right)

      const t = i + 1
      if (t < NUM_SEESAWS && s[t].left.length < MAX_STACK) {
        s[t].left.push(ball)
        s[t].angle = computeAngle(s[t].left, s[t].right)
        queue.push(i, t)
      }
      // else ball falls off the right edge — removed
    } else if (rw > lw && s[i].left.length > 0) {
      // Right heavier → left arm rises → top left ball catapults LEFT
      const ball = s[i].left.pop()!
      s[i].angle = computeAngle(s[i].left, s[i].right)

      const t = i - 1
      if (t >= 0 && s[t].right.length < MAX_STACK) {
        s[t].right.push(ball)
        s[t].angle = computeAngle(s[t].left, s[t].right)
        queue.push(i, t)
      }
      // else ball falls off the left edge — removed
    }
  }

  return s
}

// Returns IDs of balls to remove (3+ same color in a horizontal row)
function findMatches(seesaws: SeesawState[]): Set<string> {
  const toRemove = new Set<string>()
  const maxH = Math.max(...seesaws.map(sw => Math.max(sw.left.length, sw.right.length)))

  for (let h = 0; h < maxH; h++) {
    // Row at height h: [s0.left, s0.right, s1.left, s1.right, ...]
    const row: (Ball | null)[] = seesaws.flatMap(sw => [sw.left[h] ?? null, sw.right[h] ?? null])

    let runColor: string | null = null
    let runStart = 0
    let runLen = 0

    const flush = (endIdx: number) => {
      if (runLen >= MATCH_MIN && runColor !== null) {
        for (let k = runStart; k < endIdx; k++) {
          const b = row[k]
          if (b) toRemove.add(b.id)
        }
      }
    }

    for (let k = 0; k <= row.length; k++) {
      const b = k < row.length ? row[k] : null
      if (b && b.color === runColor) {
        runLen++
      } else {
        flush(k)
        runColor = b?.color ?? null
        runStart = k
        runLen = b ? 1 : 0
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

  seesaws = processCatapults(seesaws)

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

  return {
    ...state,
    seesaws,
    score: state.score + matchBonus,
    nextBall: createBall(),
    phase,
  }
}
