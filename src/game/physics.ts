import type { Ball, SeesawTilt } from './types'
import { MAX_ANGLE, MARGIN_X, SEESAW_SPACING, ARM_LENGTH, PIVOT_Y } from './constants'

export function totalWeight(balls: Ball[]): number {
  return balls.reduce((sum, b) => sum + b.weight, 0)
}

// Discrete 3-state classifier. Pure comparison of total weights — the single
// source of truth for which way a seesaw tips.
export function computeTilt(left: Ball[], right: Ball[]): SeesawTilt {
  const lw = totalWeight(left)
  const rw = totalWeight(right)
  if (lw > rw) return 'left'
  if (rw > lw) return 'right'
  return 'balanced'
}

// Fixed-value mapping from the discrete tilt to a render angle. There is no
// continuous range any more: left → -MAX_ANGLE, balanced → 0, right → +MAX_ANGLE.
// Positive angle = left side down (kept consistent with the previous model).
export function angleForTilt(tilt: SeesawTilt): number {
  if (tilt === 'left') return MAX_ANGLE
  if (tilt === 'right') return -MAX_ANGLE
  return 0
}

export function computeAngle(left: Ball[], right: Ball[]): number {
  return angleForTilt(computeTilt(left, right))
}

export function seesawCenterX(i: number): number {
  return MARGIN_X + SEESAW_SPACING * (i + 0.5)
}

export interface Point {
  x: number
  y: number
}

// Sliding-column model: X is always fixed at cx ± ARM_LENGTH.
// Only Y moves — the heavy side descends, the light side rises.
export function leftArmEnd(cx: number, angle: number): Point {
  return {
    x: cx - ARM_LENGTH,
    y: PIVOT_Y + ARM_LENGTH * Math.sin(angle),
  }
}

export function rightArmEnd(cx: number, angle: number): Point {
  return {
    x: cx + ARM_LENGTH,
    y: PIVOT_Y - ARM_LENGTH * Math.sin(angle),
  }
}
