/**
 * One-time script: renders all 12 sound synthesis functions to WAV files.
 * Output: swing_flutter/swing_game/assets/sounds/
 *
 * Usage: node scripts/export_sounds.mjs
 * Requires: web-audio-api npm package (already installed)
 */

import { OfflineAudioContext } from 'web-audio-api'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../../swing_flutter/swing_game/assets/sounds')
const SAMPLE_RATE = 44100

fs.mkdirSync(OUT_DIR, { recursive: true })

// ── noise buffer cache ────────────────────────────────────────────────────

const noiseCache = new WeakMap()

function getNoiseBuffer(ctx) {
  const existing = noiseCache.get(ctx)
  if (existing) return existing
  const length = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseCache.set(ctx, buf)
  return buf
}

function ramp(g, t0, peak, attack, decay) {
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay)
}

// ── synthesis functions (ported from sounds.ts) ───────────────────────────

function playBallDrop(ctx, out, t0) {
  const dur = 0.18
  const o1 = ctx.createOscillator()
  o1.type = 'sine'
  o1.frequency.setValueAtTime(880, t0)
  o1.frequency.exponentialRampToValueAtTime(720, t0 + dur)
  const g1 = ctx.createGain()
  ramp(g1, t0, 0.22, 0.003, dur)
  o1.connect(g1).connect(out)
  o1.start(t0); o1.stop(t0 + dur + 0.05)

  const o2 = ctx.createOscillator()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(440, t0)
  o2.frequency.exponentialRampToValueAtTime(360, t0 + dur)
  const g2 = ctx.createGain()
  ramp(g2, t0, 0.16, 0.003, dur)
  o2.connect(g2).connect(out)
  o2.start(t0); o2.stop(t0 + dur + 0.05)

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 2800
  const ng = ctx.createGain()
  ramp(ng, t0, 0.18, 0.001, 0.04)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.06)
}

function playSeesawTilt(ctx, out, t0) {
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

  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(620, t0)
  o.frequency.exponentialRampToValueAtTime(420, t0 + 0.08)
  const og = ctx.createGain()
  ramp(og, t0, 0.10, 0.002, 0.07)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + 0.1)
}

function playCatapultFire(ctx, out, t0) {
  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(1500, t0)
  o.frequency.exponentialRampToValueAtTime(180, t0 + 0.12)
  const og = ctx.createGain()
  ramp(og, t0, 0.18, 0.002, 0.12)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(3000, t0)
  filt.frequency.exponentialRampToValueAtTime(700, t0 + 0.12)
  o.connect(filt).connect(og).connect(out)
  o.start(t0); o.stop(t0 + 0.16)

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
}

function playFlightWhoosh(ctx, out, t0, durSec = 0.35) {
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.Q.value = 2.5
  nf.frequency.setValueAtTime(900, t0)
  nf.frequency.exponentialRampToValueAtTime(1800, t0 + durSec)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t0)
  ng.gain.linearRampToValueAtTime(0.08, t0 + durSec * 0.3)
  ng.gain.linearRampToValueAtTime(0.001, t0 + durSec)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + durSec + 0.05)
}

function playMatchPop(ctx, out, t0) {
  const dur = 0.32
  const freqs = [1200, 1800, 2700]
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.02), t0)
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + dur)
    const g = ctx.createGain()
    ramp(g, t0, 0.15 - i * 0.03, 0.002, dur - 0.02)
    o.connect(g).connect(out)
    o.start(t0); o.stop(t0 + dur + 0.05)
  })

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'highpass'
  nf.frequency.value = 4000
  const ng = ctx.createGain()
  ramp(ng, t0, 0.22, 0.001, 0.10)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.12)
}

function playSawbladeWhine(ctx, out, t0, durSec = 0.9) {
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
}

function playSawbladeGrind(ctx, out, t0) {
  const dur = 0.25
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

  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.setValueAtTime(3200, t0)
  o.frequency.exponentialRampToValueAtTime(2000, t0 + dur)
  const og = ctx.createGain()
  ramp(og, t0, 0.06, 0.005, dur - 0.01)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + dur + 0.05)
}

function playRockThud(ctx, out, t0) {
  const dur = 0.42
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t0)
  o.frequency.exponentialRampToValueAtTime(40, t0 + dur)
  const og = ctx.createGain()
  ramp(og, t0, 0.4, 0.004, dur)
  o.connect(og).connect(out)
  o.start(t0); o.stop(t0 + dur + 0.05)

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
}

function playBlitzCrack(ctx, out, t0) {
  const dur = 0.7
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
}

function playBlitzZap(ctx, out, t0) {
  const dur = 0.09
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
}

function playGameOver(ctx, out, t0) {
  const dur = 2.0
  const fundamental = 110
  const partials = [
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
  }

  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'
  nf.frequency.value = 1200
  const ng = ctx.createGain()
  ramp(ng, t0, 0.30, 0.001, 0.10)
  noise.connect(nf).connect(ng).connect(out)
  noise.start(t0); noise.stop(t0 + 0.12)
}

function playHighscoreBell(ctx, out, t0) {
  const bells = [
    [660, t0],
    [990, t0 + 0.18],
  ]
  for (const [root, start] of bells) {
    const dur = 1.1
    const partials = [
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
    }
  }
}

// ── WAV encoder ───────────────────────────────────────────────────────────

function encodeWav(samples, sampleRate) {
  const numSamples = samples.length
  const dataSize = numSamples * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

// ── render + write ────────────────────────────────────────────────────────

const sounds = [
  { name: 'ball_drop',      dur: 0.50, fn: playBallDrop },
  { name: 'seesaw_tilt',    dur: 0.40, fn: playSeesawTilt },
  { name: 'catapult_fire',  dur: 0.50, fn: playCatapultFire },
  { name: 'flight_whoosh',  dur: 0.60, fn: playFlightWhoosh },
  { name: 'match_pop',      dur: 0.60, fn: playMatchPop },
  { name: 'sawblade_whine', dur: 1.20, fn: playSawbladeWhine },
  { name: 'sawblade_grind', dur: 0.50, fn: playSawbladeGrind },
  { name: 'rock_thud',      dur: 0.70, fn: playRockThud },
  { name: 'blitz_crack',    dur: 1.00, fn: playBlitzCrack },
  { name: 'blitz_zap',      dur: 0.25, fn: playBlitzZap },
  { name: 'game_over',      dur: 2.50, fn: playGameOver },
  { name: 'highscore_bell', dur: 1.80, fn: playHighscoreBell },
]

async function renderSound(def) {
  const length = Math.ceil(def.dur * SAMPLE_RATE)
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE)
  const out = ctx.createGain()
  out.gain.value = 1.0
  out.connect(ctx.destination)
  def.fn(ctx, out, 0)
  const rendered = await ctx.startRendering()
  const samples = rendered.getChannelData(0)
  const wav = encodeWav(samples, SAMPLE_RATE)
  const outPath = path.join(OUT_DIR, `${def.name}.wav`)
  fs.writeFileSync(outPath, wav)
  console.log(`  ✓ ${def.name}.wav  (${(wav.length / 1024).toFixed(0)} KB)`)
}

console.log(`Exporting ${sounds.length} sounds → ${OUT_DIR}\n`)
for (const def of sounds) {
  await renderSound(def)
}
console.log('\nDone.')
