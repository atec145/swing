'use client'

import { useReducer, useCallback } from 'react'
import type { GameState } from '@/game/types'
import { createInitialState, dropBall } from '@/game/logic'
import { NUM_CRANE_POSITIONS } from '@/game/constants'

type Action =
  | { type: 'DROP'; seesawIndex: number; side: 'left' | 'right' }
  | { type: 'CRANE_MOVE'; delta: -1 | 1 }
  | { type: 'CRANE_SET'; index: number }
  | { type: 'CONSUME_CATAPULT'; seq: number }
  | { type: 'CONSUME_MATCH'; seq: number }
  | { type: 'CONSUME_SAWBLADE'; seq: number }
  | { type: 'CONSUME_BLITZ'; seq: number }
  | { type: 'RESTART' }

// Monotonic sequence so the animation layer can tell two consecutive drops
// apart even when they produce identical event lists. Shared by the catapult
// and match side-channels so a single drop carries one seq end-to-end.
let dropSeq = 0

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'DROP': {
      const { state: next, catapultEvents, preCatapultSeesaws, matchGroups, sawbladeEvent, blitzEvent } =
        dropBall(state, action.seesawIndex, action.side)

      if (
        catapultEvents.length === 0 &&
        matchGroups.length === 0 &&
        !sawbladeEvent &&
        !blitzEvent
      ) {
        return { ...next, pendingCatapult: null, pendingMatch: null, pendingSawblade: null, pendingBlitz: null }
      }

      // One seq per drop, shared by all side-channels. Canvas plays:
      // catapult replay → blitz FX → match dissolve (in that order).
      const seq = ++dropSeq
      return {
        ...next,
        pendingCatapult:
          catapultEvents.length > 0
            ? { seq, events: catapultEvents, preCatapultSeesaws }
            : null,
        pendingMatch:
          matchGroups.length > 0 ? { seq, groups: matchGroups } : null,
        pendingSawblade: sawbladeEvent
          ? { seq, ...sawbladeEvent }
          : null,
        pendingBlitz: blitzEvent
          ? { seq, ...blitzEvent }
          : null,
      }
    }
    case 'CONSUME_CATAPULT': {
      if (!state.pendingCatapult || state.pendingCatapult.seq !== action.seq) {
        return state
      }
      return { ...state, pendingCatapult: null }
    }
    case 'CONSUME_MATCH': {
      if (!state.pendingMatch || state.pendingMatch.seq !== action.seq) {
        return state
      }
      return { ...state, pendingMatch: null }
    }
    case 'CONSUME_SAWBLADE': {
      if (!state.pendingSawblade || state.pendingSawblade.seq !== action.seq) {
        return state
      }
      return { ...state, pendingSawblade: null }
    }
    case 'CONSUME_BLITZ': {
      if (!state.pendingBlitz || state.pendingBlitz.seq !== action.seq) {
        return state
      }
      return { ...state, pendingBlitz: null }
    }
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

  const handleConsumeCatapult = useCallback((seq: number) => {
    dispatch({ type: 'CONSUME_CATAPULT', seq })
  }, [])

  const handleConsumeMatch = useCallback((seq: number) => {
    dispatch({ type: 'CONSUME_MATCH', seq })
  }, [])

  const handleConsumeSawblade = useCallback((seq: number) => {
    dispatch({ type: 'CONSUME_SAWBLADE', seq })
  }, [])

  const handleConsumeBlitz = useCallback((seq: number) => {
    dispatch({ type: 'CONSUME_BLITZ', seq })
  }, [])

  const handleRestart = useCallback(() => {
    dispatch({ type: 'RESTART' })
  }, [])

  return {
    gameState,
    handleDrop,
    handleCraneMove,
    handleCraneSet,
    handleConsumeCatapult,
    handleConsumeMatch,
    handleConsumeSawblade,
    handleConsumeBlitz,
    handleRestart,
  }
}
