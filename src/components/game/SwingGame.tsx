'use client'

import GameCanvas from './GameCanvas'
import GameUI from './GameUI'
import { useGameState } from '@/hooks/useGameState'

export default function SwingGame() {
  const { gameState, handleDrop, handleHover, handleRestart } = useGameState()

  return (
    <div className="w-full max-w-[900px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-black/60 bg-[#0D0F1A]">
      <GameCanvas
        gameState={gameState}
        onDrop={handleDrop}
        onHover={handleHover}
        onRestart={handleRestart}
      />
      <div className="border-t border-slate-800 bg-gray-950/80">
        <GameUI
          score={gameState.score}
          nextBall={gameState.nextBall}
          phase={gameState.phase}
          onRestart={handleRestart}
        />
      </div>
    </div>
  )
}
