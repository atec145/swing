import type { Ball, CatapultEvent, GameState, SeesawState, Variant } from './types'
import {
  NUM_SEESAWS,
  MAX_STACK,
  MATCH_MIN,
  COLORS,
  WEIGHT_POOL,
  DIFFICULTY_TIERS,
} from './constants'
import { totalWeight, computeAngle, computeTilt } from './physics'

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
  return { left: [], right: [], angle: 0, tilt: 'balanced' }
}

// Builds a SeesawState from its ball stacks, deriving both the discrete tilt
// and the render angle. Single place that keeps `tilt` and `angle` in sync.
function makeSeesawFrom(left: Ball[], right: Ball[]): SeesawState {
  return {
    left,
    right,
    tilt: computeTilt(left, right),
    angle: computeAngle(left, right),
  }
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
    pendingCatapult: null,
  }
}

// Match key combines color and variant — full-red and half-red NEVER match.
function matchKey(b: Ball): string {
  return `${b.color}:${b.variant}`
}

// Total number of position slots: 2 per seesaw (left = even, right = odd).
const NUM_SLOTS = NUM_SEESAWS * 2

function slotToSeesaw(slot: number): number {
  return Math.floor(slot / 2)
}
function slotSide(slot: number): 'left' | 'right' {
  return slot % 2 === 0 ? 'left' : 'right'
}

// Given an intended landing slot and a travel direction (+1 = clockwise/right,
// -1 = counter-clockwise/left), return the first slot with free capacity,
// wrapping modulo NUM_SLOTS. Returns null if every slot is full (no landing).
function resolveLandingSlot(
  s: SeesawState[],
  intended: number,
  dir: 1 | -1,
): number | null {
  let slot = ((intended % NUM_SLOTS) + NUM_SLOTS) % NUM_SLOTS
  for (let step = 0; step < NUM_SLOTS; step++) {
    const sw = s[slotToSeesaw(slot)]
    const stack = slotSide(slot) === 'left' ? sw.left : sw.right
    if (stack.length < MAX_STACK) return slot
    slot = ((slot + dir) % NUM_SLOTS + NUM_SLOTS) % NUM_SLOTS
  }
  return null
}

// Processes catapult chain reactions with the discrete 3-state model.
//
// A catapult fires on a seesaw when ALL hold:
//   1. its tilt changed (prevTilt !== newTilt)
//   2. the new tilt is not 'balanced'
//   3. the rising (lighter) side has >= 1 ball
//
// The flying ball is the topmost ball on the rising side. Flight distance =
// |sum(left) - sum(right)| positions. Direction:
//   newTilt = 'left'  (left heavier) → right arm rises → right ball flies LEFT
//   newTilt = 'right' (right heavier) → left arm rises  → left ball flies RIGHT
//
// The BFS starts at the seesaw that received the manually dropped ball. Each
// landing re-evaluates its target seesaw → chain reactions. `prevTilt` per
// seesaw is seeded from the pre-drop snapshot so the very first transition is
// detected correctly; thereafter it tracks the live tilt before each landing.
// A `visited` Set guarantees each seesaw catapults at most once per chain,
// which also bounds the chain length and prevents infinite loops.
function processCatapults(
  preDropSeesaws: SeesawState[],
  postDropSeesaws: SeesawState[],
  startIndex: number,
): { seesaws: SeesawState[]; events: CatapultEvent[] } {
  const s: SeesawState[] = postDropSeesaws.map(sw => ({
    ...sw,
    left: [...sw.left],
    right: [...sw.right],
  }))

  // prevTilt[i] = the tilt of seesaw i *before* the change we are about to
  // evaluate for it. Seeded from the pre-drop board.
  const prevTilt = preDropSeesaws.map(sw => sw.tilt)

  const events: CatapultEvent[] = []
  const queue: number[] = [startIndex]
  const visited = new Set<number>()

  while (queue.length > 0) {
    const i = queue.shift()!
    if (visited.has(i)) continue
    visited.add(i)

    const before = prevTilt[i]
    const after = computeTilt(s[i].left, s[i].right)

    // (1) no state change, or (2) changed to balanced → no catapult.
    if (after === before || after === 'balanced') continue

    const lw = totalWeight(s[i].left)
    const rw = totalWeight(s[i].right)
    const diff = Math.abs(lw - rw)

    let ball: Ball | undefined
    let fromSlot: number
    let dir: 1 | -1
    let intended: number

    if (after === 'left') {
      // Left heavier → right arm rises → topmost RIGHT ball flies LEFT.
      if (s[i].right.length === 0) continue // (3) rising side empty
      ball = s[i].right.pop()!
      fromSlot = 2 * i + 1
      dir = -1
      intended = fromSlot - diff
    } else {
      // Right heavier → left arm rises → topmost LEFT ball flies RIGHT.
      if (s[i].left.length === 0) continue // (3) rising side empty
      ball = s[i].left.pop()!
      fromSlot = 2 * i
      dir = 1
      intended = fromSlot + diff
    }

    // The launching seesaw's stack changed — refresh its derived fields.
    s[i] = makeSeesawFrom(s[i].left, s[i].right)

    const toSlot = resolveLandingSlot(s, intended, dir)

    if (toSlot !== null) {
      const targetIdx = slotToSeesaw(toSlot)
      const side = slotSide(toSlot)
      const tgt = s[targetIdx]
      const left = side === 'left' ? [...tgt.left, ball] : [...tgt.left]
      const right = side === 'right' ? [...tgt.right, ball] : [...tgt.right]
      // Record the target's tilt BEFORE landing so its own transition is
      // evaluated correctly when it is dequeued.
      prevTilt[targetIdx] = tgt.tilt
      s[targetIdx] = makeSeesawFrom(left, right)
      events.push({ fromSlot, toSlot, ball, diff })
      queue.push(targetIdx)
    } else {
      // Every slot full — ball is lost; still animate the launch.
      events.push({ fromSlot, toSlot: intended, ball, diff })
    }
  }

  return { seesaws: s, events }
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
    return makeSeesawFrom(left, right)
  })
}

function isGameOver(seesaws: SeesawState[]): boolean {
  return seesaws.some(sw => sw.left.length >= MAX_STACK || sw.right.length >= MAX_STACK)
}

// Returns a deep-copied seesaw array with the ball appended to the chosen
// side — the visual state *before* any catapult resolves. The animation layer
// starts replaying CatapultEvents from this snapshot.
export function applyManualDrop(
  seesaws: SeesawState[],
  seesawIndex: number,
  side: 'left' | 'right',
  ball: Ball,
): SeesawState[] {
  return seesaws.map((s, i) => {
    if (i !== seesawIndex) return { ...s, left: [...s.left], right: [...s.right] }
    const left = [...s.left]
    const right = [...s.right]
    if (side === 'left') left.push(ball)
    else right.push(ball)
    return makeSeesawFrom(left, right)
  })
}

// dropBall now returns the authoritative final state, the ordered list of
// catapult throws, and the pre-catapult seesaw snapshot. The animation layer
// replays `catapultEvents` step-by-step starting from `preCatapultSeesaws`;
// the logic itself is resolved immediately.
export interface DropResult {
  state: GameState
  catapultEvents: CatapultEvent[]
  preCatapultSeesaws: SeesawState[]
}

export function dropBall(
  state: GameState,
  seesawIndex: number,
  side: 'left' | 'right',
): DropResult {
  if (state.phase === 'gameover') {
    return { state, catapultEvents: [], preCatapultSeesaws: state.seesaws }
  }

  const sw = state.seesaws[seesawIndex]
  const targetStack = side === 'left' ? sw.left : sw.right
  if (targetStack.length >= MAX_STACK) {
    return { state, catapultEvents: [], preCatapultSeesaws: state.seesaws }
  }

  const ball = state.nextBall
  // Snapshot the board *before* the drop so processCatapults can detect the
  // tilt transition the dropped ball causes on the start seesaw.
  const preDropSeesaws = state.seesaws
  const preCatapultSeesaws = applyManualDrop(state.seesaws, seesawIndex, side, ball)

  const catapultResult = processCatapults(
    preDropSeesaws,
    preCatapultSeesaws,
    seesawIndex,
  )
  let seesaws = catapultResult.seesaws

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
    state: {
      ...state,
      seesaws,
      score: newScore,
      nextBall: createBall(newScore),
      phase,
    },
    catapultEvents: catapultResult.events,
    preCatapultSeesaws,
  }
}
