// Shared types + Zod schema for the highscore feature (issue #10).
// Imported by both the API route and the client UI so the contract stays
// in lock-step with database constraints.

import { z } from 'zod'

export const HIGHSCORE_NAME_MAX = 20
export const HIGHSCORE_TOP_N = 10

// Allowed characters in a player name: letters (incl. unicode), digits,
// space, dash and underscore. Stricter than the DB check, matches the issue's
// edge-case rule ("nur Buchstaben/Zahlen/Bindestrich erlaubt").
const NAME_PATTERN = /^[\p{L}\p{N} _-]+$/u

export const highscoreInsertSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name darf nicht leer sein')
    .max(HIGHSCORE_NAME_MAX, `Name darf höchstens ${HIGHSCORE_NAME_MAX} Zeichen lang sein`)
    .regex(NAME_PATTERN, 'Nur Buchstaben, Zahlen, Leerzeichen und Bindestriche erlaubt'),
  score: z
    .number()
    .int('Score muss eine ganze Zahl sein')
    .positive('Score muss größer als 0 sein')
    .max(1_000_000_000, 'Score zu groß'),
})

export type HighscoreInsert = z.infer<typeof highscoreInsertSchema>

export interface HighscoreRow {
  id: string
  name: string
  score: number
  created_at: string // ISO timestamp
}
