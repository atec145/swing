'use client'

import type { Ball } from '@/game/types'
import { COLOR_HEX } from '@/game/constants'
import { Button } from '@/components/ui/button'
import { Trophy } from 'lucide-react'

interface Props {
  score: number
  nextBall: Ball
  phase: 'waiting' | 'gameover'
  onRestart: () => void
  onShowHighscores: () => void
}

export default function GameUI({ score, nextBall, phase, onRestart, onShowHighscores }: Props) {
  return (
    <div className="flex items-center justify-between px-2 py-3 select-none">
      {/* Score */}
      <div className="text-left">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-slate-500 uppercase tracking-widest">Score</p>
          <button
            onClick={onShowHighscores}
            aria-label="Highscores anzeigen"
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            <Trophy size={12} />
          </button>
        </div>
        <p className="text-3xl font-bold text-white tabular-nums">{score.toLocaleString()}</p>
      </div>

      {/* Next ball */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-slate-500 uppercase tracking-widest">Next</p>
        <NextBallPreview ball={nextBall} />
      </div>

      {/* Controls hint */}
      <div className="text-right">
        <p className="text-xs text-slate-600">
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">&larr;</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">&rarr;</kbd>{' '}
          move crane &nbsp;
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">&darr;</kbd>{' '}
          drop ball
        </p>
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
  // Sawblade preview — small SVG icon hinting at the special ball.
  if (ball.kind === 'sawblade') {
    return (
      <div
        role="img"
        aria-label="Next ball: sawblade (special)"
        className="flex items-center justify-center rounded-full w-10 h-10 shadow-lg animate-spin"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #F0F4FB, #5A6271)',
          boxShadow: '0 0 14px 3px rgba(255,200,60,0.55)',
          animationDuration: '1.4s',
        }}
      >
        <SawbladeIcon />
      </div>
    )
  }

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

// Small SVG of a sawblade — 10 teeth, central arbor, gold-tinted edges.
// Used in the next-ball preview when a sawblade is queued.
function SawbladeIcon() {
  const teeth = 10
  const pts: string[] = []
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2
    const a1 = ((i + 0.55) / teeth) * Math.PI * 2
    const a2 = ((i + 0.85) / teeth) * Math.PI * 2
    const aMid = (a0 + a1) / 2
    // Inner radius 8, outer 14 (over a 32x32 viewBox centered at 16,16)
    pts.push(`${16 + Math.cos(a0) * 8},${16 + Math.sin(a0) * 8}`)
    pts.push(`${16 + Math.cos(aMid) * 14},${16 + Math.sin(aMid) * 14}`)
    pts.push(`${16 + Math.cos(a2) * 8},${16 + Math.sin(a2) * 8}`)
  }
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" aria-hidden>
      <polygon points={pts.join(' ')} fill="#E8C25A" stroke="#7A6020" strokeWidth="0.4" />
      <circle cx="16" cy="16" r="7" fill="#C8CFDB" stroke="#3A4150" strokeWidth="0.6" />
      <circle cx="16" cy="16" r="2.4" fill="#1A1F2C" />
    </svg>
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
