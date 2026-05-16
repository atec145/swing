// Original Swing color palette, ordered by unlock progression.
// First 5 are starting colors (confirmed from PC DOS screenshots).
// Last 3 unlock progressively as score grows.
export type Color =
  | 'green'
  | 'blue'
  | 'red'
  | 'navy'
  | 'gray'
  | 'orange'
  | 'yellow'
  | 'cyan'

export type Variant = 'full' | 'half'

export interface Ball {
  id: string
  color: Color
  variant: Variant
  weight: number
}

// Discrete 3-state tilt model. A seesaw is always in exactly one of these
// states — there is no continuous angle range.
//   'left'     → left side heavier  (left arm down, right arm up)
//   'balanced' → equal weight       (horizontal)
//   'right'    → right side heavier (right arm down, left arm up)
export type SeesawTilt = 'left' | 'balanced' | 'right'

export interface SeesawState {
  left: Ball[]  // index 0 = bottom, last = top
  right: Ball[] // index 0 = bottom, last = top
  // radians — derived from `tilt`, only ever one of three fixed values
  // (-MAX_ANGLE, 0, +MAX_ANGLE). Kept for the renderer + match geometry.
  angle: number
  tilt: SeesawTilt // the authoritative discrete state
}

// A single catapult throw within a chain reaction. The animation layer
// replays these one-by-one; the game logic produces the final state
// immediately and emits the ordered list as a side-channel.
export interface CatapultEvent {
  fromSlot: number // departure position 0..11 (seesaw*2 + side)
  toSlot: number   // landing position 0..11 after modulo-12 wrap
  ball: Ball       // the flying ball (color, weight, variant)
  diff: number     // weight difference — drives flight distance + arc height
}

export type GamePhase = 'waiting' | 'gameover'

export interface GameState {
  seesaws: SeesawState[]
  score: number
  nextBall: Ball
  phase: GamePhase
  hoverSeesaw: number | null
  hoverSide: 'left' | 'right' | null
  // Crane position: 0..11 (2 positions per seesaw: left & right).
  // Index = seesawIndex * 2 + (side === 'left' ? 0 : 1).
  cranePositionIndex: number
  // Side-channel for the animation layer: the catapult chain produced by the
  // most recent DROP and the pre-catapult board snapshot to replay it from.
  // null when there is nothing to animate. Carries a monotonically increasing
  // `seq` so the canvas can detect a fresh drop even if events repeat.
  pendingCatapult: {
    seq: number
    events: CatapultEvent[]
    preCatapultSeesaws: SeesawState[]
  } | null
}
