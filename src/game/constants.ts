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

// Crane (top-of-canvas keyboard-controlled launcher)
export const CRANE_RAIL_Y = 28           // y-position of the overhead rail
export const CRANE_BODY_H = 56           // height of the crane body below the rail
export const CRANE_GRIP_Y = CRANE_RAIL_Y + CRANE_BODY_H // y of ball center when held
export const CRANE_MOVE_DURATION = 150   // ms — smooth glide between positions
export const CRANE_RELEASE_DURATION = 180 // ms — gripper opens before ball falls
export const FALL_GRAVITY = 0.65          // px / frame^2 (assuming 60fps)
export const FALL_INITIAL_VY = 0.4        // px / frame at release
export const NUM_CRANE_POSITIONS = NUM_SEESAWS * 2 // 12 discrete x positions

// Seesaw geometry
export const MARGIN_X = 40
export const SEESAW_SPACING = (CW - MARGIN_X * 2) / NUM_SEESAWS // ~136.67
export const PIVOT_Y = 490
export const ARM_LENGTH = 45  // horizontal offset of each column from seesaw center; reduced from 58 so adjacent-seesaw balls never overlap
export const BALL_RADIUS = 18
export const BALL_SPACING = 40 // center-to-center vertical
// The single fixed tilt angle. In the 3-state model a non-balanced seesaw
// always sits at exactly ±MAX_ANGLE — there is no continuous range.
export const MAX_ANGLE = Math.asin(BALL_SPACING / ARM_LENGTH) // ~62° — column travel at full imbalance equals exactly one ball level

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
// Each tier specifies how many of the unlock-ordered COLORS are active as
// full balls (`activeColors`) and, independently, how many of those same
// unlock-ordered colors may also appear as half-ball variants
// (`activeHalfColors`). A tier with activeHalfColors === 0 generates no
// half-balls at all (same as the original early game). activeHalfColors is
// always <= activeColors and half-balls follow the SAME unlock order as
// full balls (COLORS[0..activeHalfColors-1]).
//
// Score is monotonically increasing, so transitions are strictly one-way.
// At most ONE new color (full OR half) unlocks per threshold, so the ramp
// has no simultaneous unlocks and no large dead zones:
//
//   gaps: 400 600 800 1000 1200 1400 1600 1800 2000 2200 2400
//   — gradual linear growth, not exponential. Peak (8 full + 8 half)
//   is only reached at 15400.
//
// Reached when score >= minScore. Pick the highest tier whose minScore <=
// current score.
// ---------------------------------------------------------------------------

export interface DifficultyTier {
  minScore: number
  activeColors: number       // how many COLORS entries are in play as full balls
  activeHalfColors: number   // how many COLORS entries may also appear as half balls
}

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { minScore: 0,     activeColors: 5, activeHalfColors: 0 }, // base — original-game floor
  { minScore: 400,   activeColors: 6, activeHalfColors: 0 }, // +full orange
  { minScore: 1000,  activeColors: 7, activeHalfColors: 0 }, // +full yellow
  { minScore: 1800,  activeColors: 8, activeHalfColors: 0 }, // +full cyan (all 8 full)
  { minScore: 2800,  activeColors: 8, activeHalfColors: 1 }, // +half green
  { minScore: 4000,  activeColors: 8, activeHalfColors: 2 }, // +half blue
  { minScore: 5400,  activeColors: 8, activeHalfColors: 3 }, // +half red
  { minScore: 7000,  activeColors: 8, activeHalfColors: 4 }, // +half navy
  { minScore: 8800,  activeColors: 8, activeHalfColors: 5 }, // +half gray
  { minScore: 10800, activeColors: 8, activeHalfColors: 6 }, // +half orange
  { minScore: 13000, activeColors: 8, activeHalfColors: 7 }, // +half yellow
  { minScore: 15400, activeColors: 8, activeHalfColors: 8 }, // +half cyan (peak)
]
