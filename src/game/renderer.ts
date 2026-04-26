import type { GameState } from './types'
import {
  NUM_SEESAWS, CW, CH, PIVOT_Y, ARM_LENGTH, BALL_RADIUS, BALL_SPACING,
  COLOR_HEX, COLOR_GLOW, SEESAW_SPACING, MARGIN_X,
} from './constants'
import { seesawCenterX, leftArmEnd, rightArmEnd } from './physics'

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glow: string,
  weight: number,
  alpha = 1,
) {
  ctx.save()
  ctx.globalAlpha = alpha

  // Glow
  ctx.shadowColor = glow
  ctx.shadowBlur = 16

  // Main circle
  const grad = ctx.createRadialGradient(x - BALL_RADIUS * 0.3, y - BALL_RADIUS * 0.3, 2, x, y, BALL_RADIUS)
  grad.addColorStop(0, lighten(color, 0.4))
  grad.addColorStop(1, darken(color, 0.2))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0

  // Rim
  ctx.strokeStyle = lighten(color, 0.3)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Weight number
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = `bold ${BALL_RADIUS * 0.85}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(weight), x, y + 1)

  ctx.restore()
}

function drawSeesaw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  angle: number,
  highlighted: boolean,
) {
  const lEnd = leftArmEnd(cx, angle)
  const rEnd = rightArmEnd(cx, angle)

  ctx.save()

  // Beam shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 8

  // Beam
  const beamGrad = ctx.createLinearGradient(lEnd.x, lEnd.y, rEnd.x, rEnd.y)
  beamGrad.addColorStop(0, highlighted ? '#7090FF' : '#4A5680')
  beamGrad.addColorStop(0.5, highlighted ? '#90AAFF' : '#6070A0')
  beamGrad.addColorStop(1, highlighted ? '#7090FF' : '#4A5680')
  ctx.strokeStyle = beamGrad
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(lEnd.x, lEnd.y)
  ctx.lineTo(rEnd.x, rEnd.y)
  ctx.stroke()

  ctx.shadowBlur = 0

  // Pivot triangle
  const pivotH = 18
  ctx.fillStyle = highlighted ? '#8899DD' : '#5566AA'
  ctx.beginPath()
  ctx.moveTo(cx, PIVOT_Y)
  ctx.lineTo(cx - pivotH * 0.6, PIVOT_Y + pivotH)
  ctx.lineTo(cx + pivotH * 0.6, PIVOT_Y + pivotH)
  ctx.closePath()
  ctx.fill()

  // Pivot base
  ctx.fillStyle = highlighted ? '#6677BB' : '#334488'
  ctx.fillRect(cx - 20, PIVOT_Y + pivotH, 40, 5)

  // Arm end markers
  ctx.fillStyle = highlighted ? 'rgba(150,180,255,0.7)' : 'rgba(100,120,180,0.5)'
  ctx.beginPath()
  ctx.arc(lEnd.x, lEnd.y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(rEnd.x, rEnd.y, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawDropGuide(
  ctx: CanvasRenderingContext2D,
  cx: number,
  angle: number,
  side: 'left' | 'right',
  nextColor: string,
  nextGlow: string,
  nextWeight: number,
  stackHeight: number,
) {
  const armEnd = side === 'left' ? leftArmEnd(cx, angle) : rightArmEnd(cx, angle)
  const ghostY = armEnd.y - BALL_RADIUS - stackHeight * BALL_SPACING

  // Dashed drop line
  ctx.save()
  ctx.setLineDash([4, 6])
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(armEnd.x, 20)
  ctx.lineTo(armEnd.x, ghostY - BALL_RADIUS - 4)
  ctx.stroke()
  ctx.restore()

  // Ghost ball
  drawBall(ctx, armEnd.x, ghostY, nextColor, nextGlow, nextWeight, 0.45)
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, CH)
  grad.addColorStop(0, '#0D0F1A')
  grad.addColorStop(1, '#161929')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CW, CH)

  // Column dividers (subtle)
  for (let i = 1; i < NUM_SEESAWS; i++) {
    const x = MARGIN_X + i * SEESAW_SPACING
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, PIVOT_Y - 5)
    ctx.stroke()
  }

  // Floor line
  ctx.strokeStyle = 'rgba(100,120,200,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(MARGIN_X, PIVOT_Y + 28)
  ctx.lineTo(CW - MARGIN_X, PIVOT_Y + 28)
  ctx.stroke()
}

function drawGameOver(ctx: CanvasRenderingContext2D, score: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, CW, CH)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.shadowColor = 'rgba(200,100,255,0.8)'
  ctx.shadowBlur = 30
  ctx.fillStyle = '#EE88FF'
  ctx.font = 'bold 52px system-ui'
  ctx.fillText('GAME OVER', CW / 2, CH / 2 - 30)

  ctx.shadowBlur = 10
  ctx.fillStyle = '#AACCFF'
  ctx.font = 'bold 28px system-ui'
  ctx.fillText(`Score: ${score}`, CW / 2, CH / 2 + 24)

  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '18px system-ui'
  ctx.fillText('Click to restart', CW / 2, CH / 2 + 70)

  ctx.restore()
}

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  drawBackground(ctx)

  const nextColor = COLOR_HEX[state.nextBall.color]
  const nextGlow = COLOR_GLOW[state.nextBall.color]

  for (let i = 0; i < NUM_SEESAWS; i++) {
    const sw = state.seesaws[i]
    const cx = seesawCenterX(i)
    const highlighted = state.hoverSeesaw === i

    // Drop guide
    if (highlighted && state.hoverSide && state.phase !== 'gameover') {
      const side = state.hoverSide
      const stack = side === 'left' ? sw.left.length : sw.right.length
      drawDropGuide(ctx, cx, sw.angle, side, nextColor, nextGlow, state.nextBall.weight, stack)
    }

    drawSeesaw(ctx, cx, sw.angle, highlighted)

    // Balls on left arm
    const lEnd = leftArmEnd(cx, sw.angle)
    for (let j = 0; j < sw.left.length; j++) {
      const b = sw.left[j]
      drawBall(ctx, lEnd.x, lEnd.y - BALL_RADIUS - j * BALL_SPACING, COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight)
    }

    // Balls on right arm
    const rEnd = rightArmEnd(cx, sw.angle)
    for (let j = 0; j < sw.right.length; j++) {
      const b = sw.right[j]
      drawBall(ctx, rEnd.x, rEnd.y - BALL_RADIUS - j * BALL_SPACING, COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight)
    }
  }

  if (state.phase === 'gameover') {
    drawGameOver(ctx, state.score)
  }
}

// Color utility helpers
function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount))
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount))
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount))
  return `rgb(${r},${g},${b})`
}
