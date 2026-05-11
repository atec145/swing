'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { Ball, GameState } from '@/game/types'
import { render, craneXForIndex, type CraneAnim } from '@/game/renderer'
import {
  CW, CH,
  CRANE_GRIP_Y,
  CRANE_MOVE_DURATION,
  CRANE_RELEASE_DURATION,
  FALL_GRAVITY,
  FALL_INITIAL_VY,
  BALL_RADIUS,
  BALL_SPACING,
} from '@/game/constants'
import { leftArmEnd, rightArmEnd, seesawCenterX } from '@/game/physics'

interface Props {
  gameState: GameState
  onDrop: (seesawIndex: number, side: 'left' | 'right') => void
  onCraneMove: (delta: -1 | 1) => void
  onRestart: () => void
}

// Compute the target Y the falling ball must reach for a given seesaw column
// and side. We stop the fall as soon as the ball's CENTER reaches the place
// where the new top ball would sit — that way the world snaps cleanly to the
// new game state on `dropBall()`.
function targetFallY(state: GameState, seesawIndex: number, side: 'left' | 'right'): number {
  const sw = state.seesaws[seesawIndex]
  const cx = seesawCenterX(seesawIndex)
  const armEnd = side === 'left' ? leftArmEnd(cx, sw.angle) : rightArmEnd(cx, sw.angle)
  const stackHeight = (side === 'left' ? sw.left.length : sw.right.length)
  // armEnd.y is the arm tip; first ball center sits BALL_RADIUS above that.
  return armEnd.y - BALL_RADIUS - stackHeight * BALL_SPACING
}

export default function GameCanvas({ gameState, onDrop, onCraneMove, onRestart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // The latest game state — kept in a ref so the animation loop always sees
  // the current value without re-binding the RAF callback every render.
  const stateRef = useRef(gameState)
  stateRef.current = gameState

  // Animation state — never causes re-renders. Mutated in the RAF loop.
  const animRef = useRef<{
    craneCurrentX: number
    craneTargetX: number
    craneMoveStartX: number
    craneMoveStartT: number
    craneMoveDuration: number
    isMoving: boolean

    // Release sequence
    isReleasing: boolean
    releaseStartT: number
    pendingDrop: null | { seesawIndex: number; side: 'left' | 'right' }

    // Falling ball
    fallingBall: null | { x: number; y: number; vy: number; ball: Ball }
    fallTarget: number
    pendingDropAfterFall: null | { seesawIndex: number; side: 'left' | 'right' }

    // Queued drop request waiting for crane to stop moving
    queuedDrop: boolean
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
  })

  // Whether input is currently locked (falling OR releasing).
  const isInputLocked = useCallback(() => {
    const a = animRef.current
    return a.isReleasing || a.fallingBall !== null
  }, [])

  // Compute the correct pixel X for the current crane position given actual seesaw angle.
  const targetCraneX = useCallback((posIndex: number) => {
    const seesawIdx = Math.floor(posIndex / 2)
    const angle = stateRef.current.seesaws[seesawIdx].angle
    return craneXForIndex(posIndex, angle)
  }, [])

  // React to crane position changes coming from props (CRANE_MOVE / RESTART).
  useEffect(() => {
    const a = animRef.current
    const newTarget = targetCraneX(gameState.cranePositionIndex)

    // Hard reset to instant position on game restart (cranePosition 0 + empty
    // seesaws is the canonical "fresh start" signal).
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

  // Permanent RAF loop — drives crane glide, release, and fall animations.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const tick = () => {
      if (!running) return
      const a = animRef.current
      const now = performance.now()

      // Crane glide
      if (a.isMoving) {
        const t = Math.min(1, (now - a.craneMoveStartT) / a.craneMoveDuration)
        // Ease-in-out cubic
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        a.craneCurrentX = a.craneMoveStartX + (a.craneTargetX - a.craneMoveStartX) * eased
        if (t >= 1) {
          a.craneCurrentX = a.craneTargetX
          a.isMoving = false

          // If a drop was queued while the crane was still moving, fire it now.
          if (a.queuedDrop && !a.isReleasing && !a.fallingBall && stateRef.current.phase !== 'gameover') {
            a.queuedDrop = false
            triggerRelease()
          }
        }
      }

      // Release animation (gripper opens)
      let releaseProgress = 0
      if (a.isReleasing) {
        const t = Math.min(1, (now - a.releaseStartT) / CRANE_RELEASE_DURATION)
        releaseProgress = t
        if (t >= 1) {
          a.isReleasing = false
          // Spawn the falling ball at the actual arm-end X (angle-aware),
          // so the ball doesn't jump horizontally when it lands.
          if (a.pendingDrop) {
            const pos = a.pendingDrop
            a.pendingDropAfterFall = pos
            a.pendingDrop = null
            const sw = stateRef.current.seesaws[pos.seesawIndex]
            const cx = seesawCenterX(pos.seesawIndex)
            const armEndX = pos.side === 'left'
              ? leftArmEnd(cx, sw.angle).x
              : rightArmEnd(cx, sw.angle).x
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
          // Land — trigger the actual game logic now, then hide the ball.
          const drop = a.pendingDropAfterFall
          a.fallingBall = null
          a.pendingDropAfterFall = null
          if (drop) onDrop(drop.seesawIndex, drop.side)
        }
      }

      // Draw
      const craneAnim: CraneAnim = {
        craneX: a.craneCurrentX,
        releaseProgress: a.isReleasing ? releaseProgress : 0,
        showBallInCrane: !a.isReleasing && !a.fallingBall && !a.pendingDrop,
        fallingBall: a.fallingBall
          ? { x: a.fallingBall.x, y: a.fallingBall.y, ball: a.fallingBall.ball }
          : null,
      }

      render(ctx, stateRef.current, craneAnim)
      rafRef.current = requestAnimationFrame(tick)
    }

    const triggerRelease = () => {
      const a = animRef.current
      if (a.isReleasing || a.fallingBall) return
      const idx = stateRef.current.cranePositionIndex
      const seesawIndex = Math.floor(idx / 2)
      const side: 'left' | 'right' = idx % 2 === 0 ? 'left' : 'right'

      // Refuse if the target column is already maxed out.
      const sw = stateRef.current.seesaws[seesawIndex]
      const stackLen = side === 'left' ? sw.left.length : sw.right.length
      if (stackLen >= 8) return // MAX_STACK

      a.pendingDrop = { seesawIndex, side }
      a.isReleasing = true
      a.releaseStartT = performance.now()
    }

    // Expose triggerRelease via the anim ref's closure so keyboard handler can call it
    ;(animRef.current as unknown as { _triggerRelease: () => void })._triggerRelease = triggerRelease

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [onDrop])

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
          // Allow crane movement even while ball is falling — pre-position for next drop.
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
          // Drop is blocked while releasing or ball is in flight.
          if (isInputLocked()) break
          const a = animRef.current
          if (a.isMoving) {
            // Wait until current glide finishes, then drop
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

  // Click only handles the game-over restart action (matches old UX).
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
