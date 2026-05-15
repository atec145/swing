'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { Ball, CatapultEvent, GameState, SeesawState } from '@/game/types'
import { render, craneXForIndex, slotAnchor, type CraneAnim } from '@/game/renderer'
import { computeAngle } from '@/game/physics'
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
} from '@/game/constants'

interface Props {
  gameState: GameState
  onDrop: (seesawIndex: number, side: 'left' | 'right') => void
  onCraneMove: (delta: -1 | 1) => void
  onConsumeCatapult: (seq: number) => void
  onRestart: () => void
}

const NUM_SLOTS = NUM_SEESAWS * 2

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

  const dir: 1 | -1 = evt.diff > 0 && slotSide(evt.fromSlot) === 'right' ? 1 : -1
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
  onConsumeCatapult,
  onRestart,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const stateRef = useRef(gameState)
  stateRef.current = gameState

  const onConsumeCatapultRef = useRef(onConsumeCatapult)
  onConsumeCatapultRef.current = onConsumeCatapult
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

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
  })

  const isAnimatingCatapult = useCallback(() => {
    const a = animRef.current
    return a.catapultVisual !== null
  }, [])

  // Input is locked while releasing, while a ball falls, OR while a catapult
  // chain is replaying.
  const isInputLocked = useCallback(() => {
    const a = animRef.current
    return a.isReleasing || a.fallingBall !== null || isAnimatingCatapult()
  }, [isAnimatingCatapult])

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
      return
    }

    if (newTarget !== a.craneTargetX) {
      a.craneMoveStartX = a.craneCurrentX
      a.craneTargetX = newTarget
      a.craneMoveStartT = performance.now()
      a.craneMoveDuration = CRANE_MOVE_DURATION
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

    const tick = () => {
      if (!running) return
      const a = animRef.current
      const now = performance.now()

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
          const drop = a.pendingDropAfterFall
          a.fallingBall = null
          a.pendingDropAfterFall = null
          if (drop) onDropRef.current(drop.seesawIndex, drop.side)
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

      // Build the GameState to render: during a catapult replay we substitute
      // the evolving visual snapshot so the board matches the flying ball.
      const baseState = stateRef.current
      const renderState: GameState = a.catapultVisual
        ? { ...baseState, seesaws: a.catapultVisual }
        : baseState

      const craneAnim: CraneAnim = {
        craneX: a.craneCurrentX,
        releaseProgress: a.isReleasing ? releaseProgress : 0,
        showBallInCrane:
          !a.isReleasing && !a.fallingBall && !a.pendingDrop && !isAnimatingCatapult(),
        fallingBall: a.fallingBall
          ? { x: a.fallingBall.x, y: a.fallingBall.y, ball: a.fallingBall.ball }
          : null,
        catapultBall,
      }

      render(ctx, renderState, craneAnim)
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
  }, [isAnimatingCatapult])

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
      aria-label="Swing game board. Use left and right arrow keys to move the crane, down arrow or Enter to drop the ball."
      className="block w-full max-w-[900px] rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      style={{ aspectRatio: `${CW}/${CH}` }}
    />
  )
}
