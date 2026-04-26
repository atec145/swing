'use client'

import type { Ball } from '@/game/types'
import { COLOR_HEX } from '@/game/constants'

interface Props {
  score: number
  nextBall: Ball
  phase: 'waiting' | 'gameover'
  onRestart: () => void
}

export default function GameUI({ score, nextBall, phase, onRestart }: Props) {
  return (
    <div className="flex items-center justify-between px-2 py-3 select-none">
      {/* Score */}
      <div className="text-left">
        <p className="text-xs text-slate-500 uppercase tracking-widest">Score</p>
        <p className="text-3xl font-bold text-white tabular-nums">{score.toLocaleString()}</p>
      </div>

      {/* Next ball */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-slate-500 uppercase tracking-widest">Next</p>
        <div
          className="flex items-center justify-center rounded-full font-bold text-white text-sm shadow-lg"
          style={{
            width: 40,
            height: 40,
            background: `radial-gradient(circle at 35% 35%, ${lighten(COLOR_HEX[nextBall.color])}, ${COLOR_HEX[nextBall.color]})`,
            boxShadow: `0 0 14px 3px ${COLOR_HEX[nextBall.color]}66`,
          }}
        >
          {nextBall.weight}
        </div>
      </div>

      {/* Controls hint */}
      <div className="text-right">
        <p className="text-xs text-slate-600">Click left/right of each seesaw</p>
        {phase === 'gameover' && (
          <button
            onClick={onRestart}
            className="mt-1 px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Restart
          </button>
        )}
      </div>
    </div>
  )
}

function lighten(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + 70)
  const g = Math.min(255, ((num >> 8) & 0xff) + 70)
  const b = Math.min(255, (num & 0xff) + 70)
  return `rgb(${r},${g},${b})`
}
