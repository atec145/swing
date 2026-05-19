'use client'

// HighscoreModal — appears at game-over and shows the global Top-10.
//
// Behaviour (per issue #10):
//  - Fetches /api/highscores on open.
//  - Top-10 list, sorted score DESC, created_at ASC (server-side).
//  - If the player's own score qualifies (> 10th place OR list < 10 entries
//    and own score > 0), a name-entry form is shown. After submit, the entry
//    appears at the correct rank in the list.
//  - The own score is ALWAYS rendered as an emphasised 11th row at the
//    bottom — even when the player is already in the Top-10 — so the user
//    always sees their result clearly.
//  - Score of 0 → no name entry, but the "Du" row still shows (purely
//    informational; not posted to the server).
//  - Error / loading / empty states handled inline.

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHighscores } from '@/hooks/useHighscores'
import { HIGHSCORE_NAME_MAX, HIGHSCORE_TOP_N, type HighscoreRow } from '@/lib/highscores'

interface Props {
  open: boolean
  score: number
  onClose: () => void
  onRestart: () => void
}

// Allowed name chars (mirrors highscoreInsertSchema NAME_PATTERN).
const NAME_PATTERN = /^[\p{L}\p{N} _-]+$/u

export default function HighscoreModal({ open, score, onClose, onRestart }: Props) {
  const { highscores, loading, error, submitting, submitError, refetch, submit } =
    useHighscores()

  // Local UI state. `submittedRow` is the row returned by POST — once set, the
  // name form is hidden and the player can no longer post again from this game.
  const [name, setName] = useState('')
  const [submittedRow, setSubmittedRow] = useState<HighscoreRow | null>(null)
  const [skipped, setSkipped] = useState(false)

  // Reset local state + refetch whenever the modal opens for a fresh game-over.
  useEffect(() => {
    if (!open) return
    setName('')
    setSubmittedRow(null)
    setSkipped(false)
    void refetch()
  }, [open, refetch])

  // Eligibility:
  //  - score must be > 0
  //  - player hasn't already submitted or skipped
  //  - either the list has < TOP_N entries OR score beats the last entry
  const qualifies = useMemo(() => {
    if (score <= 0) return false
    if (submittedRow || skipped) return false
    if (highscores.length < HIGHSCORE_TOP_N) return true
    const last = highscores[highscores.length - 1]
    return score > last.score
  }, [score, highscores, submittedRow, skipped])

  // Validate name (client-side mirror of the Zod schema for instant feedback).
  const trimmed = name.trim()
  const nameValid =
    trimmed.length >= 1 &&
    trimmed.length <= HIGHSCORE_NAME_MAX &&
    NAME_PATTERN.test(trimmed)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid || submitting) return
    const row = await submit(trimmed, score)
    if (row) setSubmittedRow(row)
  }

  function handleSkip() {
    setSkipped(true)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-md sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Game Over
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Globale Top {HIGHSCORE_TOP_N} — vergleiche dich mit allen Spielern.
          </DialogDescription>
        </DialogHeader>

        <HighscoreBody
          loading={loading}
          error={error}
          highscores={highscores}
          ownScore={score}
          ownEntryId={submittedRow?.id ?? null}
          ownName={submittedRow?.name ?? null}
          onRetry={() => void refetch()}
        />

        {qualifies && !error && !loading && (
          <form onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="highscore-name" className="text-slate-300">
                Du bist in den Top {HIGHSCORE_TOP_N}! Trag deinen Namen ein:
              </Label>
              <Input
                id="highscore-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={HIGHSCORE_NAME_MAX}
                placeholder="Dein Name"
                autoFocus
                disabled={submitting}
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                aria-invalid={!nameValid && name.length > 0}
                aria-describedby="highscore-name-hint"
              />
              <p
                id="highscore-name-hint"
                className="text-xs text-slate-500"
              >
                1–{HIGHSCORE_NAME_MAX} Zeichen, nur Buchstaben, Zahlen, Leerzeichen und Bindestriche.
              </p>
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-red-400">
                {submitError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={handleSkip}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Überspringen
              </Button>
              <Button
                type="submit"
                disabled={!nameValid || submitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {submitting ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </form>
        )}

        <DialogFooter className="pt-2">
          <Button
            onClick={() => {
              onRestart()
              onClose()
            }}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Neues Spiel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------------
// Body: handles loading / error / table.
// -----------------------------------------------------------------------

interface BodyProps {
  loading: boolean
  error: string | null
  highscores: HighscoreRow[]
  ownScore: number
  ownEntryId: string | null
  ownName: string | null
  onRetry: () => void
}

function HighscoreBody({
  loading,
  error,
  highscores,
  ownScore,
  ownEntryId,
  ownName,
  onRetry,
}: BodyProps) {
  if (loading && highscores.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div
          className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-400">Highscores werden geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-center space-y-3" role="alert">
        <p className="text-sm text-red-400">Highscores nicht verfügbar.</p>
        <p className="text-xs text-slate-500">{error}</p>
        <div className="flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Erneut versuchen
          </Button>
        </div>
        <p className="text-xs text-slate-500 pt-2">
          Dein Ergebnis: <span className="font-semibold text-slate-300">{ownScore.toLocaleString('de-DE')}</span>
        </p>
      </div>
    )
  }

  return (
    <div className="max-h-[55vh] overflow-y-auto rounded-md border border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="w-10 text-slate-400">#</TableHead>
            <TableHead className="text-slate-400">Name</TableHead>
            <TableHead className="text-right text-slate-400">Score</TableHead>
            <TableHead className="text-right text-slate-400 hidden sm:table-cell">
              Datum
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {highscores.length === 0 && (
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableCell
                colSpan={4}
                className="text-center text-sm text-slate-500 py-6"
              >
                Noch keine Highscores — sei der Erste!
              </TableCell>
            </TableRow>
          )}
          {highscores.map((row, idx) => {
            const isOwn = ownEntryId !== null && row.id === ownEntryId
            return (
              <TableRow
                key={row.id}
                className={
                  isOwn
                    ? 'border-slate-800 bg-indigo-950/40 hover:bg-indigo-950/60'
                    : 'border-slate-800 hover:bg-slate-900'
                }
              >
                <TableCell className="font-mono text-slate-300 tabular-nums">
                  {idx + 1}
                </TableCell>
                <TableCell className="font-medium text-slate-100 break-all">
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-100">
                  {row.score.toLocaleString('de-DE')}
                </TableCell>
                <TableCell className="text-right text-slate-500 text-xs hidden sm:table-cell">
                  {formatDate(row.created_at)}
                </TableCell>
              </TableRow>
            )
          })}

          {/* Always-visible own-score row (11th line). */}
          <TableRow className="border-t-2 border-indigo-700 bg-indigo-900/50 hover:bg-indigo-900/60">
            <TableCell className="font-mono text-indigo-300 tabular-nums">
              Du
            </TableCell>
            <TableCell className="font-semibold text-white break-all">
              {ownName ?? 'Dein Ergebnis'}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold text-white">
              {ownScore.toLocaleString('de-DE')}
            </TableCell>
            <TableCell className="text-right text-indigo-300 text-xs hidden sm:table-cell">
              Jetzt
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return ''
  }
}
