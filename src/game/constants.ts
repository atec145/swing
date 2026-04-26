import type { Color } from './types'

export const NUM_SEESAWS = 6
export const MAX_STACK = 8
export const MATCH_MIN = 3

export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow']

export const COLOR_HEX: Record<Color, string> = {
  red: '#FF4455',
  blue: '#4499FF',
  green: '#44DD88',
  yellow: '#FFCC22',
  purple: '#CC44FF',
}

export const COLOR_GLOW: Record<Color, string> = {
  red: 'rgba(255,68,85,0.6)',
  blue: 'rgba(68,153,255,0.6)',
  green: 'rgba(68,221,136,0.6)',
  yellow: 'rgba(255,204,34,0.6)',
  purple: 'rgba(204,68,255,0.6)',
}

// Canvas dimensions
export const CW = 900
export const CH = 580

// Seesaw geometry
export const MARGIN_X = 40
export const SEESAW_SPACING = (CW - MARGIN_X * 2) / NUM_SEESAWS // ~136.67
export const PIVOT_Y = 490
export const ARM_LENGTH = 58
export const BALL_RADIUS = 18
export const BALL_SPACING = 40 // center-to-center vertical
export const MAX_ANGLE = Math.PI / 5.5 // ~32°
export const ANGLE_SCALE = 0.13 // radians per net weight unit

// Minimum weight difference needed to trigger a catapult
export const CATAPULT_THRESHOLD = 3

// Weight pool (lower weights more frequent)
export const WEIGHT_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5]
