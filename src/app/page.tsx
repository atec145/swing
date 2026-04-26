'use client'

import dynamic from 'next/dynamic'

const SwingGame = dynamic(() => import('@/components/game/SwingGame'), { ssr: false })

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-slate-300 tracking-[0.25em] uppercase mb-4">
        Swing
      </h1>
      <SwingGame />
      <p className="mt-4 text-xs text-slate-700">
        3+ same-color balls in a row disappear · heavier side tips the seesaw
      </p>
    </main>
  )
}
