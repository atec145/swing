'use client'

import dynamic from 'next/dynamic'

const SwingGame = dynamic(() => import('@/components/game/SwingGame'), { ssr: false })

// Deterministic particle positions — no Math.random so SSR-safe
const PARTICLES: { left: string; delay: string; duration: string; size: number; color: string }[] = [
  { left: '3%',  delay: '0s',    duration: '6.2s', size: 2,   color: 'rgba(60,201,214,0.65)' },
  { left: '8%',  delay: '1.4s',  duration: '8.1s', size: 1.5, color: 'rgba(61,125,216,0.55)' },
  { left: '14%', delay: '0.7s',  duration: '5.8s', size: 3,   color: 'rgba(61,203,92,0.45)'  },
  { left: '20%', delay: '3.1s',  duration: '7.4s', size: 1.5, color: 'rgba(60,201,214,0.5)'  },
  { left: '27%', delay: '0.3s',  duration: '9.0s', size: 2,   color: 'rgba(180,80,220,0.4)'  },
  { left: '34%', delay: '2.2s',  duration: '6.6s', size: 1.5, color: 'rgba(61,125,216,0.6)'  },
  { left: '41%', delay: '4.0s',  duration: '7.9s', size: 2.5, color: 'rgba(60,201,214,0.55)' },
  { left: '48%', delay: '1.1s',  duration: '5.5s', size: 1.5, color: 'rgba(224,58,58,0.35)'  },
  { left: '55%', delay: '3.7s',  duration: '8.4s', size: 2,   color: 'rgba(60,201,214,0.5)'  },
  { left: '62%', delay: '0.9s',  duration: '6.8s', size: 3,   color: 'rgba(61,125,216,0.5)'  },
  { left: '68%', delay: '2.5s',  duration: '7.2s', size: 1.5, color: 'rgba(61,203,92,0.4)'   },
  { left: '74%', delay: '1.8s',  duration: '9.3s', size: 2,   color: 'rgba(180,80,220,0.45)' },
  { left: '80%', delay: '4.4s',  duration: '6.1s', size: 1.5, color: 'rgba(60,201,214,0.6)'  },
  { left: '86%', delay: '0.5s',  duration: '8.7s', size: 2.5, color: 'rgba(61,125,216,0.55)' },
  { left: '91%', delay: '3.3s',  duration: '5.9s', size: 2,   color: 'rgba(224,58,58,0.3)'   },
  { left: '96%', delay: '1.6s',  duration: '7.6s', size: 1.5, color: 'rgba(60,201,214,0.5)'  },
  { left: '11%', delay: '5.0s',  duration: '6.4s', size: 2,   color: 'rgba(180,80,220,0.5)'  },
  { left: '44%', delay: '2.8s',  duration: '8.9s', size: 1.5, color: 'rgba(61,203,92,0.5)'   },
  { left: '71%', delay: '0.2s',  duration: '7.0s', size: 3,   color: 'rgba(60,201,214,0.4)'  },
  { left: '88%', delay: '4.7s',  duration: '5.3s', size: 2,   color: 'rgba(61,125,216,0.45)' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-[#070910] flex flex-col items-center justify-center p-4 overflow-hidden relative">

      {/* Aurora band */}
      <div className="aurora" aria-hidden="true" />

      {/* Drifting nebula blobs */}
      <div className="nebula-blob nebula-1" aria-hidden="true" />
      <div className="nebula-blob nebula-2" aria-hidden="true" />
      <div className="nebula-blob nebula-3" aria-hidden="true" />
      <div className="nebula-blob nebula-4" aria-hidden="true" />

      {/* Scanline overlay */}
      <div className="scanlines" aria-hidden="true" />

      {/* Rising particles */}
      <div className="particle-layer" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              width: `${p.size}px`,
              height: `${p.size}px`,
              color: p.color,
              background: p.color,
              '--px-drift': `${(i % 2 === 0 ? 1 : -1) * (8 + (i * 7) % 20)}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Title */}
      <h1 className="game-title">Swing</h1>

      {/* Game canvas with glow frame */}
      <div className="game-canvas-wrapper">
        <span className="corner corner-tl" aria-hidden="true" />
        <span className="corner corner-tr" aria-hidden="true" />
        <span className="corner corner-bl" aria-hidden="true" />
        <span className="corner corner-br" aria-hidden="true" />
        <SwingGame />
      </div>

      <p className="mt-4 text-xs text-slate-700 relative z-10">
        3+ same-color balls in a row disappear · heavier side tips the seesaw
      </p>
    </main>
  )
}
