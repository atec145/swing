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

// Ball category — most balls are 'normal' (standard match mechanics).
// Special balls like 'sawblade' bypass weight physics and trigger custom effects.
// The optional field keeps existing code working: missing/undefined == 'normal'.
export type BallKind = 'normal' | 'sawblade'

export interface Ball {
  id: string
  color: Color
  variant: Variant
  weight: number
  kind?: BallKind
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

// One cascade round of a match clear. The animation layer beams these balls
// out together; the logic layer has already removed them and updated the
// score. `seesaws` is the board snapshot *before* this group was removed so
// the renderer can keep drawing the doomed balls during the dissolve.
export interface MatchGroup {
  ballIds: string[]
  seesaws: SeesawState[]
}

export type GamePhase = 'waiting' | 'gameover'

export interface GameState {
  seesaws: SeesawState[]
  score: number
  nextBall: Ball     // ball currently held in the crane
  queuedBall: Ball   // ball shown in the preview ("next")
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
  // Side-channel for the dissolve animation. Each entry in `groups` is one
  // cascade round (first match first); the canvas beams each group out fully
  // before starting the next. The logic has already removed the balls and
  // updated the score; this is purely a visual recording. null when nothing
  // is pending. Shares `seq` with its originating drop.
  pendingMatch: {
    seq: number
    groups: MatchGroup[]
  } | null
  // Side-channel for the sawblade special-effect animation. Carries the
  // affected seesaw + arm and the balls that were cleared (used for the
  // colored splinter particles). null when there is nothing to animate.
  // Shares `seq` with its originating drop.
  pendingSawblade: {
    seq: number
    seesawIndex: number
    side: 'left' | 'right'
    clearedBalls: Ball[]
  } | null
}
