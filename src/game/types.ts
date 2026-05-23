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
// Special balls bypass match mechanics and / or weight physics:
//   - 'sawblade': weight 0, clears whole arm on landing
//   - 'rock'    : weight 15, never matches; only sawblades can remove it
//   - 'blitz'   : normal weight, triggers chain-lightning clear of all balls
//                 of the topmost neighbor's color when it lands
// The optional field keeps existing code working: missing/undefined == 'normal'.
export type BallKind = 'normal' | 'sawblade' | 'rock' | 'blitz'

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
  // Side-channel for the blitz (lightning ball) chain-clear animation.
  // Carries the position of the blitz ball, the target color, and the IDs
  // (with positions) of all balls being struck. The animation layer draws
  // jagged lightning arcs from the blitz to each target before they dissolve.
  // Shares `seq` with its originating drop.
  pendingBlitz: {
    seq: number
    seesawIndex: number
    side: 'left' | 'right'
    targetColor: Color | null   // null when no neighbor was found (no effect)
    clearedBalls: Array<{
      ball: Ball
      seesawIndex: number
      side: 'left' | 'right'
      stackIndex: number        // physical index in arm (0 = bottom)
    }>
    // Board snapshot captured just before the chain-clear removed the target
    // balls. Used by the animation layer so it can draw the balls while the
    // lightning arcs play, then switch to the live (cleared) state.
    preBlitzSeesaws: SeesawState[]
  } | null
  // Ramp-up counters for special-ball spawning. Incremented each time a ball
  // is generated; reset to 0 when that special type spawns. Used by
  // createBall() to drive the linear ramp-up probability.
  ballsSinceSawblade: number
  ballsSinceRock: number
  ballsSinceBlitz: number
}
