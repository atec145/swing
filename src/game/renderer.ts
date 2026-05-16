import type { Ball, GameState, SeesawState, Variant } from './types'
import {
  NUM_SEESAWS, CW, CH, PIVOT_Y, ARM_LENGTH, BALL_RADIUS, BALL_SPACING,
  COLOR_HEX, COLOR_GLOW, SEESAW_SPACING, MARGIN_X,
  CRANE_RAIL_Y, CRANE_BODY_H, CRANE_GRIP_Y,
} from './constants'
import { seesawCenterX, leftArmEnd, rightArmEnd } from './physics'

// Screen position of the TOP-OF-STACK resting slot for a given position index
// (0..11). `stackLen` is the number of balls already in that column — the
// returned point is where the next ball would come to rest. Used as catapult
// launch / landing anchors so flight paths align with where balls actually sit.
export function slotAnchor(
  seesaws: SeesawState[],
  slot: number,
  stackLen?: number,
): { x: number; y: number } {
  const seesaw = Math.floor(slot / 2)
  const side: 'left' | 'right' = slot % 2 === 0 ? 'left' : 'right'
  const cx = seesawCenterX(seesaw)
  const sw = seesaws[seesaw]
  const end = side === 'left' ? leftArmEnd(cx, sw.angle) : rightArmEnd(cx, sw.angle)
  const len = stackLen ?? (side === 'left' ? sw.left.length : sw.right.length)
  return { x: end.x, y: end.y - BALL_RADIUS - len * BALL_SPACING }
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glow: string,
  weight: number,
  variant: Variant,
  alpha = 1,
  dangerLevel = 0,
) {
  ctx.save()
  ctx.globalAlpha = alpha

  // Glow
  ctx.shadowColor = glow
  ctx.shadowBlur = 16

  if (variant === 'full') {
    // Solid colored circle (existing style)
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
  } else {
    // Half / striped ball — white base + colored equatorial band (billiard style)
    const baseGrad = ctx.createRadialGradient(x - BALL_RADIUS * 0.3, y - BALL_RADIUS * 0.3, 2, x, y, BALL_RADIUS)
    baseGrad.addColorStop(0, '#FFFFFF')
    baseGrad.addColorStop(1, '#C8CDD6')
    ctx.fillStyle = baseGrad
    ctx.beginPath()
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0

    // Colored equatorial stripe — clipped to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2)
    ctx.clip()

    const stripeHeight = BALL_RADIUS * 1.05
    const stripeGrad = ctx.createLinearGradient(x, y - stripeHeight / 2, x, y + stripeHeight / 2)
    stripeGrad.addColorStop(0, darken(color, 0.05))
    stripeGrad.addColorStop(0.5, lighten(color, 0.15))
    stripeGrad.addColorStop(1, darken(color, 0.1))
    ctx.fillStyle = stripeGrad
    ctx.fillRect(x - BALL_RADIUS, y - stripeHeight / 2, BALL_RADIUS * 2, stripeHeight)
    ctx.restore()

    // Rim
    ctx.strokeStyle = '#888E98'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Weight number — drawn on a small white pill so it stays legible on
  // both solid and striped backgrounds.
  const numText = String(weight)
  ctx.font = `bold ${BALL_RADIUS * 0.85}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (variant === 'half') {
    // Small white circle behind the number for legibility against the stripe
    const pillR = BALL_RADIUS * 0.55
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.arc(x, y, pillR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1A1F2C'
    ctx.fillText(numText, x, y + 1)
  } else {
    // Solid ball: white text with a thin dark outline
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.strokeText(numText, x, y + 1)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText(numText, x, y + 1)
  }

  if (dangerLevel > 0) {
    ctx.strokeStyle = dangerLevel === 2 ? '#FF2222' : '#FF8800'
    ctx.shadowColor = dangerLevel === 2 ? 'rgba(255,34,34,0.7)' : 'rgba(255,136,0,0.7)'
    ctx.shadowBlur = dangerLevel === 2 ? 12 : 8
    ctx.lineWidth = dangerLevel === 2 ? 3 : 2.5
    ctx.beginPath()
    ctx.arc(x, y, BALL_RADIUS + 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  ctx.restore()
}

// `angle` is one of exactly three fixed values in the 3-state model
// (+MAX_ANGLE = left down, 0 = balanced, -MAX_ANGLE = right down), so the
// seesaw visually snaps into one of three discrete positions.
function drawSeesaw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  angle: number,
  highlighted: boolean,
) {
  const lEnd = leftArmEnd(cx, angle)  // x always cx-ARM_LENGTH, y slides
  const rEnd = rightArmEnd(cx, angle) // x always cx+ARM_LENGTH, y slides
  const gearY = PIVOT_Y               // center of the gear/pivot mechanism

  ctx.save()

  // Vertical column rails (fixed X guides that the platforms slide along)
  ctx.strokeStyle = highlighted ? 'rgba(90,110,180,0.35)' : 'rgba(55,65,110,0.3)'
  ctx.lineWidth = 3
  ctx.setLineDash([5, 5])
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(lEnd.x, gearY - ARM_LENGTH)
  ctx.lineTo(lEnd.x, gearY + 8)
  ctx.moveTo(rEnd.x, gearY - ARM_LENGTH)
  ctx.lineTo(rEnd.x, gearY + 8)
  ctx.stroke()
  ctx.setLineDash([])

  // Crank arms from central gear to each platform (show the lever mechanism)
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 6
  ctx.strokeStyle = highlighted ? '#6070B8' : '#3D4870'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, gearY)
  ctx.lineTo(lEnd.x, lEnd.y)
  ctx.moveTo(cx, gearY)
  ctx.lineTo(rEnd.x, rEnd.y)
  ctx.stroke()
  ctx.shadowBlur = 0

  // Platform shelves at each column top (where balls rest)
  const shelfW = 14
  ctx.strokeStyle = highlighted ? '#90AAFF' : '#6070A0'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(lEnd.x - shelfW, lEnd.y)
  ctx.lineTo(lEnd.x + shelfW, lEnd.y)
  ctx.moveTo(rEnd.x - shelfW, rEnd.y)
  ctx.lineTo(rEnd.x + shelfW, rEnd.y)
  ctx.stroke()

  // Central gear circle
  ctx.fillStyle = highlighted ? '#7788CC' : '#445588'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(cx, gearY, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = highlighted ? '#99AAEE' : '#5566AA'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.shadowBlur = 0

  // Pivot base
  ctx.fillStyle = highlighted ? '#6677BB' : '#334488'
  ctx.fillRect(cx - 18, gearY + 8, 36, 5)

  ctx.restore()
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
    ctx.moveTo(x, CRANE_RAIL_Y + CRANE_BODY_H + 12)
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

// Drawn at very top of canvas — overhead rail/girder the crane slides on.
function drawCraneRail(ctx: CanvasRenderingContext2D) {
  ctx.save()

  // Rail body — dark metallic bar
  const railTop = CRANE_RAIL_Y - 10
  const railBottom = CRANE_RAIL_Y + 4
  const grad = ctx.createLinearGradient(0, railTop, 0, railBottom)
  grad.addColorStop(0, '#2A3148')
  grad.addColorStop(0.5, '#4A5680')
  grad.addColorStop(1, '#1A1F2C')
  ctx.fillStyle = grad
  ctx.fillRect(0, railTop, CW, railBottom - railTop)

  // Top highlight line
  ctx.strokeStyle = 'rgba(180,200,255,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, railTop + 1)
  ctx.lineTo(CW, railTop + 1)
  ctx.stroke()

  // Bottom edge shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.beginPath()
  ctx.moveTo(0, railBottom)
  ctx.lineTo(CW, railBottom)
  ctx.stroke()

  // Subtle yellow caution stripes on the underside
  ctx.fillStyle = 'rgba(232,214,52,0.15)'
  for (let x = 0; x < CW; x += 24) {
    ctx.fillRect(x, railBottom, 12, 2)
  }

  ctx.restore()
}

// Crane gantry + gripper. `releaseProgress` 0..1 animates the claws opening.
function drawCrane(
  ctx: CanvasRenderingContext2D,
  craneX: number,
  ball: Ball | null,
  releaseProgress: number,
  showBall: boolean,
) {
  const bodyTop = CRANE_RAIL_Y
  const bodyBottom = CRANE_RAIL_Y + CRANE_BODY_H
  const bodyWidth = 64
  const bodyLeft = craneX - bodyWidth / 2
  const bodyRight = craneX + bodyWidth / 2

  ctx.save()

  // Cable/strut from rail to crane body (so the crane hangs below the rail)
  ctx.strokeStyle = '#6070A0'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(craneX - 14, bodyTop - 4)
  ctx.lineTo(craneX - 14, bodyTop + 6)
  ctx.moveTo(craneX + 14, bodyTop - 4)
  ctx.lineTo(craneX + 14, bodyTop + 6)
  ctx.stroke()

  // Carriage body — angular sci-fi housing
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 10
  const bodyGrad = ctx.createLinearGradient(bodyLeft, bodyTop, bodyRight, bodyBottom)
  bodyGrad.addColorStop(0, '#2C3450')
  bodyGrad.addColorStop(0.5, '#4A5680')
  bodyGrad.addColorStop(1, '#1F2638')
  ctx.fillStyle = bodyGrad

  ctx.beginPath()
  // Tapered hex-ish shape, narrower at bottom (the gripper neck)
  ctx.moveTo(bodyLeft + 6, bodyTop + 4)
  ctx.lineTo(bodyRight - 6, bodyTop + 4)
  ctx.lineTo(bodyRight, bodyTop + 16)
  ctx.lineTo(bodyRight - 6, bodyBottom - 14)
  ctx.lineTo(bodyLeft + 6, bodyBottom - 14)
  ctx.lineTo(bodyLeft, bodyTop + 16)
  ctx.closePath()
  ctx.fill()

  ctx.shadowBlur = 0

  // Body edge highlight
  ctx.strokeStyle = 'rgba(160,180,230,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Cyan LED status strip along upper rim
  const ledY = bodyTop + 10
  const ledGrad = ctx.createLinearGradient(bodyLeft + 10, ledY, bodyRight - 10, ledY)
  ledGrad.addColorStop(0, 'rgba(60,201,214,0.2)')
  ledGrad.addColorStop(0.5, 'rgba(60,201,214,0.95)')
  ledGrad.addColorStop(1, 'rgba(60,201,214,0.2)')
  ctx.fillStyle = ledGrad
  ctx.shadowColor = 'rgba(60,201,214,0.8)'
  ctx.shadowBlur = 8
  ctx.fillRect(bodyLeft + 10, ledY, bodyWidth - 20, 2)
  ctx.shadowBlur = 0

  // Small status dot — pulsing-ish ring
  ctx.fillStyle = '#3CC9D6'
  ctx.shadowColor = 'rgba(60,201,214,0.8)'
  ctx.shadowBlur = 6
  ctx.beginPath()
  ctx.arc(bodyLeft + 8, bodyTop + 8, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(bodyRight - 8, bodyTop + 8, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Gripper claws — two angled arms below the body that open with release
  const clawY = bodyBottom - 14
  const clawTipY = bodyBottom + 6
  // openAmount: 0 = closed (cradling ball), 1 = fully open
  const open = releaseProgress
  const clawInnerX = BALL_RADIUS - 2 + open * 14
  const clawOuterX = BALL_RADIUS + 8 + open * 18

  ctx.strokeStyle = '#7C8AB0'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'

  // Left claw
  ctx.beginPath()
  ctx.moveTo(craneX - 4, clawY)
  ctx.lineTo(craneX - clawInnerX, clawTipY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(craneX - clawInnerX, clawTipY)
  ctx.lineTo(craneX - clawOuterX, clawTipY + 8)
  ctx.stroke()

  // Right claw
  ctx.beginPath()
  ctx.moveTo(craneX + 4, clawY)
  ctx.lineTo(craneX + clawInnerX, clawTipY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(craneX + clawInnerX, clawTipY)
  ctx.lineTo(craneX + clawOuterX, clawTipY + 8)
  ctx.stroke()

  // Held ball
  if (showBall && ball) {
    drawBall(
      ctx, craneX, CRANE_GRIP_Y,
      COLOR_HEX[ball.color], COLOR_GLOW[ball.color],
      ball.weight, ball.variant, 1, 0,
    )
  }

  ctx.restore()
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
  ctx.fillText('Press Enter to restart', CW / 2, CH / 2 + 70)

  ctx.restore()
}

// Draws a catapulted ball at (x,y), rotated by `rotation` radians and faded
// by `alpha` (used for the fade-out/fade-in at wrap-around edges).
function drawCatapultBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ball: Ball,
  rotation: number,
  alpha: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  drawBall(
    ctx, 0, 0,
    COLOR_HEX[ball.color], COLOR_GLOW[ball.color],
    ball.weight, ball.variant, alpha, 0,
  )
  ctx.restore()
}

// Animation overlay produced by GameCanvas — purely visual, never affects logic.
export interface CraneAnim {
  craneX: number              // current animated x of the crane
  releaseProgress: number     // 0..1 grip-open animation
  showBallInCrane: boolean    // hide ball while it's falling
  fallingBall: null | {
    x: number
    y: number
    ball: Ball
  }
  // A ball mid-catapult-flight (one parabola segment). null when idle.
  catapultBall: null | {
    x: number
    y: number
    ball: Ball
    rotation: number
    alpha: number
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  craneAnim?: CraneAnim,
) {
  drawBackground(ctx)
  drawCraneRail(ctx)

  for (let i = 0; i < NUM_SEESAWS; i++) {
    const sw = state.seesaws[i]
    const cx = seesawCenterX(i)
    const highlighted = state.hoverSeesaw === i

    drawSeesaw(ctx, cx, sw.angle, highlighted)

    // Balls on left arm
    const lEnd = leftArmEnd(cx, sw.angle)
    const leftDanger = sw.left.length >= 7 ? 2 : sw.left.length >= 6 ? 1 : 0
    for (let j = 0; j < sw.left.length; j++) {
      const b = sw.left[j]
      drawBall(
        ctx, lEnd.x, lEnd.y - BALL_RADIUS - j * BALL_SPACING,
        COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight, b.variant, 1, leftDanger,
      )
    }

    // Balls on right arm
    const rEnd = rightArmEnd(cx, sw.angle)
    const rightDanger = sw.right.length >= 7 ? 2 : sw.right.length >= 6 ? 1 : 0
    for (let j = 0; j < sw.right.length; j++) {
      const b = sw.right[j]
      drawBall(
        ctx, rEnd.x, rEnd.y - BALL_RADIUS - j * BALL_SPACING,
        COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight, b.variant, 1, rightDanger,
      )
    }
  }

  // Catapulted ball mid-flight — above seesaws, below the crane.
  if (craneAnim?.catapultBall) {
    const cb = craneAnim.catapultBall
    drawCatapultBall(ctx, cb.x, cb.y, cb.ball, cb.rotation, cb.alpha)
  }

  // Crane on top of everything (except gameover overlay)
  if (state.phase !== 'gameover' && craneAnim) {
    drawCrane(
      ctx,
      craneAnim.craneX,
      state.nextBall,
      craneAnim.releaseProgress,
      craneAnim.showBallInCrane,
    )

    // Falling ball, if any
    if (craneAnim.fallingBall) {
      const fb = craneAnim.fallingBall
      drawBall(
        ctx, fb.x, fb.y,
        COLOR_HEX[fb.ball.color], COLOR_GLOW[fb.ball.color],
        fb.ball.weight, fb.ball.variant, 1, 0,
      )
    }
  }

  if (state.phase === 'gameover') {
    drawGameOver(ctx, state.score)
  }
}

// Map a discrete crane position 0..11 to a canvas x coordinate.
// Even index = left side of seesaw, odd = right side.
// X is always fixed (columns don't shift horizontally).
export function craneXForIndex(index: number): number {
  const seesaw = Math.floor(index / 2)
  const cx = seesawCenterX(seesaw)
  return index % 2 === 0 ? cx - ARM_LENGTH : cx + ARM_LENGTH
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
