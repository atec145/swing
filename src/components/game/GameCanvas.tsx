'use client'

import { useRef, useEffect, useCallback } from 'react'
import type {
  Ball,
  CatapultEvent,
  GameState,
  MatchGroup,
  SeesawState,
} from '@/game/types'
import {
  render,
  craneXForIndex,
  slotAnchor,
  type CraneAnim,
  type DissolveAnim,
  type SawbladeParticle,
} from '@/game/renderer'
import { computeAngle, seesawCenterX, leftArmEnd, rightArmEnd } from '@/game/physics'
import {
  CW, CH,
  CRANE_GRIP_Y,
  CRANE_MOVE_DURATION,
  CRANE_RELEASE_DURATION,
  FALL_GRAVITY,
  FALL_INITIAL_VY,
  BALL_RADIUS,
  BALL_SPACING,
  PIVOT_Y,
  ARM_LENGTH,
  NUM_SEESAWS,
  COLOR_HEX,
  ROCK_COLORS,
} from '@/game/constants'

interface Props {
  gameState: GameState
  onDrop: (seesawIndex: number, side: 'left' | 'right') => void
  onCraneMove: (delta: -1 | 1) => void
  onCraneSetPosition: (index: number) => void
  onConsumeCatapult: (seq: number) => void
  onConsumeMatch: (seq: number) => void
  onConsumeSawblade: (seq: number) => void
  onConsumeBlitz: (seq: number) => void
  onRestart: () => void
}

// Transporter dissolve phase durations (ms) — see Issue #5 timing table.
// Index = phase number; total 3.3s per group.
const DISSOLVE_PHASE_MS = [500, 500, 1000, 800, 500] as const
const DISSOLVE_TOTAL_MS = DISSOLVE_PHASE_MS.reduce((a, b) => a + b, 0)

const NUM_SLOTS = NUM_SEESAWS * 2

// Sawblade animation tuning (Issue #11)
const SAWBLADE_SPIN_PER_SEC = Math.PI * 2     // 1 revolution/second base
const SAWBLADE_BOUNCE_MS = 160                 // initial bounce before first grind
const SAWBLADE_BOUNCE_HEIGHT = 33              // px upward displacement at peak
const SAWBLADE_GRIND_MS = 420                  // total time to cut through one ball + traverse to next
const SAWBLADE_SPARK_INTERVAL_MS = 22          // cadence of continuous spark pulses
const SAWBLADE_SPARK_PER_PULSE = 4             // sparks spawned per pulse during cut
// Cutting happens from t=0 (blade touches ball top, set up by the bounce
// end / previous grind's exit position) to t=0.90 (blade reaches ball
// bottom). The remaining 10% is the 4px traversal in the inter-ball gap.
const GRIND_CUT_START = 0
const GRIND_CUT_END = 0.90
const SPARK_COUNT = 55                         // particles per ball impact
const FRAG_PER_BALL = 6                        // fragment particles per cleared ball

// Blitz animation tuning (Issue #13)
const BLITZ_FLASH_MS = 100       // brief white discharge flash at landing
const BLITZ_CHAIN_MS = 520       // lightning arcs visible + target balls bleach out

// Catapult animation tuning (see Issue #3 tech design).
const MS_PER_SLOT = 300
const MAX_FLIGHT_MS = 900
const FADE_MS = 80
const ARC_PER_SLOT = 26 // extra parabola height (px) per slot travelled

function slotToSeesaw(slot: number): number {
  return Math.floor(slot / 2)
}
function slotSide(slot: number): 'left' | 'right' {
  return slot % 2 === 0 ? 'left' : 'right'
}

// Deep copy so the visual replay can mutate freely without touching React state.
function cloneSeesaws(seesaws: SeesawState[]): SeesawState[] {
  return seesaws.map(sw => ({ ...sw, left: [...sw.left], right: [...sw.right] }))
}

// One straight-or-arced piece of a catapult flight. Edge-crossing flights are
// split into multiple segments so the wrap-around is visible.
interface FlightSegment {
  ball: Ball
  duration: number
  // Parabola endpoints (screen space) and peak height for this segment.
  x0: number
  y0: number
  x1: number
  y1: number
  arc: number
  // Total rotation (radians) accumulated across this segment.
  rotation: number
  rotationStart: number
  // Fade behaviour: 'in' = fade up from 0 (re-enter after wrap),
  // 'out' = fade down to 0 (about to exit a screen edge), else full opacity.
  fade: 'in' | 'out' | 'none'
}

// Spawns a small ongoing pulse of sparks at the blade-ball contact point.
// Called repeatedly during the grind so sparks stream continuously from the
// cut line rather than appearing as a single burst.
function spawnSawbladeSparksPulse(x: number, y: number, particles: SawbladeParticle[]) {
  for (let i = 0; i < SAWBLADE_SPARK_PER_PULSE; i++) {
    // Bias the angle to a wide upper fan (sideways + up). Heavier weight on
    // horizontal angles than upward — that matches how real grinder sparks shoot.
    const side = i < SAWBLADE_SPARK_PER_PULSE / 2 ? -1 : 1
    const ang = side * (Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9)
    const speed = 3.5 + Math.random() * 5
    const isBright = Math.random() < 0.55
    particles.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y + (Math.random() - 0.5) * 3,
      size: 1.4 + Math.random() * 1.6,
      color: isBright ? '#FFF59A' : (Math.random() < 0.5 ? '#FFD700' : '#FF9900'),
      life: 0.95,
      type: 'spark',
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 1.6,
    })
  }
}

// Spawns a burst of golden sparks at (x, y). Fan is side-biased (like a
// grinding wheel): most sparks shoot left/right and upward, few go straight down.
function spawnSawbladeSparks(x: number, y: number, particles: SawbladeParticle[]) {
  for (let i = 0; i < SPARK_COUNT; i++) {
    // Restrict fan: -160° to +160° (skip straight-down sector of ±20°)
    const sectorFrac = i / SPARK_COUNT
    const ang = -Math.PI + sectorFrac * Math.PI * 2 * (160 / 180) * 2
      - Math.PI * (160 / 180) + (Math.random() - 0.5) * 0.6
    const speed = 4 + Math.random() * 6
    const isBright = Math.random() < 0.5
    particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 4,
      size: 1.8 + Math.random() * 1.8,
      color: isBright ? '#FFEE44' : (Math.random() < 0.5 ? '#FFD700' : '#FF9900'),
      life: 1,
      type: 'spark',
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 2.5,
    })
  }
}

// Spawns colored fragment particles for a single cleared ball at (x, y).
function spawnSawbladeFragments(x: number, y: number, ball: Ball, particles: SawbladeParticle[]) {
  const hex = COLOR_HEX[ball.color]
  for (let i = 0; i < FRAG_PER_BALL; i++) {
    // Fan upward and to the sides — fragments fly away from the cut point.
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6
    const speed = 4 + Math.random() * 5
    particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 12,
      size: 5 + Math.random() * 4,
      color: hex,
      life: 0.85,  // fragments fade faster so sparks remain dominant
      type: 'fragment',
      rotation: Math.random() * Math.PI * 2,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
    })
  }
}

// Spawns rock-fragment particles when the sawblade shatters a rock.
// Fewer (3-5) but larger chunks, brown palette, longer life, arced trajectory.
const ROCK_FRAG_MIN = 3
const ROCK_FRAG_MAX = 5
function spawnRockFragments(x: number, y: number, particles: SawbladeParticle[]) {
  const palette = [ROCK_COLORS.base, ROCK_COLORS.highlight, ROCK_COLORS.shadow]
  const count = ROCK_FRAG_MIN + Math.floor(Math.random() * (ROCK_FRAG_MAX - ROCK_FRAG_MIN + 1))
  for (let i = 0; i < count; i++) {
    // Symmetric upward fan — chunks fly off both sides and up.
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
    const speed = 3 + Math.random() * 4
    particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 10,
      size: 7 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 0.7,  // ~420ms at lifeDecay=1/36 — matches spec's 400ms target
      type: 'rock-fragment',
      rotation: Math.random() * Math.PI * 2,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
    })
    // Store spin via the rotation-scratch field used by the physics tick.
    ;(particles[particles.length - 1] as SawbladeParticle & { spin?: number }).spin =
      (Math.random() - 0.5) * 0.3
  }
}

// Draws one jagged lightning bolt from (x0,y0) to (x1,y1). `t` 0..1 drives
// the wobble animation; `seed` makes each bolt deterministically different.
function drawLightningBolt(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  t: number,
  alpha: number,
  seed: number,
) {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 2) return
  const perpX = -dy / len, perpY = dx / len

  const SEGS = 7
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let i = 1; i < SEGS; i++) {
    const frac = i / SEGS
    const mx = x0 + dx * frac, my = y0 + dy * frac
    const wobble = Math.sin(t * Math.PI * 6 + seed * 2.7 + i * 1.6) * len * 0.14
    ctx.lineTo(mx + perpX * wobble, my + perpY * wobble)
  }
  ctx.lineTo(x1, y1)

  // Wide soft glow
  ctx.strokeStyle = 'rgba(100,150,255,0.28)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowBlur = 0
  ctx.stroke()
  // Mid glow
  ctx.strokeStyle = 'rgba(140,185,255,0.55)'
  ctx.lineWidth = 2.5
  ctx.stroke()
  // Bright core
  ctx.strokeStyle = '#D8EEFF'
  ctx.lineWidth = 0.9
  ctx.shadowColor = '#FFFFFF'
  ctx.shadowBlur = 10
  ctx.stroke()
  ctx.restore()
}

// Y position of the platform for a given seesaw side at a given angle.
function targetFallY(state: GameState, seesawIndex: number, side: 'left' | 'right'): number {
  const sw = state.seesaws[seesawIndex]
  const platformY = side === 'left'
    ? PIVOT_Y + ARM_LENGTH * Math.sin(sw.angle)
    : PIVOT_Y - ARM_LENGTH * Math.sin(sw.angle)
  const stackHeight = side === 'left' ? sw.left.length : sw.right.length
  return platformY - BALL_RADIUS - stackHeight * BALL_SPACING
}

// Builds the ordered segment list for one catapult event against the *current*
// visual seesaw snapshot. Also pops the flying ball off its source column so
// the board reads correctly while the ball is airborne. The ball is pushed
// onto its destination column by the caller once the final segment completes.
function buildSegments(
  visual: SeesawState[],
  evt: CatapultEvent,
): FlightSegment[] {
  // Remove the flying ball from its source column (top of stack).
  const srcSeesaw = visual[slotToSeesaw(evt.fromSlot)]
  const srcSide = slotSide(evt.fromSlot)
  const srcStack = srcSide === 'left' ? srcSeesaw.left : srcSeesaw.right
  srcStack.pop()
  srcSeesaw.angle = computeAngle(srcSeesaw.left, srcSeesaw.right)

  // Launch anchor: where the ball was sitting (one above the new top of stack).
  const launch = slotAnchor(visual, evt.fromSlot, srcStack.length)

  // Ball from LEFT slot → flies RIGHT (right is heavier, seesaw tips right).
  // Ball from RIGHT slot → flies LEFT (left is heavier, seesaw tips left).
  const dir: 1 | -1 = slotSide(evt.fromSlot) === 'left' ? 1 : -1
  const distance = Math.abs(evt.diff)

  // Total flight time, split evenly across the travelled distance.
  const totalDuration = Math.min(MAX_FLIGHT_MS, distance * MS_PER_SLOT)

  // Walk the path slot-by-slot, breaking into segments at every screen edge
  // crossing (slot 11 → 0 going right, slot 0 → 11 going left). Each leg is
  // one contiguous on-screen run; zero-slot legs represent an immediate exit
  // or re-entry at an edge.
  type Leg = { fromSlot: number; toSlot: number; slots: number; crossesAfter: boolean }
  const legs: Leg[] = []
  let cursor = evt.fromSlot
  let remaining = distance

  while (true) {
    const slotsToEdge = dir === 1 ? (NUM_SLOTS - 1 - cursor) : cursor
    const take = Math.min(remaining, slotsToEdge)
    const willCross = remaining > take  // more to travel after this leg → will wrap

    legs.push({
      fromSlot: cursor,
      toSlot: cursor + dir * take,
      slots: take,
      crossesAfter: willCross,
    })

    cursor += dir * take
    remaining -= take

    if (!willCross) break  // no wrap needed — done

    // Cross the screen edge: costs 1 slot of travel.
    cursor = dir === 1 ? 0 : NUM_SLOTS - 1
    remaining -= 1

    if (remaining === 0) {
      // No on-screen travel after the wrap — add a zero-slot re-entry leg so
      // the fade-in landing animation is visible at the destination.
      legs.push({ fromSlot: cursor, toSlot: cursor, slots: 0, crossesAfter: false })
      break
    }
  }

  const destStackLen = (() => {
    const sw = visual[slotToSeesaw(evt.toSlot)]
    return slotSide(evt.toSlot) === 'left' ? sw.left.length : sw.right.length
  })()

  const edgeRightX = CW + BALL_RADIUS * 2
  const edgeLeftX = -BALL_RADIUS * 2

  const segments: FlightSegment[] = []
  let rotationAccum = 0

  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li]
    const isFirst = li === 0
    const isLast = li === legs.length - 1
    const startsAfterWrap = li > 0 && legs[li - 1].crossesAfter

    const start = isFirst
      ? launch
      : slotAnchor(visual, leg.fromSlot)
    const end = isLast
      ? slotAnchor(visual, evt.toSlot, destStackLen)
      : { x: dir === 1 ? edgeRightX : edgeLeftX, y: PIVOT_Y - ARM_LENGTH }

    const realStart = isFirst
      ? start
      : { x: dir === 1 ? edgeLeftX : edgeRightX, y: PIVOT_Y - ARM_LENGTH }

    const legSlots = Math.max(leg.slots, 0.5)
    const duration = Math.max(
      80,
      (totalDuration * legSlots) / Math.max(distance, 1),
    )
    const arc = (legSlots + (leg.crossesAfter ? 1 : 0)) * ARC_PER_SLOT
    const rotation = ((legSlots / 4) * Math.PI * 2) * dir

    segments.push({
      ball: evt.ball,
      duration,
      x0: isFirst ? start.x : realStart.x,
      y0: isFirst ? start.y : realStart.y,
      x1: end.x,
      y1: end.y,
      arc,
      rotation,
      rotationStart: rotationAccum,
      fade: legs.length === 1 ? 'none' : (isLast || startsAfterWrap) ? 'in' : 'out',
    })
    rotationAccum += rotation
  }

  return segments
}

export default function GameCanvas({
  gameState,
  onDrop,
  onCraneMove,
  onCraneSetPosition,
  onConsumeCatapult,
  onConsumeMatch,
  onConsumeSawblade,
  onConsumeBlitz,
  onRestart,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const stateRef = useRef(gameState)
  stateRef.current = gameState

  const onConsumeCatapultRef = useRef(onConsumeCatapult)
  onConsumeCatapultRef.current = onConsumeCatapult
  const onConsumeMatchRef = useRef(onConsumeMatch)
  onConsumeMatchRef.current = onConsumeMatch
  const onConsumeSawbladeRef = useRef(onConsumeSawblade)
  onConsumeSawbladeRef.current = onConsumeSawblade
  const onConsumeBlitzRef = useRef(onConsumeBlitz)
  onConsumeBlitzRef.current = onConsumeBlitz
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const onCraneSetPositionRef = useRef(onCraneSetPosition)
  onCraneSetPositionRef.current = onCraneSetPosition
  const onRestartRef = useRef(onRestart)
  onRestartRef.current = onRestart

  const animRef = useRef<{
    craneCurrentX: number
    craneTargetX: number
    craneMoveStartX: number
    craneMoveStartT: number
    craneMoveDuration: number
    isMoving: boolean

    isReleasing: boolean
    releaseStartT: number
    pendingDrop: null | { seesawIndex: number; side: 'left' | 'right' }

    fallingBall: null | { x: number; y: number; vy: number; ball: Ball }
    fallTarget: number
    pendingDropAfterFall: null | { seesawIndex: number; side: 'left' | 'right' }

    queuedDrop: boolean

    // --- Catapult chain replay ---
    catapultSeq: number | null            // seq currently being / already animated
    catapultVisual: SeesawState[] | null  // evolving board snapshot during replay
    catapultEvents: CatapultEvent[]       // remaining events in the chain
    catapultPendingFinishSeq: number | null // seq to commit once chain ends
    segments: FlightSegment[]             // remaining segments of current event
    segIndex: number
    segStartT: number
    currentEvent: CatapultEvent | null

    // --- Match dissolve replay ---
    dissolveSeq: number | null            // seq currently being / already animated
    dissolveGroups: MatchGroup[]          // remaining cascade rounds
    dissolveVisual: SeesawState[] | null  // snapshot with doomed balls present
    dissolveBallIds: Set<string>          // balls beaming out in the active group
    dissolveStartT: number                // start time of the active group
    dissolveFinishSeq: number | null      // seq to commit once all groups done

    // --- Sawblade special effect ---
    sawbladeRotation: number              // continuous spin angle (rad)
    sawbladeLastTickT: number             // last frame timestamp for rotation step
    sawbladeSeq: number | null            // seq of pending sawblade event
    // Per-ball grind phases:
    //   'bounce'    → initial deflection after landing (visual only)
    //   'grind'     → blade progressively descends through one ball, continuous sparks
    //   'finishing' → wait for trailing particles to fade, then commit
    sawbladePhase: 'idle' | 'bounce' | 'grind' | 'finishing'
    sawbladePhaseStartT: number
    sawbladeImpactX: number               // fixed X of the arm being cleared
    sawbladeImpactY: number               // Y where falling animation stopped
    sawbladeCurrentY: number              // blade's current grinding Y (live)
    sawbladePrevY: number                 // Y where the current grind started (used for sub-progress + cut Y)
    sawbladeBallsToGrind: Ball[]          // remaining balls top-first
    sawbladeVisualSeesaws: SeesawState[] | null  // board with not-yet-cleared balls
    sawbladeSeesawIdx: number
    sawbladeSideAnim: 'left' | 'right'
    sawbladeParticles: SawbladeParticle[]
    sawbladeLastSparkT: number            // timestamp of last continuous spark pulse
    sawbladeFinishSeq: number | null      // seq to commit once animation ends

    // --- Blitz (lightning ball) special effect ---
    blitzSeq: number | null
    blitzPending: boolean          // registered, waiting for catapult to finish
    blitzPhase: 'idle' | 'flash' | 'chain'
    blitzPhaseStartT: number
    blitzBallX: number             // screen X of the landed blitz ball
    blitzBallY: number             // screen Y of the landed blitz ball
    blitzTargets: Array<{ x: number; y: number }>  // screen positions of target balls
    blitzVisualSeesaws: SeesawState[] | null        // pre-clear board snapshot
    blitzAnimT: number             // 0..1 loop for plasma arc rotation
    blitzLastTickT: number
    blitzFinishSeq: number | null

    // Override duration for the next crane move (set by touch handler to scale
    // with jump distance; consumed and cleared by the cranePositionIndex effect).
    pendingMoveDuration: number | null
  }>({
    craneCurrentX: craneXForIndex(gameState.cranePositionIndex),
    craneTargetX: craneXForIndex(gameState.cranePositionIndex),
    craneMoveStartX: craneXForIndex(gameState.cranePositionIndex),
    craneMoveStartT: 0,
    craneMoveDuration: CRANE_MOVE_DURATION,
    isMoving: false,
    isReleasing: false,
    releaseStartT: 0,
    pendingDrop: null,
    fallingBall: null,
    fallTarget: 0,
    pendingDropAfterFall: null,
    queuedDrop: false,
    catapultSeq: null,
    catapultVisual: null,
    catapultEvents: [],
    catapultPendingFinishSeq: null,
    segments: [],
    segIndex: 0,
    segStartT: 0,
    currentEvent: null,
    dissolveSeq: null,
    dissolveGroups: [],
    dissolveVisual: null,
    dissolveBallIds: new Set(),
    dissolveStartT: 0,
    dissolveFinishSeq: null,
    sawbladeRotation: 0,
    sawbladeLastTickT: 0,
    sawbladeSeq: null,
    sawbladePhase: 'idle' as 'idle' | 'bounce' | 'grind' | 'finishing',
    sawbladeLastSparkT: 0,
    sawbladePhaseStartT: 0,
    sawbladeImpactX: 0,
    sawbladeImpactY: 0,
    sawbladeCurrentY: 0,
    sawbladePrevY: 0,
    sawbladeBallsToGrind: [] as Ball[],
    sawbladeVisualSeesaws: null as SeesawState[] | null,
    sawbladeSeesawIdx: 0,
    sawbladeSideAnim: 'left' as 'left' | 'right',
    sawbladeParticles: [],
    sawbladeFinishSeq: null,
    blitzSeq: null,
    blitzPending: false,
    blitzPhase: 'idle' as 'idle' | 'flash' | 'chain',
    blitzPhaseStartT: 0,
    blitzBallX: 0,
    blitzBallY: 0,
    blitzTargets: [] as Array<{ x: number; y: number }>,
    blitzVisualSeesaws: null as SeesawState[] | null,
    blitzAnimT: 0,
    blitzLastTickT: 0,
    blitzFinishSeq: null,
    pendingMoveDuration: null,
  })

  const isAnimatingCatapult = useCallback(() => {
    const a = animRef.current
    return a.catapultVisual !== null
  }, [])

  const isAnimatingDissolve = useCallback(() => {
    const a = animRef.current
    return a.dissolveVisual !== null
  }, [])

  const isAnimatingSawblade = useCallback(() => {
    const a = animRef.current
    return a.sawbladePhase !== 'idle' || a.sawbladeVisualSeesaws !== null
  }, [])

  const isAnimatingBlitz = useCallback(() => {
    const a = animRef.current
    return a.blitzPhase !== 'idle' || a.blitzPending || a.blitzVisualSeesaws !== null
  }, [])

  // Input is locked while releasing, while a ball falls, while a catapult
  // chain is replaying, while a match dissolve is animating, OR while a
  // special effect is running.
  const isInputLocked = useCallback(() => {
    const a = animRef.current
    return (
      a.isReleasing ||
      a.fallingBall !== null ||
      isAnimatingCatapult() ||
      isAnimatingDissolve() ||
      isAnimatingSawblade() ||
      isAnimatingBlitz()
    )
  }, [isAnimatingCatapult, isAnimatingDissolve, isAnimatingSawblade, isAnimatingBlitz])

  const targetCraneX = useCallback((posIndex: number) => craneXForIndex(posIndex), [])

  // React to crane position / restart coming from props.
  useEffect(() => {
    const a = animRef.current
    const newTarget = targetCraneX(gameState.cranePositionIndex)

    const isFreshStart =
      gameState.cranePositionIndex === 0 &&
      gameState.seesaws.every(sw => sw.left.length === 0 && sw.right.length === 0) &&
      gameState.score === 0

    if (isFreshStart) {
      a.craneCurrentX = newTarget
      a.craneTargetX = newTarget
      a.isMoving = false
      a.isReleasing = false
      a.pendingDrop = null
      a.fallingBall = null
      a.queuedDrop = false
      // Abort any in-flight catapult chain on restart.
      a.catapultSeq = null
      a.catapultVisual = null
      a.catapultEvents = []
      a.catapultPendingFinishSeq = null
      a.segments = []
      a.currentEvent = null
      // Abort any in-flight dissolve on restart.
      a.dissolveSeq = null
      a.dissolveGroups = []
      a.dissolveVisual = null
      a.dissolveBallIds = new Set()
      a.dissolveFinishSeq = null
      // Abort any in-flight sawblade effect on restart.
      a.sawbladeSeq = null
      a.sawbladePhase = 'idle'
      a.sawbladeParticles = []
      a.sawbladeFinishSeq = null
      a.sawbladeBallsToGrind = []
      a.sawbladeVisualSeesaws = null
      // Abort any in-flight blitz effect on restart.
      a.blitzSeq = null
      a.blitzPending = false
      a.blitzPhase = 'idle'
      a.blitzVisualSeesaws = null
      a.blitzTargets = []
      a.blitzFinishSeq = null
      return
    }

    if (newTarget !== a.craneTargetX) {
      a.craneMoveStartX = a.craneCurrentX
      a.craneTargetX = newTarget
      a.craneMoveStartT = performance.now()
      a.craneMoveDuration = a.pendingMoveDuration ?? CRANE_MOVE_DURATION
      a.pendingMoveDuration = null
      a.isMoving = true
    }
  }, [gameState.cranePositionIndex, gameState.seesaws, gameState.score, targetCraneX])

  // Detect a fresh catapult chain and kick off the replay.
  useEffect(() => {
    const pending = gameState.pendingCatapult
    if (!pending) return
    const a = animRef.current
    if (a.catapultSeq === pending.seq) return

    a.catapultSeq = pending.seq
    a.catapultVisual = cloneSeesaws(pending.preCatapultSeesaws)
    a.catapultEvents = [...pending.events]
    a.catapultPendingFinishSeq = pending.seq
    a.segments = []
    a.segIndex = 0
    a.currentEvent = null
  }, [gameState.pendingCatapult])

  // Detect a fresh match-dissolve side-channel. We only record it here; the
  // tick loop starts the first group once any preceding catapult replay for
  // the same seq has finished (catapult → match ordering, per spec).
  useEffect(() => {
    const pending = gameState.pendingMatch
    if (!pending) return
    const a = animRef.current
    if (a.dissolveSeq === pending.seq) return

    a.dissolveSeq = pending.seq
    a.dissolveGroups = pending.groups.map(g => ({
      ballIds: [...g.ballIds],
      seesaws: cloneSeesaws(g.seesaws),
    }))
    a.dissolveFinishSeq = pending.seq
    a.dissolveVisual = null
    a.dissolveBallIds = new Set()
  }, [gameState.pendingMatch])

  // Detect a fresh sawblade event. Initialises the sequential per-ball grind
  // animation. The sawblade visually continues from where the falling-ball
  // animation stopped (sawbladeImpactY), then drops to the first ball and
  // begins sparks → fragments cycling through each cleared ball top-to-bottom.
  useEffect(() => {
    const pending = gameState.pendingSawblade
    if (!pending) return
    const a = animRef.current
    if (a.sawbladeSeq === pending.seq) return

    a.sawbladeSeq = pending.seq
    a.sawbladeFinishSeq = pending.seq

    // clearedBalls order: index 0 = bottom, last = top (arm array order).
    // Reverse so index 0 = top ball (first to be cut).
    a.sawbladeBallsToGrind = [...pending.clearedBalls].reverse()
    a.sawbladeSeesawIdx = pending.seesawIndex
    a.sawbladeSideAnim = pending.side

    // Rebuild the visual board with all cleared balls still present —
    // the real state has already removed them.
    a.sawbladeVisualSeesaws = cloneSeesaws(stateRef.current.seesaws)
    const visualArm = a.sawbladeVisualSeesaws[pending.seesawIndex][pending.side]
    for (const b of pending.clearedBalls) visualArm.push(b)  // re-add bottom-to-top

    // impactY = where the falling blade stopped (one BALL_SPACING above the top
    // ball). After the bounce the phase machine does nextfall to the first ball.
    a.sawbladeCurrentY = a.sawbladeImpactY
    a.sawbladePhase = 'bounce'
    a.sawbladePhaseStartT = performance.now()
  }, [gameState.pendingSawblade])

  // Detect a fresh blitz event. Registers animation data; the actual phase
  // machine starts in the tick loop once any preceding catapult has settled.
  useEffect(() => {
    const pending = gameState.pendingBlitz
    if (!pending) return
    const a = animRef.current
    if (a.blitzSeq === pending.seq) return

    a.blitzSeq = pending.seq
    a.blitzFinishSeq = pending.seq
    a.blitzPending = true
    a.blitzPhase = 'idle'

    // Snapshot board with cleared balls still present
    a.blitzVisualSeesaws = cloneSeesaws(pending.preBlitzSeesaws)

    // Compute screen position of the blitz ball itself (top of its arm)
    const blitzSw = pending.preBlitzSeesaws[pending.seesawIndex]
    const blitzCx = seesawCenterX(pending.seesawIndex)
    const blitzArmEnd = pending.side === 'left'
      ? leftArmEnd(blitzCx, blitzSw.angle)
      : rightArmEnd(blitzCx, blitzSw.angle)
    const blitzArm = blitzSw[pending.side]
    a.blitzBallX = blitzArmEnd.x
    a.blitzBallY = blitzArmEnd.y - BALL_RADIUS - (blitzArm.length - 1) * BALL_SPACING

    // Compute screen positions of all target balls
    a.blitzTargets = pending.clearedBalls.map(({ seesawIndex: si, side, stackIndex: h }) => {
      const sw = pending.preBlitzSeesaws[si]
      const cx = seesawCenterX(si)
      const armEnd = side === 'left' ? leftArmEnd(cx, sw.angle) : rightArmEnd(cx, sw.angle)
      return {
        x: armEnd.x,
        y: armEnd.y - BALL_RADIUS - h * BALL_SPACING,
      }
    })
  }, [gameState.pendingBlitz])

  // RAF loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const startNextSegmentOrEvent = (now: number) => {
      const a = animRef.current
      if (!a.catapultVisual) return

      // Finished all segments of the current event → commit ball to dest.
      if (a.currentEvent && a.segIndex >= a.segments.length) {
        const evt = a.currentEvent
        const sw = a.catapultVisual[slotToSeesaw(evt.toSlot)]
        const side = slotSide(evt.toSlot)
        const stack = side === 'left' ? sw.left : sw.right
        // Only land if the slot is a real on-board slot (lost balls have no
        // valid toSlot stack — guarded by event generation, but be safe).
        stack.push(evt.ball)
        sw.angle = computeAngle(sw.left, sw.right)
        a.currentEvent = null
        a.segments = []
      }

      // Load the next event.
      if (!a.currentEvent && a.catapultEvents.length > 0) {
        const evt = a.catapultEvents.shift()!
        a.currentEvent = evt
        a.segments = buildSegments(a.catapultVisual, evt)
        a.segIndex = 0
        a.segStartT = now
        return
      }

      // No current event and no more events → chain complete.
      if (!a.currentEvent && a.catapultEvents.length === 0) {
        const finishSeq = a.catapultPendingFinishSeq
        a.catapultVisual = null
        a.catapultPendingFinishSeq = null
        a.segments = []
        if (finishSeq !== null) onConsumeCatapultRef.current(finishSeq)
      }
    }

    // Loads the next match group (or finishes the dissolve sequence). Called
    // once the previous group's 3.3s timeline elapses, and once the catapult
    // replay for this seq has fully committed (catapult → match ordering).
    const advanceDissolve = (now: number) => {
      const a = animRef.current
      if (a.dissolveGroups.length > 0) {
        const g = a.dissolveGroups.shift()!
        a.dissolveVisual = g.seesaws
        a.dissolveBallIds = new Set(g.ballIds)
        a.dissolveStartT = now
        return
      }
      // No more groups → commit the already-computed final state.
      const finishSeq = a.dissolveFinishSeq
      a.dissolveVisual = null
      a.dissolveBallIds = new Set()
      a.dissolveFinishSeq = null
      if (finishSeq !== null) onConsumeMatchRef.current(finishSeq)
    }

    // Maps elapsed ms within a group to per-ball { phase, t }. All balls in
    // the group share one timeline, so they beam out perfectly in sync.
    const buildDissolveAnim = (
      ids: Set<string>,
      elapsed: number,
      frame: number,
    ): DissolveAnim => {
      let phase = 0
      let acc = 0
      for (let p = 0; p < DISSOLVE_PHASE_MS.length; p++) {
        if (elapsed < acc + DISSOLVE_PHASE_MS[p]) {
          phase = p
          break
        }
        acc += DISSOLVE_PHASE_MS[p]
        phase = p
      }
      const t = Math.min(1, (elapsed - acc) / DISSOLVE_PHASE_MS[phase])
      const map: DissolveAnim = new Map()
      for (const id of ids) {
        map.set(id, { phase: phase as 0 | 1 | 2 | 3 | 4, t, frame })
      }
      return map
    }

    let frameCount = 0

    const tick = () => {
      if (!running) return
      const a = animRef.current
      const now = performance.now()
      frameCount++

      // Crane glide
      if (a.isMoving) {
        const t = Math.min(1, (now - a.craneMoveStartT) / a.craneMoveDuration)
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        a.craneCurrentX = a.craneMoveStartX + (a.craneTargetX - a.craneMoveStartX) * eased
        if (t >= 1) {
          a.craneCurrentX = a.craneTargetX
          a.isMoving = false
          if (a.queuedDrop && !a.isReleasing && !a.fallingBall && !isAnimatingCatapult() && stateRef.current.phase !== 'gameover') {
            a.queuedDrop = false
            triggerRelease()
          }
        }
      }

      // Release animation
      let releaseProgress = 0
      if (a.isReleasing) {
        const t = Math.min(1, (now - a.releaseStartT) / CRANE_RELEASE_DURATION)
        releaseProgress = t
        if (t >= 1) {
          a.isReleasing = false
          if (a.pendingDrop) {
            const pos = a.pendingDrop
            a.pendingDropAfterFall = pos
            a.pendingDrop = null
            const posIndex = pos.seesawIndex * 2 + (pos.side === 'left' ? 0 : 1)
            const armEndX = craneXForIndex(posIndex)
            a.fallingBall = {
              x: armEndX,
              y: CRANE_GRIP_Y,
              vy: FALL_INITIAL_VY,
              ball: stateRef.current.nextBall,
            }
            a.fallTarget = targetFallY(stateRef.current, pos.seesawIndex, pos.side)
          }
        }
      }

      // Falling ball
      if (a.fallingBall) {
        a.fallingBall.vy += FALL_GRAVITY
        a.fallingBall.y += a.fallingBall.vy
        if (a.fallingBall.y >= a.fallTarget) {
          // Capture impact position BEFORE clearing — used by the upcoming
          // sawblade effect (if this was a sawblade drop).
          a.sawbladeImpactX = a.fallingBall.x
          a.sawbladeImpactY = a.fallTarget
          a.fallingBall = null
          const drop = a.pendingDropAfterFall
          a.pendingDropAfterFall = null
          if (drop) onDropRef.current(drop.seesawIndex, drop.side)
        }
      }

      // Continuous sawblade rotation. While cutting, the blade slows briefly
      // (resistance at the ball's hard outer layer) then accelerates through
      // the softer middle. In the gap between balls it spins fastest (no load).
      {
        const dt = a.sawbladeLastTickT === 0 ? 16 : Math.min(64, now - a.sawbladeLastTickT)
        a.sawbladeLastTickT = now
        let spinRate = SAWBLADE_SPIN_PER_SEC
        if (a.sawbladePhase === 'bounce') {
          spinRate = SAWBLADE_SPIN_PER_SEC * 2
        } else if (a.sawbladePhase === 'grind') {
          const t = Math.min(1, (now - a.sawbladePhaseStartT) / SAWBLADE_GRIND_MS)
          if (t < GRIND_CUT_END) {
            const cutT = t / GRIND_CUT_END
            // 0..0.2: resistance ramp 1.5x → 0.6x. 0.2..1.0: acceleration 0.6x → 4.5x.
            spinRate = cutT < 0.2
              ? SAWBLADE_SPIN_PER_SEC * (1.5 - 0.9 * (cutT / 0.2))
              : SAWBLADE_SPIN_PER_SEC * (0.6 + 3.9 * ((cutT - 0.2) / 0.8))
          } else {
            spinRate = SAWBLADE_SPIN_PER_SEC * 5  // free spin through inter-ball gap
          }
        } else if (a.sawbladePhase === 'finishing') {
          spinRate = SAWBLADE_SPIN_PER_SEC * 3
        }
        a.sawbladeRotation += spinRate * (dt / 1000)
      }

      // Sawblade particle physics + sequential per-ball phase advancement
      if (a.sawbladeParticles.length > 0 || a.sawbladePhase !== 'idle') {
        // Integrate each particle — vx/vy are now proper typed fields.
        const survivors: SawbladeParticle[] = []
        const lifeDecay = 1 / 36  // ~600ms total at 60fps
        for (const p of a.sawbladeParticles) {
          p.x += p.vx ?? 0
          p.y += p.vy ?? 0
          if (p.type === 'spark') {
            // Gravity + drag for realistic spark arc
            if (p.vy !== undefined) p.vy += 0.2
            if (p.vx !== undefined) p.vx *= 0.95
            if (p.vy !== undefined) p.vy *= 0.95
          } else {
            // Fragments: more gravity, less drag
            if (p.vy !== undefined) p.vy += 0.35
          }
          // Fragment spin (spin stored as a scratch field on the particle object)
          const spin = (p as SawbladeParticle & { spin?: number }).spin
          if (spin !== undefined && p.rotation !== undefined) p.rotation += spin
          p.life -= lifeDecay
          if (p.life > 0) survivors.push(p)
        }
        a.sawbladeParticles = survivors

        // Sequential phase machine
        const elapsed = now - a.sawbladePhaseStartT

        if (a.sawbladePhase === 'bounce') {
          // Sine arc: blade jumps up to BOUNCE_HEIGHT at t=0.5, settles 4px lower
          // at t=1 so it ends right above the first ball top (= impactY + gap).
          const t = Math.min(1, elapsed / SAWBLADE_BOUNCE_MS)
          const gap = BALL_SPACING - 2 * BALL_RADIUS
          a.sawbladeCurrentY = a.sawbladeImpactY
            - SAWBLADE_BOUNCE_HEIGHT * Math.sin(Math.PI * t)
            + gap * t
          if (t >= 1) {
            // Bounce ended right above the first ball: blade bottom touches ball top.
            a.sawbladeCurrentY = a.sawbladeImpactY + gap
            a.sawbladePrevY = a.sawbladeCurrentY
            a.sawbladePhase = 'grind'
            a.sawbladePhaseStartT = now
            a.sawbladeLastSparkT = 0
            // Impact burst at the contact point — that satisfying first-touch
            // spark spike that turns into the continuous grinding stream.
            spawnSawbladeSparks(a.sawbladeImpactX, a.sawbladeCurrentY + BALL_RADIUS, a.sawbladeParticles)
          }

        } else if (a.sawbladePhase === 'grind') {
          // Continuous descent through ball body (36px) + 4px gap to next ball.
          // Total descent per ball = BALL_SPACING. Cutting (sparks + ball clip)
          // happens in [GRIND_CUT_START, GRIND_CUT_END]; outside that the blade
          // is in empty space between balls.
          const t = Math.min(1, elapsed / SAWBLADE_GRIND_MS)
          // Two-segment motion: 90% of the time cuts the ball body (slower,
          // with mild resistance), last 10% snaps through the 4px gap.
          const cutEnd = 2 * BALL_RADIUS                 // 36px traversed during cut
          const gap    = BALL_SPACING - 2 * BALL_RADIUS  // 4px traversed in gap
          if (t < GRIND_CUT_END) {
            const cutT = t / GRIND_CUT_END
            // Slight ease-out so the blade decelerates as it cuts through softer middle.
            const eased = 1 - Math.pow(1 - cutT, 1.6)
            a.sawbladeCurrentY = a.sawbladePrevY + cutEnd * eased
          } else {
            const gapT = (t - GRIND_CUT_END) / (1 - GRIND_CUT_END)
            a.sawbladeCurrentY = a.sawbladePrevY + cutEnd + gap * gapT
          }

          // Spark pulses while cutting (the blade is overlapping the ball body)
          if (t >= GRIND_CUT_START && t <= GRIND_CUT_END) {
            if (now - a.sawbladeLastSparkT >= SAWBLADE_SPARK_INTERVAL_MS) {
              const cutY = a.sawbladeCurrentY + BALL_RADIUS
              spawnSawbladeSparksPulse(a.sawbladeImpactX, cutY, a.sawbladeParticles)
              a.sawbladeLastSparkT = now
            }
          }

          if (t >= 1) {
            // Cut complete: pop ball, spawn fragments where the ball was.
            const ball = a.sawbladeBallsToGrind[0]
            if (ball) {
              // Ball center was BALL_RADIUS + gap above prevY (= where blade bottom
              // touched the ball top), and BALL_RADIUS below that. In total: ball
              // center is at prevY + 2*BALL_RADIUS - BALL_RADIUS = prevY + BALL_RADIUS.
              // Equivalently: ball center is currentY - (BALL_SPACING - BALL_RADIUS).
              const ballCenterY = a.sawbladePrevY + BALL_RADIUS
              if (ball.kind === 'rock') {
                spawnRockFragments(a.sawbladeImpactX, ballCenterY, a.sawbladeParticles)
              } else {
                spawnSawbladeFragments(a.sawbladeImpactX, ballCenterY, ball, a.sawbladeParticles)
              }
              if (a.sawbladeVisualSeesaws) {
                const arm = a.sawbladeVisualSeesaws[a.sawbladeSeesawIdx][a.sawbladeSideAnim]
                arm.pop()
              }
              a.sawbladeBallsToGrind.shift()
            }
            if (a.sawbladeBallsToGrind.length > 0) {
              // Seamlessly start grinding the next ball — blade is already at
              // the top contact point of ball N-1 (= old prevY + BALL_SPACING).
              a.sawbladePrevY = a.sawbladeCurrentY
              a.sawbladePhase = 'grind'
              a.sawbladePhaseStartT = now
              a.sawbladeLastSparkT = 0
              // Small re-contact spark spike when biting into the next ball.
              spawnSawbladeSparksPulse(a.sawbladeImpactX, a.sawbladeCurrentY + BALL_RADIUS, a.sawbladeParticles)
              spawnSawbladeSparksPulse(a.sawbladeImpactX, a.sawbladeCurrentY + BALL_RADIUS, a.sawbladeParticles)
              spawnSawbladeSparksPulse(a.sawbladeImpactX, a.sawbladeCurrentY + BALL_RADIUS, a.sawbladeParticles)
            } else {
              a.sawbladePhase = 'finishing'
              a.sawbladePhaseStartT = now
            }
          }

        } else if (a.sawbladePhase === 'finishing') {
          // Wait for trailing particles to drain, then commit the final state.
          if (a.sawbladeParticles.length === 0) {
            const finishSeq = a.sawbladeFinishSeq
            a.sawbladePhase = 'idle'
            a.sawbladeSeq = null
            a.sawbladeFinishSeq = null
            a.sawbladeVisualSeesaws = null
            if (finishSeq !== null) onConsumeSawbladeRef.current(finishSeq)
          }
        }
      }

      // Blitz animation — waits for catapult to finish before starting.
      // Phase machine: idle → flash (100ms) → chain (520ms) → idle.
      {
        const dt = a.blitzLastTickT === 0 ? 16 : Math.min(64, now - a.blitzLastTickT)
        a.blitzLastTickT = now
        a.blitzAnimT = (a.blitzAnimT + dt / 1500) % 1  // full rotation every 1.5s

        // Start flash only once catapult has settled
        if (!a.catapultVisual && a.blitzPending) {
          a.blitzPending = false
          a.blitzPhase = 'flash'
          a.blitzPhaseStartT = now
        }

        if (a.blitzPhase === 'flash') {
          if (now - a.blitzPhaseStartT >= BLITZ_FLASH_MS) {
            a.blitzPhase = 'chain'
            a.blitzPhaseStartT = now
          }
        } else if (a.blitzPhase === 'chain') {
          if (now - a.blitzPhaseStartT >= BLITZ_CHAIN_MS) {
            // Balls gone — switch to live state
            a.blitzVisualSeesaws = null
            const finishSeq = a.blitzFinishSeq
            a.blitzPhase = 'idle'
            a.blitzSeq = null
            a.blitzFinishSeq = null
            if (finishSeq !== null) onConsumeBlitzRef.current(finishSeq)
          }
        }
      }

      // Catapult chain replay
      let catapultBall: CraneAnim['catapultBall'] = null
      if (a.catapultVisual) {
        if (!a.currentEvent) {
          startNextSegmentOrEvent(now)
        }
        if (a.currentEvent && a.segIndex < a.segments.length) {
          const seg = a.segments[a.segIndex]
          const t = Math.min(1, (now - a.segStartT) / seg.duration)
          // Parabola: linear in x, quadratic dip for the arc.
          const x = seg.x0 + (seg.x1 - seg.x0) * t
          const baseY = seg.y0 + (seg.y1 - seg.y0) * t
          const y = baseY - seg.arc * 4 * t * (1 - t)
          const rotation = seg.rotationStart + seg.rotation * t

          let alpha = 1
          if (seg.fade === 'out') {
            const fadeStart = 1 - FADE_MS / seg.duration
            alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart))
          } else if (seg.fade === 'in') {
            const fadeEnd = FADE_MS / seg.duration
            alpha = t > fadeEnd ? 1 : Math.max(0, t / fadeEnd)
          }

          catapultBall = { x, y, ball: seg.ball, rotation, alpha }

          if (t >= 1) {
            a.segIndex += 1
            a.segStartT = now
            if (a.segIndex >= a.segments.length) {
              startNextSegmentOrEvent(now)
            }
          }
        }
      }

      // Match dissolve replay. Starts only after catapult AND blitz have
      // settled so the beam plays on the board as left by the blitz clear.
      let dissolveAnim: DissolveAnim | undefined
      if (!a.catapultVisual && !a.blitzPending && a.blitzPhase === 'idle' && a.dissolveSeq !== null) {
        if (!a.dissolveVisual && a.dissolveGroups.length > 0) {
          advanceDissolve(now)
        }
        if (a.dissolveVisual) {
          const elapsed = now - a.dissolveStartT
          if (elapsed >= DISSOLVE_TOTAL_MS) {
            advanceDissolve(now)
          }
          if (a.dissolveVisual) {
            dissolveAnim = buildDissolveAnim(
              a.dissolveBallIds,
              Math.min(elapsed, DISSOLVE_TOTAL_MS - 1),
              frameCount,
            )
          }
        }
      }

      // Build the GameState to render. Priority: catapult → dissolve →
      // blitz visual (target balls still present) → sawblade → live.
      const baseState = stateRef.current
      const renderState: GameState = a.catapultVisual
        ? { ...baseState, seesaws: a.catapultVisual }
        : a.dissolveVisual
          ? { ...baseState, seesaws: a.dissolveVisual }
          : a.blitzVisualSeesaws
            ? { ...baseState, seesaws: a.blitzVisualSeesaws }
            : a.sawbladeVisualSeesaws
              ? { ...baseState, seesaws: a.sawbladeVisualSeesaws }
              : baseState

      const craneAnim: CraneAnim = {
        craneX: a.craneCurrentX,
        releaseProgress: a.isReleasing ? releaseProgress : 0,
        showBallInCrane:
          !a.isReleasing &&
          !a.fallingBall &&
          !a.pendingDrop &&
          !isAnimatingCatapult() &&
          !isAnimatingDissolve() &&
          !isAnimatingSawblade() &&
          !isAnimatingBlitz(),
        fallingBall: a.fallingBall
          ? { x: a.fallingBall.x, y: a.fallingBall.y, ball: a.fallingBall.ball }
          : null,
        catapultBall,
        sawbladeRotation: a.sawbladeRotation,
        sawbladeParticles: a.sawbladeParticles,
        // Show grinding sawblade during the sequential ball-clear animation.
        sawbladeGrindPos: a.sawbladePhase !== 'idle'
          ? { x: a.sawbladeImpactX, y: a.sawbladeCurrentY }
          : undefined,
        // Cut the ball currently being ground at the blade's bottom edge so
        // the ball appears to be shaved down progressively as the blade descends.
        grindCut: a.sawbladePhase === 'grind' && a.sawbladeBallsToGrind.length > 0
          ? { ballId: a.sawbladeBallsToGrind[0].id, cutY: a.sawbladeCurrentY + BALL_RADIUS }
          : undefined,
        blitzAnimT: a.blitzAnimT,
      }

      render(ctx, renderState, craneAnim, dissolveAnim)

      // Blitz overlay — drawn directly on canvas after normal board render
      // so it sits on top of balls, below nothing (full-screen effect).
      if (a.blitzPhase !== 'idle') {
        const elapsed = now - a.blitzPhaseStartT

        if (a.blitzPhase === 'flash') {
          const t = Math.min(1, elapsed / BLITZ_FLASH_MS)
          const flashA = Math.pow(1 - t, 1.5) * 0.8
          ctx.save()
          // Central blast at blitz ball position
          ctx.globalAlpha = flashA
          ctx.fillStyle = '#B0D0FF'
          ctx.shadowColor = '#FFFFFF'
          ctx.shadowBlur = 35
          ctx.beginPath()
          ctx.arc(a.blitzBallX, a.blitzBallY, BALL_RADIUS * 3.5, 0, Math.PI * 2)
          ctx.fill()
          // Simultaneous flash at each target ball
          ctx.shadowBlur = 18
          for (const tgt of a.blitzTargets) {
            ctx.beginPath()
            ctx.arc(tgt.x, tgt.y, BALL_RADIUS * 1.8, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()

        } else if (a.blitzPhase === 'chain') {
          const t = Math.min(1, elapsed / BLITZ_CHAIN_MS)

          // Lightning bolts from blitz ball to every target
          const boltAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25
          for (let i = 0; i < a.blitzTargets.length; i++) {
            const tgt = a.blitzTargets[i]
            drawLightningBolt(
              ctx,
              a.blitzBallX, a.blitzBallY,
              tgt.x, tgt.y,
              t * 3 + i * 0.4,   // stagger wobble per bolt
              boltAlpha,
              i,
            )
          }

          // Blitz ball pulse glow (electric corona while firing)
          const coronaAlpha = (0.4 + 0.3 * Math.sin(t * Math.PI * 8)) * boltAlpha
          ctx.save()
          ctx.globalAlpha = coronaAlpha
          ctx.fillStyle = 'rgba(120,170,255,0.5)'
          ctx.shadowColor = '#AACCFF'
          ctx.shadowBlur = 20
          ctx.beginPath()
          ctx.arc(a.blitzBallX, a.blitzBallY, BALL_RADIUS * 1.7, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

          // White bleach overlay on target balls — they glow white then vanish
          if (t > 0.55) {
            const bleachA = Math.min(1, (t - 0.55) / 0.35) * 0.9
            ctx.save()
            ctx.globalAlpha = bleachA
            ctx.fillStyle = '#DDEEFF'
            ctx.shadowColor = '#AACCFF'
            ctx.shadowBlur = 16
            for (const tgt of a.blitzTargets) {
              ctx.beginPath()
              ctx.arc(tgt.x, tgt.y, BALL_RADIUS + 1, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.restore()
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const triggerRelease = () => {
      const a = animRef.current
      if (a.isReleasing || a.fallingBall || isAnimatingCatapult()) return
      const idx = stateRef.current.cranePositionIndex
      const seesawIndex = Math.floor(idx / 2)
      const side: 'left' | 'right' = idx % 2 === 0 ? 'left' : 'right'

      const sw = stateRef.current.seesaws[seesawIndex]
      const stackLen = side === 'left' ? sw.left.length : sw.right.length
      if (stackLen >= 8) return // MAX_STACK

      a.pendingDrop = { seesawIndex, side }
      a.isReleasing = true
      a.releaseStartT = performance.now()
    }

    ;(animRef.current as unknown as { _triggerRelease: () => void })._triggerRelease = triggerRelease

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [isAnimatingCatapult, isAnimatingDissolve, isAnimatingSawblade, isAnimatingBlitz])

  // Tab-visibility skip: if the tab is hidden mid-dissolve, snap to the final
  // state immediately (balls already removed in logic) — no stuck animation.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return
      const a = animRef.current
      if (a.dissolveSeq === null && a.dissolveVisual === null) return
      const finishSeq = a.dissolveFinishSeq ?? a.dissolveSeq
      a.dissolveGroups = []
      a.dissolveVisual = null
      a.dissolveBallIds = new Set()
      a.dissolveFinishSeq = null
      if (finishSeq !== null) onConsumeMatchRef.current(finishSeq)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current

      if (state.phase === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onRestart()
        }
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (!isInputLocked()) onCraneMove(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (!isInputLocked()) onCraneMove(1)
          break
        case 'ArrowDown':
        case 'Enter':
        case ' ': {
          e.preventDefault()
          if (isInputLocked()) break
          const a = animRef.current
          if (a.isMoving) {
            a.queuedDrop = true
          } else {
            const trigger = (animRef.current as unknown as { _triggerRelease: () => void })._triggerRelease
            trigger?.()
          }
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCraneMove, onRestart, isInputLocked])

  // Non-passive touch handler so we can preventDefault and block page scroll.
  // React's synthetic onTouchStart is passive by default, so we register natively.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      const state = stateRef.current
      if (state.phase === 'gameover') {
        onRestartRef.current()
        return
      }
      if (isInputLocked()) return

      const touch = e.changedTouches[0]
      const rect = canvas.getBoundingClientRect()
      const logicalX = (touch.clientX - rect.left) * (CW / rect.width)

      // Find the nearest of the 12 discrete crane slots.
      let nearestSlot = 0
      let nearestDist = Infinity
      for (let i = 0; i < NUM_SLOTS; i++) {
        const dist = Math.abs(craneXForIndex(i) - logicalX)
        if (dist < nearestDist) { nearestDist = dist; nearestSlot = i }
      }

      const slotDist = Math.abs(nearestSlot - state.cranePositionIndex)
      if (slotDist === 0) {
        // Crane already at the tapped slot — fire immediately.
        const trigger = (animRef.current as unknown as { _triggerRelease: () => void })._triggerRelease
        trigger?.()
      } else {
        // Scale move duration by distance so long jumps animate smoothly.
        animRef.current.pendingMoveDuration = slotDist <= 1
          ? CRANE_MOVE_DURATION
          : Math.min(slotDist * 75, 500)
        animRef.current.queuedDrop = true
        onCraneSetPositionRef.current(nearestSlot)
      }
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    return () => canvas.removeEventListener('touchstart', onTouchStart)
  }, [isInputLocked])

  const handleClick = useCallback(() => {
    if (gameState.phase === 'gameover') onRestart()
  }, [gameState.phase, onRestart])

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      onClick={handleClick}
      tabIndex={0}
      role="application"
      aria-label="Swing game board. Use arrow keys or tap to move the crane and drop the ball."
      className="block w-full max-w-[900px] rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      style={{ aspectRatio: `${CW}/${CH}`, touchAction: 'none' }}
    />
  )
}
