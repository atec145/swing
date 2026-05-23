import type {
  Ball,
  CatapultEvent,
  Color,
  GameState,
  MatchGroup,
  SeesawState,
  Variant,
} from './types'
import {
  NUM_SEESAWS,
  MAX_STACK,
  MATCH_MIN,
  COLORS,
  WEIGHT_POOL,
  DIFFICULTY_TIERS,
  ROCK_MIN_SCORE,
  ROCK_WEIGHT,
  SAWBLADE_MIN_GAP,
  SAWBLADE_TARGET_GAP,
  ROCK_MIN_GAP,
  ROCK_TARGET_GAP,
  BLITZ_MIN_GAP,
  BLITZ_TARGET_GAP,
  BLITZ_MIN_SCORE,
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
//
// Color is picked uniformly from the first `activeColors` unlock-ordered
// COLORS. The ball may be a half-ball only if its color index falls inside
// the first `activeHalfColors` entries (same unlock order as full balls);
// when eligible it is a 50/50 full/half coin flip. Colors outside the
// half-ball window are always full.
const SAWBLADE_MIN_SCORE = 300

// Returns true with linearly ramping probability: 0% below minGap, ~50% at
// targetGap, 100% at (2*targetGap - minGap). The ramp makes spawns feel
// random while bounding the maximum gap between appearances.
function rampSpawn(ballsSince: number, minGap: number, targetGap: number): boolean {
  if (ballsSince < minGap) return false
  const range = (targetGap - minGap) * 2
  return Math.random() < Math.min(1, (ballsSince - minGap) / range)
}

// `sawbladeSince` / `rockSince` / `blitzSince` — balls generated since each
// type last spawned. Callers pass the current counter from GameState; defaults
// of 0 mean the special ball is not yet due (used for initial state and tests
// that override kind).
export function createBall(
  score = 0,
  sawbladeSince = 0,
  rockSince = 0,
  blitzSince = 0,
  override?: Partial<Ball>,
): Ball {
  // Sawblade roll — always runs first so the dice are independent of color choice.
  if (
    !override?.kind &&
    score >= SAWBLADE_MIN_SCORE &&
    rampSpawn(sawbladeSince, SAWBLADE_MIN_GAP, SAWBLADE_TARGET_GAP)
  ) {
    return {
      id: `b${++ballIdCounter}`,
      color: 'green',     // dummy — not used for sawblade rendering
      variant: 'full',    // dummy — not used for sawblade rendering
      weight: 0,          // zero weight: sawblade does NOT affect tilt physics
      kind: 'sawblade',
      ...override,
    }
  }

  // Rock roll — runs only when the sawblade roll didn't fire.
  if (
    !override?.kind &&
    score >= ROCK_MIN_SCORE &&
    rampSpawn(rockSince, ROCK_MIN_GAP, ROCK_TARGET_GAP)
  ) {
    return {
      id: `b${++ballIdCounter}`,
      color: 'green',       // dummy — renderer dispatches on kind, never color
      variant: 'full',      // dummy
      weight: ROCK_WEIGHT,  // heavy: tilts the seesaw aggressively
      kind: 'rock',
      ...override,
    }
  }

  // Blitz roll — runs only when neither sawblade nor rock fired. Blitzkugel
  // gets a random normal weight so it participates in seesaw physics like a
  // regular ball; its `color` is unused (renderer dispatches on `kind`).
  if (
    !override?.kind &&
    score >= BLITZ_MIN_SCORE &&
    rampSpawn(blitzSince, BLITZ_MIN_GAP, BLITZ_TARGET_GAP)
  ) {
    const weight = WEIGHT_POOL[Math.floor(Math.random() * WEIGHT_POOL.length)]
    return {
      id: `b${++ballIdCounter}`,
      color: 'green',     // dummy — not used for blitz rendering
      variant: 'full',    // dummy — not used for blitz rendering
      weight,
      kind: 'blitz',
      ...override,
    }
  }

  const tier = tierForScore(score)
  const colorIndex = Math.floor(Math.random() * tier.activeColors)
  const color = COLORS[colorIndex]
  const halfEligible = colorIndex < tier.activeHalfColors
  const variant: Variant =
    halfEligible && Math.random() < 0.5 ? 'half' : 'full'
  const weight = WEIGHT_POOL[Math.floor(Math.random() * WEIGHT_POOL.length)]
  return { id: `b${++ballIdCounter}`, color, variant, weight, kind: 'normal', ...override }
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
    queuedBall: createBall(0),
    phase: 'waiting',
    hoverSeesaw: null,
    hoverSide: null,
    cranePositionIndex: 0,
    pendingCatapult: null,
    pendingMatch: null,
    pendingSawblade: null,
    pendingBlitz: null,
    ballsSinceSawblade: 0,
    ballsSinceRock: 0,
    ballsSinceBlitz: 0,
  }
}

// Match key combines color and variant — full-red and half-red NEVER match.
// Special balls (rock, sawblade) get a unique key per instance so they never
// chain with anything — including each other — in either the horizontal scan
// or the vertical-expansion pass.
function matchKey(b: Ball): string {
  if (b.kind && b.kind !== 'normal') return `__special:${b.kind}:${b.id}`
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
// Only the interleaved scan [s0.left, s0.right, s1.left, s1.right, …] is used
// for horizontal matching — a null (empty position) in this sequence represents
// a genuine visual gap and breaks any run. Separate left-only / right-only
// scans were removed because they matched balls across such gaps (Bug #7).
// Vertically stacked same-type balls are cleared only when they are adjacent
// to a ball that is already part of a horizontal match.
function findMatches(seesaws: SeesawState[]): Set<string> {
  const toRemove = new Set<string>()

  function getBallAtLevel(sw: SeesawState, side: 'left' | 'right', L: number): Ball | null {
    const k = L - armOffset(sw.angle, side)
    if (k < 0 || k >= sw[side].length) return null
    const b = sw[side][k]
    // Rocks act as visual gaps for match scanning: a row like
    //   red — rock — red — red
    // breaks at the rock and never produces a match.
    if (b.kind === 'rock') return null
    return b
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

// Deep copy so a snapshot can be frozen against later cascade mutations.
function cloneSeesaws(seesaws: SeesawState[]): SeesawState[] {
  return seesaws.map(sw => ({
    ...sw,
    left: sw.left.map(b => ({ ...b })),
    right: sw.right.map(b => ({ ...b })),
  }))
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
  // One MatchGroup per cascade round (ordered). Empty when nothing matched.
  matchGroups: MatchGroup[]
  // Side-channel for sawblade drops: which arm was wiped and which balls
  // were removed (used by the canvas to spawn colored fragment particles).
  // undefined for non-sawblade drops.
  sawbladeEvent?: {
    seesawIndex: number
    side: 'left' | 'right'
    clearedBalls: Ball[]
  }
  // Side-channel for blitz (lightning ball) drops: which color was struck
  // and which balls were chain-cleared from the entire board. undefined for
  // non-blitz drops or when the blitz had no effect (landed on empty arm).
  blitzEvent?: {
    seesawIndex: number
    side: 'left' | 'right'
    targetColor: Color | null
    clearedBalls: Array<{
      ball: Ball
      seesawIndex: number
      side: 'left' | 'right'
      stackIndex: number
    }>
    preBlitzSeesaws: SeesawState[]
  }
}

// Determines the chain-lightning target color when a blitz ball just landed.
// Strategy: scan the SAME-column arm (where the blitz now sits) from the
// blitz position downward — the first non-blitz, non-rock ball encountered
// supplies the target color. Rocks act as visual gaps (they are immune); we
// look past them. Returns null when no eligible neighbor exists (landed on
// an empty arm, or only blitz/rock balls below).
function findBlitzTargetColor(
  arm: Ball[],
  blitzStackIndex: number,
): Color | null {
  // blitzStackIndex is the position the blitz ball occupies (last index).
  // We look at every ball below (stackIndex < blitzStackIndex), top-first,
  // skipping rocks and other blitz balls (blitzes are immune to each other).
  for (let i = blitzStackIndex - 1; i >= 0; i--) {
    const b = arm[i]
    if (b.kind === 'rock' || b.kind === 'blitz') continue
    return b.color
  }
  return null
}

// Builds the chain-clear event for a freshly landed blitz ball. Sweeps the
// whole board for balls of the target color and returns their positions.
// The blitz ball itself is NOT consumed; neither rocks nor other blitz balls
// are affected. Returns null targetColor when the blitz had no neighbor.
function processBlitzClear(
  seesaws: SeesawState[],
  blitzSeesawIdx: number,
  blitzSide: 'left' | 'right',
): {
  targetColor: Color | null
  clearedBalls: Array<{
    ball: Ball
    seesawIndex: number
    side: 'left' | 'right'
    stackIndex: number
  }>
} {
  const blitzArm = seesaws[blitzSeesawIdx][blitzSide]
  // Blitz ball is the topmost ball on the arm (just landed).
  const blitzStackIndex = blitzArm.length - 1
  const targetColor = findBlitzTargetColor(blitzArm, blitzStackIndex)
  if (targetColor === null) {
    return { targetColor: null, clearedBalls: [] }
  }

  const clearedBalls: Array<{
    ball: Ball
    seesawIndex: number
    side: 'left' | 'right'
    stackIndex: number
  }> = []
  for (let si = 0; si < seesaws.length; si++) {
    for (const side of ['left', 'right'] as const) {
      const arm = seesaws[si][side]
      for (let h = 0; h < arm.length; h++) {
        const b = arm[h]
        // Skip special balls — blitz only affects normal balls of the target color.
        if (b.kind === 'rock' || b.kind === 'blitz' || b.kind === 'sawblade') continue
        if (b.color === targetColor) {
          clearedBalls.push({ ball: b, seesawIndex: si, side, stackIndex: h })
        }
      }
    }
  }
  return { targetColor, clearedBalls }
}

export function dropBall(
  state: GameState,
  seesawIndex: number,
  side: 'left' | 'right',
): DropResult {
  if (state.phase === 'gameover') {
    return {
      state,
      catapultEvents: [],
      preCatapultSeesaws: state.seesaws,
      matchGroups: [],
    }
  }

  const ball = state.nextBall

  // Sawblade branch: bypasses weight physics + match scanning. Clears the
  // targeted arm, awards normal match points per cleared ball, never triggers
  // a catapult (weight = 0 → no tilt change anyway).
  if (ball.kind === 'sawblade') {
    const sw = state.seesaws[seesawIndex]
    const clearedBalls = side === 'left' ? [...sw.left] : [...sw.right]
    const newLeft = side === 'left' ? [] : [...sw.left]
    const newRight = side === 'right' ? [] : [...sw.right]
    const seesaws = state.seesaws.map((s, i) =>
      i === seesawIndex ? makeSeesawFrom(newLeft, newRight) : s,
    )
    // Score: 10 points per cleared NORMAL ball. Rocks count 0 — they are
    // hazards, not scoring tokens; cutting them is its own reward.
    const scorableCount = clearedBalls.filter(b => b.kind !== 'rock').length
    const bonus = scorableCount * 10
    const newScore = state.score + bonus
    const newSawbladeSince = state.ballsSinceSawblade + 1
    const newRockSince = state.ballsSinceRock + 1
    const newBlitzSince = state.ballsSinceBlitz + 1
    const newQueuedBall = createBall(newScore, newSawbladeSince, newRockSince, newBlitzSince)
    return {
      state: {
        ...state,
        seesaws,
        score: newScore,
        nextBall: state.queuedBall,
        queuedBall: newQueuedBall,
        phase: isGameOver(seesaws) ? 'gameover' : 'waiting',
        ballsSinceSawblade: newQueuedBall.kind === 'sawblade' ? 0 : newSawbladeSince,
        ballsSinceRock: newQueuedBall.kind === 'rock' ? 0 : newRockSince,
        ballsSinceBlitz: newQueuedBall.kind === 'blitz' ? 0 : newBlitzSince,
      },
      catapultEvents: [],
      preCatapultSeesaws: state.seesaws,
      matchGroups: [],
      sawbladeEvent: {
        seesawIndex,
        side,
        clearedBalls,
      },
    }
  }

  const sw = state.seesaws[seesawIndex]
  const targetStack = side === 'left' ? sw.left : sw.right
  if (targetStack.length >= MAX_STACK) {
    return {
      state,
      catapultEvents: [],
      preCatapultSeesaws: state.seesaws,
      matchGroups: [],
    }
  }
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

  // Blitzkugel chain-clear. Runs BEFORE normal match-scanning so the chain-
  // lightning sweep can clear the field; afterwards the regular cascade kicks
  // in (so a blitz-revealed match still scores). The blitz ball itself stays
  // on the arm. We must locate the blitz ball's CURRENT position because
  // catapult resolution above may have moved/wrapped it (rare but possible).
  let blitzEvent: DropResult['blitzEvent']
  let blitzClearBonus = 0
  if (ball.kind === 'blitz') {
    // Find the freshly-landed blitz ball on the board.
    let blitzPos: { si: number; side: 'left' | 'right' } | null = null
    outer: for (let si = 0; si < seesaws.length; si++) {
      for (const sd of ['left', 'right'] as const) {
        const arm = seesaws[si][sd]
        for (let h = 0; h < arm.length; h++) {
          if (arm[h].id === ball.id) {
            blitzPos = { si, side: sd }
            break outer
          }
        }
      }
    }
    if (blitzPos) {
      const { targetColor, clearedBalls } = processBlitzClear(
        seesaws,
        blitzPos.si,
        blitzPos.side,
      )
      const preBlitzSeesaws = cloneSeesaws(seesaws)
      blitzEvent = {
        seesawIndex: blitzPos.si,
        side: blitzPos.side,
        targetColor,
        clearedBalls,
        preBlitzSeesaws,
      }
      if (clearedBalls.length > 0) {
        const toRemove = new Set(clearedBalls.map(c => c.ball.id))
        seesaws = removeAndRecalc(seesaws, toRemove)
        // Same scoring formula as normal match clears.
        blitzClearBonus =
          Math.floor(clearedBalls.length / MATCH_MIN) * 50 + clearedBalls.length * 10
      }
    } else {
      // Blitz ball was lost (e.g. ejected off-board by catapult chain).
      // No effect.
      blitzEvent = undefined
    }
  }

  // Cascade matches. Each round records a MatchGroup: the board snapshot
  // *before* the removal plus the ball IDs that vanish, so the animation
  // layer can replay the dissolve while the logic state is already final.
  let totalRemoved = 0
  const matchGroups: MatchGroup[] = []
  let toRemove = findMatches(seesaws)
  while (toRemove.size > 0) {
    totalRemoved += toRemove.size
    matchGroups.push({
      ballIds: [...toRemove],
      seesaws: cloneSeesaws(seesaws),
    })
    seesaws = removeAndRecalc(seesaws, toRemove)
    toRemove = findMatches(seesaws)
  }

  const matchBonus = totalRemoved > 0 ? Math.floor(totalRemoved / MATCH_MIN) * 50 + totalRemoved * 10 : 0
  const phase = isGameOver(seesaws) ? 'gameover' : 'waiting'
  const newScore = state.score + matchBonus + blitzClearBonus
  const newSawbladeSince = state.ballsSinceSawblade + 1
  const newRockSince = state.ballsSinceRock + 1
  const newBlitzSince = state.ballsSinceBlitz + 1
  const newQueuedBall = createBall(newScore, newSawbladeSince, newRockSince, newBlitzSince)

  return {
    state: {
      ...state,
      seesaws,
      score: newScore,
      nextBall: state.queuedBall,
      queuedBall: newQueuedBall,
      phase,
      ballsSinceSawblade: newQueuedBall.kind === 'sawblade' ? 0 : newSawbladeSince,
      ballsSinceRock: newQueuedBall.kind === 'rock' ? 0 : newRockSince,
      ballsSinceBlitz: newQueuedBall.kind === 'blitz' ? 0 : newBlitzSince,
    },
    catapultEvents: catapultResult.events,
    preCatapultSeesaws,
    matchGroups,
    blitzEvent,
  }
}
