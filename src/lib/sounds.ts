// File-based sound playback for the Swing game (issue #15, #21).
//
// WAV files in /public/sounds/ are pre-fetched eagerly on module load and
// decoded into AudioBuffers on first use per AudioContext. All exported
// functions maintain the same signatures as the previous synthesis version
// so useSoundEngine.ts needs no changes.
//
// For sounds with a `durSec` param (flight whoosh, sawblade whine), the
// playback is gain-ramped to silence at `when + durSec` to match the visual
// timing regardless of the actual WAV file length.

'use client'

export interface SoundHandle {
  stopAll(when?: number): void
}

const SOUND_NAMES = [
  'ball_drop', 'seesaw_tilt', 'catapult_fire', 'flight_whoosh',
  'match_pop', 'sawblade_whine', 'sawblade_grind', 'rock_thud',
  'blitz_crack', 'blitz_zap', 'game_over', 'highscore_bell',
] as const

type SoundName = typeof SOUND_NAMES[number]

// Pre-fetch raw bytes before we have an AudioContext (module load time).
// On the server this is a no-op.
const rawCache = new Map<SoundName, Promise<ArrayBuffer>>()

if (typeof window !== 'undefined') {
  for (const name of SOUND_NAMES) {
    rawCache.set(name, fetch(`/sounds/${name}.wav`).then(r => r.arrayBuffer()))
  }
}

// Decoded AudioBuffers — keyed per AudioContext to avoid cross-context reuse.
const decodedCache = new WeakMap<AudioContext, Map<SoundName, AudioBuffer>>()

async function getBuffer(ctx: AudioContext, name: SoundName): Promise<AudioBuffer> {
  let ctxMap = decodedCache.get(ctx)
  if (!ctxMap) {
    ctxMap = new Map()
    decodedCache.set(ctx, ctxMap)
  }
  const hit = ctxMap.get(name)
  if (hit) return hit

  const rawPromise = rawCache.get(name) ?? fetch(`/sounds/${name}.wav`).then(r => r.arrayBuffer())
  const raw = await rawPromise
  // slice(0) clones the buffer — decodeAudioData detaches the source ArrayBuffer
  // on some browsers, which would break any future decode attempt on the same raw data.
  const decoded = await ctx.decodeAudioData(raw.slice(0))
  ctxMap.set(name, decoded)
  return decoded
}

/**
 * Schedule playback of a WAV file through `out`.
 * If `durSec` is given, the sound is gain-faded to silence at `when + durSec`
 * (used for sounds whose duration is driven by game logic, not file length).
 */
function playSound(
  ctx: AudioContext,
  out: GainNode,
  name: SoundName,
  when: number,
  gainValue = 0.7,
  durSec?: number,
): SoundHandle {
  let source: AudioBufferSourceNode | null = null
  let cancelled = false

  getBuffer(ctx, name).then(buffer => {
    if (cancelled) return
    // If buffer loading took longer than `when`, snap to now.
    const t0 = Math.max(when, ctx.currentTime)

    source = ctx.createBufferSource()
    source.buffer = buffer

    const g = ctx.createGain()
    g.gain.value = gainValue

    if (durSec !== undefined) {
      // Ramp gain out smoothly at the target duration so the tail is clean.
      const fadeStart = t0 + Math.max(0, durSec - 0.05)
      g.gain.setValueAtTime(gainValue, t0)
      g.gain.linearRampToValueAtTime(0.001, fadeStart + 0.05)
      source.connect(g).connect(out)
      source.start(t0)
      source.stop(t0 + durSec + 0.1)
    } else {
      source.connect(g).connect(out)
      source.start(t0)
    }
  }).catch(() => { /* sound failed to load — silently skip */ })

  return {
    stopAll(w = ctx.currentTime) {
      cancelled = true
      if (source) {
        try { source.stop(w) } catch { /* already stopped */ }
      }
    },
  }
}

// =========================================================================
// 1. Metal clink — ball lands on a seesaw arm
// =========================================================================
export function playBallDrop(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'ball_drop', when, 0.75)
}

// =========================================================================
// 2. Seesaw tilt click — mechanical "tick-tack" when the seesaw flips sides
// =========================================================================
export function playSeesawTilt(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'seesaw_tilt', when, 0.65)
}

// =========================================================================
// 3. Catapult fire — spring snap
// =========================================================================
export function playCatapultFire(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'catapult_fire', when, 0.70)
}

// =========================================================================
// 4. Ball in flight — soft whoosh scaled to chain length
// durSec is driven by useSoundEngine based on catapult chain length.
// =========================================================================
export function playFlightWhoosh(
  ctx: AudioContext, out: GainNode, when: number, durSec = 0.35,
): SoundHandle {
  return playSound(ctx, out, 'flight_whoosh', when, 0.45, durSec)
}

// =========================================================================
// 5. Glass burst — match-clear pop
// =========================================================================
export function playMatchPop(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'match_pop', when, 0.70)
}

// =========================================================================
// 6. Sawblade spin-up — motor whine, duration driven by blade animation
// =========================================================================
export function playSawbladeWhine(
  ctx: AudioContext, out: GainNode, when: number, durSec = 0.9,
): SoundHandle {
  return playSound(ctx, out, 'sawblade_whine', when, 0.65, durSec)
}

// =========================================================================
// 7. Sawblade grind — metallic scrape per cleared ball
// =========================================================================
export function playSawbladeGrind(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'sawblade_grind', when, 0.65)
}

// =========================================================================
// 8. Rock thud — heavy boulder lands
// =========================================================================
export function playRockThud(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'rock_thud', when, 0.75)
}

// =========================================================================
// 9. Lightning crack — blitz ball impact
// =========================================================================
export function playBlitzCrack(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'blitz_crack', when, 0.70)
}

// =========================================================================
// 10. Electrostatic crackle — chain-lightning per target ball
// =========================================================================
export function playBlitzZap(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'blitz_zap', when, 0.60)
}

// =========================================================================
// 11. Game-over toll — heavy metal pendulum
// =========================================================================
export function playGameOver(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'game_over', when, 0.75)
}

// =========================================================================
// 12. Highscore bell — short celebratory chime
// =========================================================================
export function playHighscoreBell(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  return playSound(ctx, out, 'highscore_bell', when, 0.70)
}
