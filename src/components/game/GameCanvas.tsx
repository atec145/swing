'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { GameState } from '@/game/types'
import { render } from '@/game/renderer'
import { CW, CH, MARGIN_X, SEESAW_SPACING } from '@/game/constants'
import { seesawCenterX } from '@/game/physics'

interface Props {
  gameState: GameState
  onDrop: (seesawIndex: number, side: 'left' | 'right') => void
  onHover: (seesawIndex: number | null, side: 'left' | 'right' | null) => void
  onRestart: () => void
}

function hitTest(x: number): { seesaw: number; side: 'left' | 'right' } | null {
  for (let i = 0; i < 6; i++) {
    const left = MARGIN_X + i * SEESAW_SPACING
    const right = left + SEESAW_SPACING
    if (x >= left && x < right) {
      const cx = seesawCenterX(i)
      return { seesaw: i, side: x < cx ? 'left' : 'right' }
    }
  }
  return null
}

export default function GameCanvas({ gameState, onDrop, onHover, onRestart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // Render loop — redraws whenever gameState changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      render(ctx, gameState)
    })

    return () => cancelAnimationFrame(rafRef.current)
  }, [gameState])

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = CW / rect.width
    const scaleY = CH / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState.phase === 'gameover') {
      onRestart()
      return
    }
    const pos = getCanvasPos(e)
    if (!pos) return
    const hit = hitTest(pos.x)
    if (hit) onDrop(hit.seesaw, hit.side)
  }, [gameState.phase, getCanvasPos, onDrop, onRestart])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState.phase === 'gameover') return
    const pos = getCanvasPos(e)
    if (!pos) return
    const hit = hitTest(pos.x)
    if (hit) onHover(hit.seesaw, hit.side)
    else onHover(null, null)
  }, [gameState.phase, getCanvasPos, onHover])

  const handleMouseLeave = useCallback(() => {
    onHover(null, null)
  }, [onHover])

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="block w-full max-w-[900px] cursor-crosshair rounded-xl"
      style={{ aspectRatio: `${CW}/${CH}` }}
    />
  )
}
