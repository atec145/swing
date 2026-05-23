'use client'

import { useRef, useEffect } from 'react'
import type { Ball } from '@/game/types'
import { COLOR_HEX, COLOR_GLOW } from '@/game/constants'
import { drawBall, drawBlitz, drawRock, drawSawblade } from '@/game/renderer'
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

// Renders the next ball using the real canvas draw functions so it looks
// identical to what appears in the crane and on the seesaws.
function NextBallPreview({ ball }: { ball: Ball }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SIZE = 56
    const cx = SIZE / 2
    const cy = SIZE / 2
    let rafId = 0
    const start = performance.now()

    const frame = (ts: number) => {
      ctx.clearRect(0, 0, SIZE, SIZE)

      if (ball.kind === 'blitz') {
        const t = ((ts - start) % 2000) / 2000
        drawBlitz(ctx, cx, cy, t, ball.weight, 1, ball.charged !== false)
        rafId = requestAnimationFrame(frame)
      } else if (ball.kind === 'sawblade') {
        const rotation = ((ts - start) / 1400) * Math.PI * 2
        drawSawblade(ctx, cx, cy, rotation)
        rafId = requestAnimationFrame(frame)
      } else if (ball.kind === 'rock') {
        drawRock(ctx, cx, cy, ball.id)
      } else {
        drawBall(ctx, cx, cy, COLOR_HEX[ball.color], COLOR_GLOW[ball.color], ball.weight, ball.variant, 1, 0, undefined, ball)
      }
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [ball])

  const kind = ball.kind ?? 'normal'
  const ariaLabel = kind === 'normal'
    ? `Next ball: ${ball.variant} ${ball.color}, weight ${ball.weight}`
    : `Next ball: ${kind}`

  return (
    <canvas
      ref={canvasRef}
      width={56}
      height={56}
      aria-label={ariaLabel}
      style={{ width: 44, height: 44 }}
    />
  )
}
