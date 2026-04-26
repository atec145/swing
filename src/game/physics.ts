import type { Ball } from './types'
import { MAX_ANGLE, ANGLE_SCALE, MARGIN_X, SEESAW_SPACING, ARM_LENGTH, PIVOT_Y } from './constants'

export function totalWeight(balls: Ball[]): number {
  return balls.reduce((sum, b) => sum + b.weight, 0)
}

export function computeAngle(left: Ball[], right: Ball[]): number {
  const diff = totalWeight(left) - totalWeight(right)
  return Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, diff * ANGLE_SCALE))
}

export function seesawCenterX(i: number): number {
  return MARGIN_X + SEESAW_SPACING * (i + 0.5)
}

export interface Point {
  x: number
  y: number
}

export function leftArmEnd(cx: number, angle: number): Point {
  return {
    x: cx - ARM_LENGTH * Math.cos(angle),
    y: PIVOT_Y + ARM_LENGTH * Math.sin(angle),
  }
}

export function rightArmEnd(cx: number, angle: number): Point {
  return {
    x: cx + ARM_LENGTH * Math.cos(angle),
    y: PIVOT_Y - ARM_LENGTH * Math.sin(angle),
  }
}
