'use client'

import { useCallback, useEffect, useState } from 'react'
import GameCanvas from './GameCanvas'
import GameUI from './GameUI'
import HighscoreModal from './HighscoreModal'
import { useGameState } from '@/hooks/useGameState'
import { useTracking } from '@/hooks/useTracking'
import { useSoundEngine } from '@/hooks/useSoundEngine'

export default function SwingGame() {
  const {
    gameState,
    handleDrop,
    handleCraneMove,
    handleCraneSet,
    handleConsumeCatapult,
    handleConsumeMatch,
    handleConsumeSawblade,
    handleConsumeBlitz,
    handleRestart,
  } = useGameState()

  // Anonymous usage analytics (issue #14). Silent side-channel: fires one
  // POST /api/track per game-over, swallowing all errors so it can never
  // disturb gameplay.
  useTracking({ phase: gameState.phase, score: gameState.score })

  // Sound engine (issue #15). Observes the game state and synthesises sound
  // effects via the Web Audio API. Lazy: AudioContext is only created after
  // the first user interaction (browser autoplay policy).
  const { isMuted, toggleMute, playHighscore, notifyDrop } = useSoundEngine(gameState)

  // Wraps handleDrop so a synchronous user-gesture handler triggers the drop
  // sound — this is the first place the AudioContext is allowed to be unlocked.
  const onDrop = useCallback((seesawIndex: number, side: 'left' | 'right') => {
    // Reading nextBall before dispatching is safe — the reducer doesn't change
    // it until the dropBall logic runs synchronously inside dispatch.
    const kind = gameState.nextBall.kind ?? 'normal'
    notifyDrop(kind)
    handleDrop(seesawIndex, side)
  }, [gameState.nextBall.kind, notifyDrop, handleDrop])

  // Highscore modal: opens on game-over, closes on restart/manual dismiss.
  // We use a separate state (rather than driving directly off `phase`) so the
  // player can dismiss the modal and still see the final board.
  const [showHighscores, setShowHighscores] = useState(false)
  const [highscoresViewOnly, setHighscoresViewOnly] = useState(false)

  useEffect(() => {
    if (gameState.phase === 'gameover') {
      setHighscoresViewOnly(false)
      setShowHighscores(true)
    } else {
      setShowHighscores(false)
    }
  }, [gameState.phase])

  function handleShowHighscores() {
    setHighscoresViewOnly(true)
    setShowHighscores(true)
  }

  return (
    <div className="w-full max-w-[900px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-black/60 bg-[#0D0F1A]">
      <GameCanvas
        gameState={gameState}
        onDrop={onDrop}
        onCraneMove={handleCraneMove}
        onCraneSetPosition={handleCraneSet}
        onConsumeCatapult={handleConsumeCatapult}
        onConsumeMatch={handleConsumeMatch}
        onConsumeSawblade={handleConsumeSawblade}
        onConsumeBlitz={handleConsumeBlitz}
        onRestart={handleRestart}
      />
      <div className="border-t border-slate-800 bg-gray-950/80">
        <GameUI
          score={gameState.score}
          nextBall={gameState.queuedBall}
          phase={gameState.phase}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onRestart={handleRestart}
          onShowHighscores={handleShowHighscores}
        />
      </div>

      <HighscoreModal
        open={showHighscores}
        score={gameState.score}
        onClose={() => setShowHighscores(false)}
        onRestart={handleRestart}
        onHighscoreSubmitted={playHighscore}
        viewOnly={highscoresViewOnly}
      />
    </div>
  )
}
