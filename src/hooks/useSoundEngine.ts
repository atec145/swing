'use client'

// Sound engine for the Swing game (issue #15).
//
// One AudioContext + one master GainNode are created lazily the first time the
// player interacts (Web Audio Autoplay Policy compliance). All synthesis is
// scheduled relative to `audioCtx.currentTime` via the helpers in
// `src/lib/sounds.ts`.
//
// Mute state is persisted in localStorage. When muted, the master gain is held
// at 0 — scheduled nodes still play (cheap CPU) but inaudible. Unmuting
// instantly restores audibility.
//
// State observation mirrors useTracking: we hold refs to the previous values
// of each side-channel and fire sounds on edge transitions.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '@/game/types'
import {
  playBallDrop,
  playBlitzCrack,
  playBlitzZap,
  playCatapultFire,
  playFlightWhoosh,
  playGameOver,
  playHighscoreBell,
  playMatchPop,
  playRockThud,
  playSawbladeGrind,
  playSawbladeWhine,
  playSeesawTilt,
  type SoundHandle,
} from '@/lib/sounds'

const MUTE_STORAGE_KEY = 'swing_muted'

// Cap on simultaneous sounds — extra triggers past this are dropped silently
// to keep the mixer from clipping during chain-cascades.
const MAX_VOICES = 24

/**
 * Read the persisted mute state. Returns false when localStorage is unavailable.
 * Safe to call on the server (returns false during SSR).
 */
function readMuteFromStorage(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeMuteToStorage(muted: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false')
  } catch {
    // localStorage may throw in private mode / quota issues — silent fail OK.
  }
}

export interface UseSoundEngineResult {
  isMuted: boolean
  toggleMute: () => void
  /** Fires the highscore bell. Called by HighscoreModal once an entry is submitted. */
  playHighscore: () => void
  /** Wraps any user-driven event (e.g. ball drop) — unlocks the context + plays the drop sound. */
  notifyDrop: (kind: 'normal' | 'sawblade' | 'rock' | 'blitz') => void
}

export function useSoundEngine(gameState: GameState): UseSoundEngineResult {
  // ---- mute state -------------------------------------------------------
  // We initialise with the persisted value synchronously so the *first* sound
  // already honours the user's preference (no flash of audible sound).
  const [isMuted, setIsMuted] = useState<boolean>(() => readMuteFromStorage())

  // ---- audio nodes ------------------------------------------------------
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  // Tracks every still-playing sound handle so game-over can abort loops.
  const activeRef = useRef<Set<SoundHandle>>(new Set())

  /**
   * Lazily create the AudioContext on first use. Browsers block AudioContext
   * creation/resumption outside a user-gesture handler — we therefore *only*
   * call this from inside synchronous handlers triggered by user input.
   */
  const ensureContext = useCallback((): { ctx: AudioContext; master: GainNode } | null => {
    if (typeof window === 'undefined') return null
    let ctx = ctxRef.current
    let master = masterRef.current

    if (!ctx) {
      try {
        // Safari ships the prefixed version; we cast through a minimal shape.
        type AudioContextCtor = new () => AudioContext
        const W = window as unknown as {
          AudioContext?: AudioContextCtor
          webkitAudioContext?: AudioContextCtor
        }
        const Ctor = W.AudioContext ?? W.webkitAudioContext
        if (!Ctor) return null
        ctx = new Ctor()
        master = ctx.createGain()
        master.gain.value = isMuted ? 0 : 0.5
        master.connect(ctx.destination)
        ctxRef.current = ctx
        masterRef.current = master
      } catch {
        return null
      }
    }
    // Resume if suspended (Chrome auto-suspends on tab inactivity).
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => { /* ignored */ })
    }
    if (!master) return null
    return { ctx, master }
  }, [isMuted])

  // Apply mute to live master gain whenever it toggles.
  useEffect(() => {
    const master = masterRef.current
    if (!master) return
    master.gain.value = isMuted ? 0 : 0.5
  }, [isMuted])

  /**
   * Helper that runs a synth helper while tracking it for global cancellation.
   * Returns early if the engine isn't ready (e.g. iOS, pre-first-interaction).
   */
  const schedule = useCallback((
    runner: (ctx: AudioContext, out: GainNode, when: number) => SoundHandle,
  ): void => {
    const nodes = ensureContext()
    if (!nodes) return
    if (activeRef.current.size >= MAX_VOICES) return  // polyphony cap
    const handle = runner(nodes.ctx, nodes.master, nodes.ctx.currentTime)
    activeRef.current.add(handle)
    // Garbage-collect handles ~2.5s after start (longer than any single sound).
    window.setTimeout(() => activeRef.current.delete(handle), 2500)
  }, [ensureContext])

  /** Aborts every still-playing sound. Used at game-over to silence ongoing loops. */
  const stopAllActive = useCallback((): void => {
    const ctx = ctxRef.current
    if (!ctx) return
    const t = ctx.currentTime
    for (const h of activeRef.current) h.stopAll(t)
    activeRef.current.clear()
  }, [])

  // ---- toggle (called from MuteButton) ---------------------------------
  const toggleMute = useCallback((): void => {
    setIsMuted(prev => {
      const next = !prev
      writeMuteToStorage(next)
      const master = masterRef.current
      if (master) master.gain.value = next ? 0 : 0.5
      return next
    })
    // Attempt to instantiate the context here too — the click is a valid user
    // gesture, so we can safely unlock audio for future events.
    ensureContext()
  }, [ensureContext])

  // ---- public: ball-drop sound (called from wrapped handleDrop) --------
  const notifyDrop = useCallback((kind: 'normal' | 'sawblade' | 'rock' | 'blitz'): void => {
    if (kind === 'rock') {
      schedule(playRockThud)
    } else {
      // Sawblade and blitz also produce a metallic landing thud; their
      // signature sounds are layered on top by the event watchers below.
      schedule(playBallDrop)
    }
  }, [schedule])

  // ---- public: highscore-bell hook -------------------------------------
  const playHighscore = useCallback((): void => {
    schedule(playHighscoreBell)
  }, [schedule])

  // ---- event watchers ---------------------------------------------------
  // Track sequence numbers of each side-channel so we fire exactly once per
  // event (the channels stay populated for one tick after the logic emits them).
  const lastCatapultSeqRef = useRef<number | null>(null)
  const lastMatchSeqRef = useRef<number | null>(null)
  const lastSawbladeSeqRef = useRef<number | null>(null)
  const lastBlitzSeqRef = useRef<number | null>(null)
  const prevTiltsRef = useRef<string[] | null>(null)
  const prevPhaseRef = useRef(gameState.phase)

  // 1. Seesaw tilt — fires when any seesaw changes its tilt direction.
  useEffect(() => {
    const tilts = gameState.seesaws.map(s => s.tilt)
    const prev = prevTiltsRef.current
    if (prev && prev.length === tilts.length) {
      for (let i = 0; i < tilts.length; i++) {
        if (prev[i] !== tilts[i]) {
          schedule(playSeesawTilt)
          break  // one click per state change — avoid double-firing on chain reactions
        }
      }
    }
    prevTiltsRef.current = tilts
  }, [gameState.seesaws, schedule])

  // 2. Catapult side-channel — spring snap + whoosh. The catapult chain may
  //    contain multiple events but they're closely staggered visually; we play
  //    one snap per chain (the dominant audio event) and a longer flight whoosh.
  useEffect(() => {
    const p = gameState.pendingCatapult
    if (!p) return
    if (lastCatapultSeqRef.current === p.seq) return
    lastCatapultSeqRef.current = p.seq
    schedule(playCatapultFire)
    // Layer a flight whoosh slightly behind the snap, scaled to chain length.
    const flightDur = Math.min(0.9, 0.3 + p.events.length * 0.18)
    const nodes = ensureContext()
    if (nodes) {
      const handle = playFlightWhoosh(nodes.ctx, nodes.master, nodes.ctx.currentTime + 0.05, flightDur)
      activeRef.current.add(handle)
      window.setTimeout(() => activeRef.current.delete(handle), (flightDur + 0.2) * 1000)
    }
  }, [gameState.pendingCatapult, schedule, ensureContext])

  // 3. Match dissolve — glass burst per group (cascade plays as a sequence).
  useEffect(() => {
    const p = gameState.pendingMatch
    if (!p) return
    if (lastMatchSeqRef.current === p.seq) return
    lastMatchSeqRef.current = p.seq
    // One pop per cascade round, slightly staggered so a 3-deep cascade is
    // audible as three distinct "tings". The visual dissolve takes 3.3s per
    // group so a 0.45s stagger keeps audio within the visual window.
    const nodes = ensureContext()
    if (!nodes) return
    p.groups.forEach((_, i) => {
      const when = nodes.ctx.currentTime + i * 0.45
      const handle = playMatchPop(nodes.ctx, nodes.master, when)
      activeRef.current.add(handle)
      window.setTimeout(() => activeRef.current.delete(handle), 800 + i * 450)
    })
  }, [gameState.pendingMatch, ensureContext])

  // 4. Sawblade — motor whine on landing, then a grind sound per cleared ball.
  useEffect(() => {
    const p = gameState.pendingSawblade
    if (!p) return
    if (lastSawbladeSeqRef.current === p.seq) return
    lastSawbladeSeqRef.current = p.seq

    const nodes = ensureContext()
    if (!nodes) return
    // Total visual duration: ~160ms bounce + ~420ms grind per ball.
    const whineDur = 0.16 + p.clearedBalls.length * 0.42
    const whineHandle = playSawbladeWhine(nodes.ctx, nodes.master, nodes.ctx.currentTime, whineDur)
    activeRef.current.add(whineHandle)
    window.setTimeout(() => activeRef.current.delete(whineHandle), (whineDur + 0.2) * 1000)

    // Per-ball grind cues lined up with the visual cutter rhythm.
    p.clearedBalls.forEach((_, i) => {
      const when = nodes.ctx.currentTime + 0.16 + i * 0.42
      const handle = playSawbladeGrind(nodes.ctx, nodes.master, when)
      activeRef.current.add(handle)
      window.setTimeout(() => activeRef.current.delete(handle), 700 + i * 420)
    })
  }, [gameState.pendingSawblade, ensureContext])

  // 5. Blitz — thunder crack + chain-lightning zaps per target ball.
  useEffect(() => {
    const p = gameState.pendingBlitz
    if (!p) return
    if (lastBlitzSeqRef.current === p.seq) return
    lastBlitzSeqRef.current = p.seq

    if (!p.targetColor || p.clearedBalls.length === 0) return  // discharged blitz, no FX

    const nodes = ensureContext()
    if (!nodes) return
    const crack = playBlitzCrack(nodes.ctx, nodes.master, nodes.ctx.currentTime)
    activeRef.current.add(crack)
    window.setTimeout(() => activeRef.current.delete(crack), 900)

    // Zaps fire in rapid succession during the 520ms chain phase
    const chainSpan = 0.45
    const step = chainSpan / Math.max(1, p.clearedBalls.length)
    p.clearedBalls.forEach((_, i) => {
      const when = nodes.ctx.currentTime + 0.08 + i * step
      const handle = playBlitzZap(nodes.ctx, nodes.master, when)
      activeRef.current.add(handle)
      window.setTimeout(() => activeRef.current.delete(handle), 250 + i * step * 1000)
    })
  }, [gameState.pendingBlitz, ensureContext])

  // 6. Game over — stop active loops, then play the final toll.
  useEffect(() => {
    const prev = prevPhaseRef.current
    if (prev !== 'gameover' && gameState.phase === 'gameover') {
      stopAllActive()
      schedule(playGameOver)
    }
    prevPhaseRef.current = gameState.phase
  }, [gameState.phase, schedule, stopAllActive])

  return {
    isMuted,
    toggleMute,
    playHighscore,
    notifyDrop,
  }
}
