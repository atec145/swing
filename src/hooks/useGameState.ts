'use client'

import { useReducer, useCallback } from 'react'
import type { GameState } from '@/game/types'
import { createInitialState, dropBall } from '@/game/logic'

type Action =
  | { type: 'DROP'; seesawIndex: number; side: 'left' | 'right' }
  | { type: 'HOVER'; seesawIndex: number | null; side: 'left' | 'right' | null }
  | { type: 'RESTART' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'DROP':
      return dropBall(state, action.seesawIndex, action.side)
    case 'HOVER':
      return { ...state, hoverSeesaw: action.seesawIndex, hoverSide: action.side }
    case 'RESTART':
      return createInitialState()
    default:
      return state
  }
}

export function useGameState() {
  const [gameState, dispatch] = useReducer(reducer, undefined, createInitialState)

  const handleDrop = useCallback((seesawIndex: number, side: 'left' | 'right') => {
    dispatch({ type: 'DROP', seesawIndex, side })
  }, [])

  const handleHover = useCallback((seesawIndex: number | null, side: 'left' | 'right' | null) => {
    dispatch({ type: 'HOVER', seesawIndex, side })
  }, [])

  const handleRestart = useCallback(() => {
    dispatch({ type: 'RESTART' })
  }, [])

  return { gameState, handleDrop, handleHover, handleRestart }
}
