export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple'

export interface Ball {
  id: string
  color: Color
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
