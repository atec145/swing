'use client'

import type { Ball } from '@/game/types'
import { COLOR_HEX } from '@/game/constants'
import { Button } from '@/components/ui/button'

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
        <NextBallPreview ball={nextBall} />
      </div>

      {/* Controls hint */}
      <div className="text-right">
        <p className="text-xs text-slate-600">Click left/right of each seesaw</p>
        {phase === 'gameover' && (
          <Button
            onClick={onRestart}
            size="sm"
            className="mt-1 bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Restart
          </Button>
        )}
      </div>
    </div>
  )
}

function NextBallPreview({ ball }: { ball: Ball }) {
  const hex = COLOR_HEX[ball.color]
  const ariaLabel = `Next ball: ${ball.variant} ${ball.color}, weight ${ball.weight}`

  if (ball.variant === 'full') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-center justify-center rounded-full font-bold text-white text-sm shadow-lg w-10 h-10"
        style={{
          background: `radial-gradient(circle at 35% 35%, ${lighten(hex)}, ${hex})`,
          boxShadow: `0 0 14px 3px ${hex}66`,
        }}
      >
        {ball.weight}
      </div>
    )
  }

  // Half / striped ball: white base with colored equatorial band
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="relative flex items-center justify-center rounded-full font-bold text-slate-900 text-sm shadow-lg w-10 h-10 overflow-hidden bg-white border border-slate-300"
      style={{
        background: 'radial-gradient(circle at 35% 35%, #ffffff, #c8cdd6)',
        boxShadow: `0 0 14px 3px ${hex}66`,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 right-0 h-[55%]"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          background: `linear-gradient(to bottom, ${darken(hex)}, ${lighten(hex)}, ${darken(hex)})`,
        }}
      />
      <span className="relative z-10 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/95">
        {ball.weight}
      </span>
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

function darken(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (num >> 16) - 30)
  const g = Math.max(0, ((num >> 8) & 0xff) - 30)
  const b = Math.max(0, (num & 0xff) - 30)
  return `rgb(${r},${g},${b})`
}
