'use client'

// Client-side hook for the global Top-10 highscore list.
//
// Responsibilities:
//  - Fetch GET /api/highscores on demand (call `refetch()`).
//  - Submit a new entry via POST /api/highscores, returning the saved row.
//  - Track loading / error states so the modal can render spinner + retry.
//
// The hook never touches Supabase directly — all traffic goes through the
// Next.js API proxy so the service-role key stays server-side.

import { useCallback, useState } from 'react'
import type { HighscoreRow } from '@/lib/highscores'

export interface UseHighscoresResult {
  highscores: HighscoreRow[]
  loading: boolean
  error: string | null
  submitting: boolean
  submitError: string | null
  refetch: () => Promise<void>
  submit: (name: string, score: number) => Promise<HighscoreRow | null>
}

export function useHighscores(): UseHighscoresResult {
  const [highscores, setHighscores] = useState<HighscoreRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/highscores', { cache: 'no-store' })
      if (!res.ok) {
        const body = await safeJson(res)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { highscores: HighscoreRow[] }
      setHighscores(body.highscores ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Highscores nicht verfügbar')
    } finally {
      setLoading(false)
    }
  }, [])

  const submit = useCallback(
    async (name: string, score: number): Promise<HighscoreRow | null> => {
      setSubmitting(true)
      setSubmitError(null)
      try {
        const res = await fetch('/api/highscores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, score }),
        })
        const body = await safeJson(res)
        if (!res.ok) {
          const msg = body?.error ?? `HTTP ${res.status}`
          throw new Error(msg)
        }
        const row = body?.highscore as HighscoreRow | undefined
        if (!row) throw new Error('Antwort ohne Eintrag')
        // Refresh list so the new entry shows up in the right rank.
        await refetch()
        return row
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Speichern fehlgeschlagen',
        )
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [refetch],
  )

  return {
    highscores,
    loading,
    error,
    submitting,
    submitError,
    refetch,
    submit,
  }
}

async function safeJson(res: Response): Promise<{ error?: string; highscore?: HighscoreRow } | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
