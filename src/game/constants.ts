import type { Color } from './types'

export const NUM_SEESAWS = 6
export const MAX_STACK = 8
export const MATCH_MIN = 3

// Full unlock-ordered color list. Tier index slices this array.
// The first 5 entries are the starting palette confirmed from PC DOS screenshots
// (green, blue, red, dark-navy, gray/silver). The remaining unlock with score.
export const COLORS: Color[] = [
  'green',
  'blue',
  'red',
  'navy',
  'gray',
  'orange',
  'yellow',
  'cyan',
]

export const COLOR_HEX: Record<Color, string> = {
  green: '#3DCB5C',
  blue: '#3D7DD8',
  red: '#E03A3A',
  navy: '#1F2A6B',
  gray: '#B5BCC4',
  orange: '#F08A1E',
  yellow: '#E8D634',
  cyan: '#3CC9D6',
}

export const COLOR_GLOW: Record<Color, string> = {
  green: 'rgba(61,203,92,0.55)',
  blue: 'rgba(61,125,216,0.55)',
  red: 'rgba(224,58,58,0.55)',
  navy: 'rgba(31,42,107,0.7)',
  gray: 'rgba(181,188,196,0.5)',
  orange: 'rgba(240,138,30,0.55)',
  yellow: 'rgba(232,214,52,0.55)',
  cyan: 'rgba(60,201,214,0.55)',
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

// Weight pool — original game shows weights up to 10. Lower weights remain
// the most common; weights 6+ are rare to keep arm balance interesting
// without trivially overloading one side.
export const WEIGHT_POOL = [
  1, 1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3,
  4, 4, 4,
  5, 5,
  6, 6,
  7,
  8,
  9,
  10,
]

// ---------------------------------------------------------------------------
// Progressive difficulty tiers
//
// Each tier specifies how many of the unlock-ordered COLORS are active and
// whether the half-ball variant is in the pool. Score is monotonically
// increasing, so transitions are strictly one-way.
//
// Reached when score >= minScore. Pick the highest tier whose minScore <=
// current score.
// ---------------------------------------------------------------------------

export interface DifficultyTier {
  minScore: number
  activeColors: number       // how many entries from COLORS are in play
  variants: Variant[]        // ball variants in the generation pool
}

import type { Variant } from './types'

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { minScore: 0,     activeColors: 5, variants: ['full'] },
  { minScore: 1000,  activeColors: 6, variants: ['full'] },
  { minScore: 3000,  activeColors: 7, variants: ['full'] },
  { minScore: 6000,  activeColors: 7, variants: ['full', 'half'] },
  { minScore: 10000, activeColors: 8, variants: ['full', 'half'] },
]
