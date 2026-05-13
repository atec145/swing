'use client'

import { useReducer, useCallback } from 'react'
import type { GameState } from '@/game/types'
import { createInitialState, dropBall } from '@/game/logic'
import { NUM_CRANE_POSITIONS } from '@/game/constants'

type Action =
  | { type: 'DROP'; seesawIndex: number; side: 'left' | 'right' }
  | { type: 'CRANE_MOVE'; delta: -1 | 1 }
  | { type: 'CRANE_SET'; index: number }
  | { type: 'RESTART' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'DROP':
      return dropBall(state, action.seesawIndex, action.side)
    case 'CRANE_MOVE': {
      if (state.phase === 'gameover') return state
      const next = Math.max(
        0,
        Math.min(NUM_CRANE_POSITIONS - 1, state.cranePositionIndex + action.delta),
      )
      if (next === state.cranePositionIndex) return state
      return { ...state, cranePositionIndex: next }
    }
    case 'CRANE_SET': {
      const clamped = Math.max(0, Math.min(NUM_CRANE_POSITIONS - 1, action.index))
      if (clamped === state.cranePositionIndex) return state
      return { ...state, cranePositionIndex: clamped }
    }
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

  const handleCraneMove = useCallback((delta: -1 | 1) => {
    dispatch({ type: 'CRANE_MOVE', delta })
  }, [])

  const handleCraneSet = useCallback((index: number) => {
    dispatch({ type: 'CRANE_SET', index })
  }, [])

  const handleRestart = useCallback(() => {
    dispatch({ type: 'RESTART' })
  }, [])

  return { gameState, handleDrop, handleCraneMove, handleCraneSet, handleRestart }
}
