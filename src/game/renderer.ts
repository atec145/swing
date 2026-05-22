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

// Per-ball dissolve state passed from GameCanvas. `phase` maps to the
// 5 transporter phases (0 = highlight pause … 4 = particle fade-out);
// `t` is 0..1 progress within that phase. `frame` is a monotonic frame
// counter used for deterministic stripe flicker (no Math.random in render).
export interface BallDissolve {
  phase: 0 | 1 | 2 | 3 | 4
  t: number
  frame: number
}
export type DissolveAnim = Map<string, BallDissolve>

const BEAM_STRIPES = 12

// Deterministic pseudo-random in [0,1) from integer inputs — keeps the
// transporter shimmer flickering without Math.random() in the render loop
// (renderer must stay pure for identical output given identical state).
function hashNoise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1000) / 1000
}

// Draws the Star Trek transporter beam over a ball at (x,y).
// Phase 0: pulsing bright outline. Phase 1: glow expands toward white.
// Phase 2: vertical shimmer stripes. Phase 3: top-down dissolve sweep
// (ball already alpha-faded by the caller). Phase 4: residual particles fade.
function drawBeamEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glow: string,
  d: BallDissolve,
) {
  const { phase, t, frame } = d
  ctx.save()

  if (phase === 0) {
    // Pulsing bright outline — throbs ~3x over the 0.5s pause.
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6)
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * pulse})`
    ctx.shadowColor = 'rgba(255,240,180,0.9)'
    ctx.shadowBlur = 10 + 14 * pulse
    ctx.lineWidth = 2 + 2 * pulse
    ctx.beginPath()
    ctx.arc(x, y, BALL_RADIUS + 3, 0, Math.PI * 2)
    ctx.stroke()
  } else if (phase === 1) {
    // Glow expands and brightens toward white.
    const r = BALL_RADIUS + 2 + t * 14
    const grad = ctx.createRadialGradient(x, y, BALL_RADIUS * 0.4, x, y, r)
    grad.addColorStop(0, `rgba(255,255,255,${0.4 + 0.5 * t})`)
    grad.addColorStop(0.6, `rgba(255,255,255,${0.25 * t})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  if (phase >= 2) {
    // Vertical shimmer stripes — flicker at ~15fps via frame quantisation.
    const flickerFrame = Math.floor(frame / 4)
    const top = y - BALL_RADIUS
    const fullH = BALL_RADIUS * 2
    // Phase 3 sweeps a dissolve front downward; particles above it are gone.
    const dissolveY = phase >= 4 ? top + fullH : top
    const whiteMix = phase === 2 ? Math.min(1, t) : 1
    const groupFade = phase === 3 ? 1 - t : phase >= 4 ? 0 : 1

    for (let s = 0; s < BEAM_STRIPES; s++) {
      const sx = x - BALL_RADIUS + ((s + 0.5) / BEAM_STRIPES) * (BALL_RADIUS * 2)
      const dx = (sx - x) / BALL_RADIUS
      if (dx * dx >= 1) continue
      // Stripe spans the chord of the circle at this x.
      const chord = Math.sqrt(1 - dx * dx) * BALL_RADIUS
      const n = hashNoise(s * 31 + Math.round(x), flickerFrame + s)
      const n2 = hashNoise(s * 17 + flickerFrame, Math.round(y))
      const stripeTop = Math.max(dissolveY, y - chord)
      const stripeBot = y + chord
      if (stripeBot <= stripeTop) continue
      const flicker = 0.35 + 0.65 * n
      const alpha = flicker * groupFade * (phase === 2 ? 0.55 + 0.45 * t : 1)

      // Core color lerps from the ball's glow toward white as the beam
      // intensifies (whiteMix 0→1 across phase 2, pinned at 1 afterwards).
      const [gr, gg, gb] = glowComponents(glow)
      const cr = Math.round(gr + (255 - gr) * whiteMix)
      const cg = Math.round(gg + (255 - gg) * whiteMix)
      const cb = Math.round(gb + (255 - gb) * whiteMix)

      const grad = ctx.createLinearGradient(sx, stripeTop, sx, stripeBot)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${alpha})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(180,220,255,0.8)'
      ctx.shadowBlur = 6
      const sw = 1.5 + n2 * 1.5
      ctx.fillRect(sx - sw / 2, stripeTop, sw, stripeBot - stripeTop)
    }
  }

  ctx.restore()
}

// Parses a glow color (hex `#rrggbb` or `rgb(r,g,b)`/`rgba(...)`) into its
// RGB components. Falls back to a pale cyan if the format is unrecognised.
function glowComponents(glow: string): [number, number, number] {
  if (glow.startsWith('#')) {
    const num = parseInt(glow.slice(1), 16)
    return [num >> 16, (num >> 8) & 0xff, num & 0xff]
  }
  const m = glow.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  return [200, 220, 255]
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
  dissolve?: BallDissolve,
) {
  // Transporter beam: phases 0-2 keep the ball fully visible (effect drawn
  // on top); phase 3 sweeps a top-down clip that erases the ball geometry;
  // phase 4 the ball is gone — only residual particles remain.
  if (dissolve) {
    if (dissolve.phase === 4) {
      drawBeamEffect(ctx, x, y, glow, dissolve)
      return
    }
    if (dissolve.phase === 3) {
      // Ball is instantly gone — only residual particles fade out.
      drawBeamEffect(ctx, x, y, glow, dissolve)
      return
    }
    // Phases 0-2: normal ball + beam overlay.
    drawBallBody(ctx, x, y, color, glow, weight, variant, alpha, dangerLevel)
    drawBeamEffect(ctx, x, y, glow, dissolve)
    return
  }
  drawBallBody(ctx, x, y, color, glow, weight, variant, alpha, dangerLevel)
}

// Draws the rotating circular saw blade. Metallic grey body with 10 sharp
// teeth around the rim, a small inner arbor hole, and a soft highlight for
// volume. `rotation` is in radians — caller controls timing.
export function drawSawblade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  alpha = 1,
) {
  const R = BALL_RADIUS
  const teethCount = 10
  const innerR = R * 0.78  // body radius (teeth extend beyond this)
  const arborR = R * 0.18  // central mount hole

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotation)

  // Glow halo so the sawblade reads as a special / threatening object.
  ctx.shadowColor = 'rgba(255, 200, 60, 0.55)'
  ctx.shadowBlur = 14

  // Teeth — tilted triangles around the rim, slight gold tint at the tip.
  ctx.beginPath()
  for (let i = 0; i < teethCount; i++) {
    const a0 = (i / teethCount) * Math.PI * 2
    const a1 = ((i + 0.55) / teethCount) * Math.PI * 2
    const a2 = ((i + 0.85) / teethCount) * Math.PI * 2
    // Base point at a0, tip at midpoint between a0 and a1 (outer R),
    // trailing edge back to a2 on the inner rim.
    const aMid = (a0 + a1) / 2
    ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR)
    ctx.lineTo(Math.cos(aMid) * R * 1.02, Math.sin(aMid) * R * 1.02)
    ctx.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR)
    ctx.closePath()
  }
  const teethGrad = ctx.createRadialGradient(0, 0, innerR * 0.6, 0, 0, R * 1.05)
  teethGrad.addColorStop(0, '#9AA3B0')
  teethGrad.addColorStop(0.7, '#C8CFDB')
  teethGrad.addColorStop(1, '#E8C25A')
  ctx.fillStyle = teethGrad
  ctx.fill()

  ctx.shadowBlur = 0

  // Body — metallic radial gradient.
  const bodyGrad = ctx.createRadialGradient(-R * 0.35, -R * 0.35, 2, 0, 0, innerR)
  bodyGrad.addColorStop(0, '#F0F4FB')
  bodyGrad.addColorStop(0.4, '#B5BCC8')
  bodyGrad.addColorStop(1, '#5A6271')
  ctx.fillStyle = bodyGrad
  ctx.beginPath()
  ctx.arc(0, 0, innerR, 0, Math.PI * 2)
  ctx.fill()

  // Concentric rim ring for mechanical detail.
  ctx.strokeStyle = 'rgba(40, 48, 60, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, 0, innerR * 0.85, 0, Math.PI * 2)
  ctx.stroke()

  // Three bolt-holes on the body to suggest a real blade.
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2
    const bx = Math.cos(ang) * innerR * 0.55
    const by = Math.sin(ang) * innerR * 0.55
    ctx.fillStyle = '#3A4150'
    ctx.beginPath()
    ctx.arc(bx, by, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Arbor (center mount hole)
  ctx.fillStyle = '#1A1F2C'
  ctx.beginPath()
  ctx.arc(0, 0, arborR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7C8AB0'
  ctx.lineWidth = 1
  ctx.stroke()

  // Specular highlight — small bright crescent upper-left.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  ctx.ellipse(-R * 0.3, -R * 0.3, R * 0.18, R * 0.08, -Math.PI / 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// Paints all active sawblade particles. Sparks are short bright streaks
// along their velocity vector; fragments are small colored chips with a
// subtle rotation. All particles fade out as `life` approaches 0.
function drawSawbladeParticles(
  ctx: CanvasRenderingContext2D,
  particles: SawbladeParticle[],
) {
  ctx.save()
  for (const p of particles) {
    if (p.life <= 0) continue
    const alpha = Math.min(1, p.life)
    if (p.type === 'spark') {
      // Bright streak in the direction of travel (backward tail = motion blur).
      ctx.globalAlpha = Math.min(1, alpha * 1.3)
      ctx.strokeStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = 12
      ctx.lineWidth = p.size * 1.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      const dx = p.vx ?? -1
      const dy = p.vy ?? -1
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const streakLen = 8 + p.size * 2.5
      ctx.lineTo(p.x - (dx / len) * streakLen, p.y - (dy / len) * streakLen)
      ctx.stroke()
      // Bright dot at particle head for extra punch
      ctx.globalAlpha = Math.min(1, alpha * 0.9)
      ctx.fillStyle = '#FFFACC'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Fragment — small colored chunk with thin dark outline.
      ctx.globalAlpha = alpha
      ctx.shadowColor = p.color
      ctx.shadowBlur = 4
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation ?? 0)
      ctx.fillStyle = p.color
      const w = p.size
      const h = p.size * 0.6
      ctx.beginPath()
      ctx.moveTo(-w, -h * 0.5)
      ctx.lineTo(w, -h * 0.8)
      ctx.lineTo(w * 0.7, h * 0.7)
      ctx.lineTo(-w * 0.9, h * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(20, 20, 30, 0.55)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawBallBody(
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
// `sawbladeRotation` is the current spinning angle for any sawblade held.
function drawCrane(
  ctx: CanvasRenderingContext2D,
  craneX: number,
  ball: Ball | null,
  releaseProgress: number,
  showBall: boolean,
  sawbladeRotation: number,
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
    if (ball.kind === 'sawblade') {
      drawSawblade(ctx, craneX, CRANE_GRIP_Y, sawbladeRotation)
    } else {
      drawBall(
        ctx, craneX, CRANE_GRIP_Y,
        COLOR_HEX[ball.color], COLOR_GLOW[ball.color],
        ball.weight, ball.variant, 1, 0,
      )
    }
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
  // Continuous rotation for any sawblade currently visible (in the crane or
  // mid-fall). Runs every frame in GameCanvas regardless of game state so
  // the held blade always spins.
  sawbladeRotation: number
  // Active sawblade particles (sparks + colored fragments) — drawn above
  // seesaws, below the crane. Owned and updated by GameCanvas; the renderer
  // only paints them.
  sawbladeParticles?: SawbladeParticle[]
  // When the sawblade is grinding through a stack (sequential ball-clear),
  // this is its current screen position. Drawn above balls, below particles.
  sawbladeGrindPos?: { x: number; y: number }
}

// Particle rendered during a sawblade impact. GameCanvas integrates physics
// (vx/vy + gravity + life decay) every frame; renderer just paints it.
export interface SawbladeParticle {
  x: number
  y: number
  size: number
  color: string
  life: number          // 0..1 remaining (drives alpha + fade)
  type: 'spark' | 'fragment'
  // Velocity — used by GameCanvas for physics AND by renderer for streak direction.
  vx?: number
  vy?: number
  // For fragments: rotation makes shards look chunky rather than dot-like.
  rotation?: number
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  craneAnim?: CraneAnim,
  dissolveAnim?: DissolveAnim,
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
      const dis = dissolveAnim?.get(b.id)
      drawBall(
        ctx, lEnd.x, lEnd.y - BALL_RADIUS - j * BALL_SPACING,
        COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight, b.variant,
        1, dis ? 0 : leftDanger, dis,
      )
    }

    // Balls on right arm
    const rEnd = rightArmEnd(cx, sw.angle)
    const rightDanger = sw.right.length >= 7 ? 2 : sw.right.length >= 6 ? 1 : 0
    for (let j = 0; j < sw.right.length; j++) {
      const b = sw.right[j]
      const dis = dissolveAnim?.get(b.id)
      drawBall(
        ctx, rEnd.x, rEnd.y - BALL_RADIUS - j * BALL_SPACING,
        COLOR_HEX[b.color], COLOR_GLOW[b.color], b.weight, b.variant,
        1, dis ? 0 : rightDanger, dis,
      )
    }
  }

  // Catapulted ball mid-flight — above seesaws, below the crane.
  if (craneAnim?.catapultBall) {
    const cb = craneAnim.catapultBall
    drawCatapultBall(ctx, cb.x, cb.y, cb.ball, cb.rotation, cb.alpha)
  }

  // Grinding sawblade — on top of remaining balls, below particles.
  if (craneAnim?.sawbladeGrindPos) {
    const gp = craneAnim.sawbladeGrindPos
    drawSawblade(ctx, gp.x, gp.y, craneAnim.sawbladeRotation)
  }

  // Sawblade particles — above the board, below the crane so they read clearly.
  if (craneAnim?.sawbladeParticles && craneAnim.sawbladeParticles.length > 0) {
    drawSawbladeParticles(ctx, craneAnim.sawbladeParticles)
  }

  // Crane on top of everything (except gameover overlay)
  if (state.phase !== 'gameover' && craneAnim) {
    drawCrane(
      ctx,
      craneAnim.craneX,
      state.nextBall,
      craneAnim.releaseProgress,
      craneAnim.showBallInCrane,
      craneAnim.sawbladeRotation,
    )

    // Falling ball, if any
    if (craneAnim.fallingBall) {
      const fb = craneAnim.fallingBall
      if (fb.ball.kind === 'sawblade') {
        drawSawblade(ctx, fb.x, fb.y, craneAnim.sawbladeRotation)
      } else {
        drawBall(
          ctx, fb.x, fb.y,
          COLOR_HEX[fb.ball.color], COLOR_GLOW[fb.ball.color],
          fb.ball.weight, fb.ball.variant, 1, 0,
        )
      }
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
