// Pure Web Audio API sound-synthesis helpers for the Swing game (issue #15).
//
// Each function in this module takes an AudioContext and the current audio time
// and schedules a self-contained synthetic sound built from oscillators and
// filtered noise. No external assets, no file hosting — everything is generated
// programmatically. The goal is a physically-plausible palette: metal clinks,
// glass bursts, spring snaps, stone rumbles, lightning cracks, bell tones.
//
// Design rules:
//   - All gain ramps land at +0 to avoid clicks when the env hits zero.
//   - All scheduled nodes call `stop()` at a fixed end-time so the AudioContext
//     never leaks live oscillators.
//   - Every node is wired through a *local* gain controlling that sound's
//     amplitude — the caller passes a master `out` GainNode (set by
//     useSoundEngine) so a global mute can be implemented by setting `out.gain`
//     to 0 once.
//   - Each sound returns the list of scheduled OscillatorNode/AudioBufferSource
//     it owns so the caller can `.stop()` them early (game-over cancellation).

/**
 * The contract every synth helper returns. `stopAll(when)` instantly silences
 * the sound — used to abort ongoing loops (sawblade, blitz) when the game ends.
 */
export interface SoundHandle {
  stopAll(when?: number): void
}

// --- noise buffer cache ---------------------------------------------------
// Generating a fresh noise buffer per shot is cheap, but caching one bank of
// noise per AudioContext costs only a few KB and lets us reuse it for every
// noise-burst sound.
const noiseCache = new WeakMap<AudioContext, AudioBuffer>()

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const existing = noiseCache.get(ctx)
  if (existing) return existing
  // 2 seconds of white noise at the device sample rate is more than enough
  // for every effect we trigger (longest effect ~1.2s).
  const length = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseCache.set(ctx, buf)
  return buf
}

// Small helper to keep gain ramps consistent across all synths.
function ramp(g: GainNode, t0: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay)
}

// =========================================================================
// 1. Metal clink — ball lands on a seesaw arm
// Resonant body: two slightly detuned sinewave partials + filtered noise tick.
// =========================================================================
export function playBallDrop(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.18
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Bright partial
  const o1 = ctx.createOscillator()
  o1.type = 'sine'
  o1.frequency.setValueAtTime(880, t0)
  o1.frequency.exponentialRampToValueAtTime(720, t0 + dur)
  const g1 = ctx.createGain()
  ramp(g1, t0, 0.22, 0.003, dur)
  o1.connect(g1).connect(out)
  o1.start(t0); o1.stop(t0 + dur + 0.05)
  nodes.push(o1)

  // Lower partial — fattens the body
  const o2 = ctx.createOscillator()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(440, t0)
  o2.frequency.exponentialRampToValueAtTime(360, t0 + dur)
  const g2 = ctx.createGain()
  ramp(g2, t0, 0.16, 0.003, dur)
  o2.connect(g2).connect(out)
  o2.start(t0); o2.stop(t0 + dur + 0.05)
  nodes.push(o2)

  // Noise click — the percussive transient at impact
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 2800
  const ng = ctx.createGain()
  ramp(ng, t0, 0.18, 0.001, 0.04)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.06)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 2. Seesaw tilt click — mechanical "tick-tack" when the seesaw flips sides
// =========================================================================
export function playSeesawTilt(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Short woody click via filtered noise + a tight sine partial
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.value = 1400
  nf.Q.value = 6
  const ng = ctx.createGain()
  ramp(ng, t0, 0.20, 0.001, 0.06)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.08)
  nodes.push(noise)

  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(620, t0)
  o.frequency.exponentialRampToValueAtTime(420, t0 + 0.08)
  const og = ctx.createGain()
  ramp(og, t0, 0.10, 0.002, 0.07)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + 0.1)
  nodes.push(o)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 3. Catapult fire — spring snap + whoosh
// Falling chirp (spring tension release) + bandpass-noise sweep (air whoosh).
// =========================================================================
export function playCatapultFire(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Spring snap — sharp falling chirp
  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(1500, t0)
  o.frequency.exponentialRampToValueAtTime(180, t0 + 0.12)
  const og = ctx.createGain()
  ramp(og, t0, 0.18, 0.002, 0.12)
  // Lowpass shapes it from harsh to woody as it falls
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(3000, t0)
  filt.frequency.exponentialRampToValueAtTime(700, t0 + 0.12)
  o.connect(filt).connect(og).connect(out)
  o.start(t0); o.stop(t0 + 0.16)
  nodes.push(o)

  // Whoosh — bandpass noise sweep upward (release of stored energy)
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.Q.value = 4
  nf.frequency.setValueAtTime(600, t0)
  nf.frequency.exponentialRampToValueAtTime(2400, t0 + 0.22)
  const ng = ctx.createGain()
  ramp(ng, t0 + 0.02, 0.14, 0.04, 0.18)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.28)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 4. Ball in flight — soft whoosh while a ball is airborne
// Used as a short pulse, not a sustained loop, so it can layer with the
// catapult-fire transient.
// =========================================================================
export function playFlightWhoosh(
  ctx: AudioContext, out: GainNode, when: number, durSec = 0.35,
): SoundHandle {
  const t0 = when
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.Q.value = 2.5
  nf.frequency.setValueAtTime(900, t0)
  nf.frequency.exponentialRampToValueAtTime(1800, t0 + durSec)
  const ng = ctx.createGain()
  // Slow attack + smooth decay so it sits behind the catapult snap
  ng.gain.setValueAtTime(0, t0)
  ng.gain.linearRampToValueAtTime(0.08, t0 + durSec * 0.3)
  ng.gain.linearRampToValueAtTime(0.001, t0 + durSec)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + durSec + 0.05)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 5. Glass burst — match-clear pop
// High noise burst + detuned sine triad that decays rapidly. Each call gives
// a clean "ting-tsh!" reminiscent of shattering glass.
// =========================================================================
export function playMatchPop(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.32
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Three detuned sines (root + octave + minor-7th-ish) — the crystalline shimmer.
  const freqs = [1200, 1800, 2700]
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    // Slight detune so they beat against each other
    o.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.02), t0)
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + dur)
    const g = ctx.createGain()
    ramp(g, t0, 0.15 - i * 0.03, 0.002, dur - 0.02)
    o.connect(g).connect(out)
    o.start(t0); o.stop(t0 + dur + 0.05)
    nodes.push(o)
  })

  // Noise tick — the shatter onset
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 4000
  const ng = ctx.createGain()
  ramp(ng, t0, 0.22, 0.001, 0.10)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.12)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 6. Sawblade spin-up — mechanical revving rotor
// Sustained tone + filtered noise that ramps in pitch. Returns a handle so
// the caller can stop it explicitly once the blade animation ends.
// =========================================================================
export function playSawbladeWhine(
  ctx: AudioContext, out: GainNode, when: number, durSec = 0.9,
): SoundHandle {
  const t0 = when
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Sawtooth drone climbing in pitch (motor spinning up)
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(140, t0)
  o.frequency.exponentialRampToValueAtTime(420, t0 + durSec * 0.6)
  o.frequency.linearRampToValueAtTime(380, t0 + durSec)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(800, t0)
  filt.frequency.exponentialRampToValueAtTime(2200, t0 + durSec * 0.6)
  filt.Q.value = 2.4
  const og = ctx.createGain()
  og.gain.setValueAtTime(0, t0)
  og.gain.linearRampToValueAtTime(0.16, t0 + 0.07)
  og.gain.linearRampToValueAtTime(0.10, t0 + durSec * 0.7)
  og.gain.linearRampToValueAtTime(0.0001, t0 + durSec)
  o.connect(filt).connect(og).connect(out)
  o.start(t0); o.stop(t0 + durSec + 0.05)
  nodes.push(o)

  // High-frequency wind noise — the blade cutting air
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 2200
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t0)
  ng.gain.linearRampToValueAtTime(0.06, t0 + 0.1)
  ng.gain.linearRampToValueAtTime(0.0001, t0 + durSec)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + durSec + 0.05)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 7. Sawblade grind — metallic scrape per cleared ball
// Short bandpass noise pulse + dissonant high partial. Played per ball cleared.
// =========================================================================
export function playSawbladeGrind(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.25
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.setValueAtTime(2600, t0)
  nf.frequency.exponentialRampToValueAtTime(1800, t0 + dur)
  nf.Q.value = 8
  const ng = ctx.createGain()
  ramp(ng, t0, 0.18, 0.004, dur - 0.01)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + dur + 0.05)
  nodes.push(noise)

  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(3200, t0)
  o.frequency.exponentialRampToValueAtTime(2000, t0 + dur)
  const og = ctx.createGain()
  ramp(og, t0, 0.06, 0.005, dur - 0.01)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + dur + 0.05)
  nodes.push(o)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 8. Rock thud — heavy boulder lands
// Low sub-bass thump + filtered noise body. Clearly distinct from the
// metal-clink of a normal ball drop.
// =========================================================================
export function playRockThud(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.42
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Sub-bass thump — the visceral landing
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t0)
  o.frequency.exponentialRampToValueAtTime(40, t0 + dur)
  const og = ctx.createGain()
  ramp(og, t0, 0.4, 0.004, dur)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + dur + 0.05)
  nodes.push(o)

  // Rubble noise — the gritty rock body
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.setValueAtTime(900, t0)
  nf.frequency.exponentialRampToValueAtTime(200, t0 + dur)
  const ng = ctx.createGain()
  ramp(ng, t0, 0.22, 0.002, dur - 0.05)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + dur + 0.05)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 9. Lightning crack — blitz ball impact
// Full white-noise burst with very short attack + long tail + bright spike.
// =========================================================================
export function playBlitzCrack(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.7
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  // Full-spectrum thunder body
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.setValueAtTime(5000, t0)
  nf.frequency.exponentialRampToValueAtTime(400, t0 + dur)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t0)
  ng.gain.linearRampToValueAtTime(0.5, t0 + 0.005)
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + dur + 0.05)
  nodes.push(noise)

  // Bright top-end crackle — the lightning whip
  const top = ctx.createBufferSource()
  top.buffer = getNoiseBuffer(ctx)
  const tf = ctx.createBiquadFilter()
  tf.type = 'highpass'
  tf.frequency.value = 4000
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0, t0)
  tg.gain.linearRampToValueAtTime(0.35, t0 + 0.003)
  tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18)
  top.connect(tf).connect(tg).connect(out)
  top.start(t0); top.stop(t0 + 0.22)
  nodes.push(top)

  // Low rumble for the rolling thunder feel
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(70, t0)
  sub.frequency.exponentialRampToValueAtTime(50, t0 + dur)
  const sg = ctx.createGain()
  sg.gain.setValueAtTime(0, t0)
  sg.gain.linearRampToValueAtTime(0.22, t0 + 0.02)
  sg.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  sub.connect(sg).connect(out)
  sub.start(t0); sub.stop(t0 + dur + 0.05)
  nodes.push(sub)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 10. Electrostatic crackle — chain-lightning per target ball
// Tiny noise burst at a high band — used in quick succession.
// =========================================================================
export function playBlitzZap(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 0.09
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.value = 3200
  nf.Q.value = 10
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t0)
  ng.gain.linearRampToValueAtTime(0.22, t0 + 0.002)
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + dur + 0.02)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 11. Game-over toll — heavy metal pendulum
// Single low bell with long exponential decay + harmonic overtone.
// =========================================================================
export function playGameOver(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const dur = 2.0
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  const fundamental = 110
  const partials: Array<[number, number]> = [
    [fundamental, 0.30],
    [fundamental * 2, 0.18],
    [fundamental * 3, 0.10],
    [fundamental * 4.2, 0.06],
  ]
  for (const [f, peak] of partials) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f, t0)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.04)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    o.connect(g).connect(out)
    o.start(t0); o.stop(t0 + dur + 0.05)
    nodes.push(o)
  }

  // Initial transient — the mallet strike
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.value = 1200
  const ng = ctx.createGain()
  ramp(ng, t0, 0.30, 0.001, 0.10)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.12)
  nodes.push(noise)

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// =========================================================================
// 12. Highscore bell — short celebratory chime
// Two struck bell tones (root + perfect-fifth) with metallic overtones.
// =========================================================================
export function playHighscoreBell(ctx: AudioContext, out: GainNode, when: number): SoundHandle {
  const t0 = when
  const nodes: Array<OscillatorNode | AudioBufferSourceNode> = []

  const bells: Array<[number, number]> = [
    [660, t0],
    [990, t0 + 0.18],
  ]
  for (const [root, start] of bells) {
    const dur = 1.1
    const partials: Array<[number, number]> = [
      [root, 0.22],
      [root * 2, 0.12],
      [root * 3, 0.06],
      [root * 4.2, 0.03],
    ]
    for (const [f, peak] of partials) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, start)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(peak, start + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, start + dur)
      o.connect(g).connect(out)
      o.start(start); o.stop(start + dur + 0.05)
      nodes.push(o)
    }
  }

  return { stopAll: (w = ctx.currentTime) => nodes.forEach(n => safeStop(n, w)) }
}

// ---- helpers --------------------------------------------------------------

/**
 * Stops a scheduled node without throwing if it has already finished.
 * Web Audio raises an `InvalidStateError` if you call stop() twice on the same
 * source — that's harmless but pollutes the console, so we swallow it.
 */
function safeStop(node: OscillatorNode | AudioBufferSourceNode, when: number) {
  try { node.stop(when) } catch { /* already stopped */ }
}
