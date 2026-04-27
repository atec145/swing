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

export interface SeesawState {
  left: Ball[]  // index 0 = bottom, last = top
  right: Ball[] // index 0 = bottom, last = top
  angle: number // radians, positive = left side down
}

export type GamePhase = 'waiting' | 'gameover'

export interface GameState {
  seesaws: SeesawState[]
  score: number
  nextBall: Ball
  phase: GamePhase
  hoverSeesaw: number | null
  hoverSide: 'left' | 'right' | null
}
