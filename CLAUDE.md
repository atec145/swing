# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A modern web rebuild of the classic 1997 puzzle game **Swing** (Software 2000). Players drop weighted balls onto seesaws; when one side outweighs the other by more than the catapult threshold, the lighter side's top ball flies to the neighboring seesaw. Clearing 3+ same-color balls in a row scores points.

Built with Next.js 16 (App Router), TypeScript, HTML5 Canvas, Tailwind CSS, and shadcn/ui.

## Commands

```bash
npm run dev          # Dev server (localhost:3000 or next available port)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright end-to-end tests
```

Run a single test file: `npx vitest run src/test/game-logic.test.ts`

Add shadcn/ui components: `npx shadcn@latest add <name> --yes`

## Game Architecture

All pure game logic lives in `src/game/` — no React or DOM dependencies:

| File | Responsibility |
|------|---------------|
| `types.ts` | `Ball`, `SeesawState`, `GameState`, `GamePhase` |
| `constants.ts` | Layout geometry (CW, CH, ARM_LENGTH, PIVOT_Y…), COLORS (4), MATCH_MIN=3, CATAPULT_THRESHOLD=3 |
| `physics.ts` | `computeAngle()`, `seesawCenterX()`, `leftArmEnd()`, `rightArmEnd()` |
| `logic.ts` | `dropBall()`, `createBall()`, `createInitialState()` — the authoritative game loop |
| `renderer.ts` | Pure canvas drawing: `render(ctx, state)` — no state mutation |

**Game loop inside `dropBall()` (logic.ts):**
1. Add ball to chosen seesaw side
2. `processCatapults()` — BFS from changed seesaw; each seesaw fires at most once per chain (visited Set); catapult fires only when `|lw - rw| > CATAPULT_THRESHOLD`
3. `findMatches()` — scans left-side rows, right-side rows, interleaved rows, and vertical stacks; returns ball IDs to remove
4. Cascade-clear matches until no more remain
5. Check game-over (any side reaches MAX_STACK=8)

**Catapult direction:**
- Left heavier → right arm rises → top right ball → seesaw i+1 left side
- Right heavier → left arm rises → top left ball → seesaw i-1 right side
- Ball falls off edge if no neighbor exists

**Match types checked (all at once):**
- `[s0.left[h], s1.left[h], …]` — left-side horizontal rows
- `[s0.right[h], s1.right[h], …]` — right-side horizontal rows
- `[s0.left[h], s0.right[h], s1.left[h], …]` — interleaved row
- Each individual stack `sw.left` and `sw.right` — vertical

## React Layer

`src/hooks/useGameState.ts` — `useReducer` wrapping `dropBall` / hover / restart. The game page uses `dynamic(() => import('./SwingGame'), { ssr: false })` to avoid SSR hydration mismatches from `Math.random()`.

`src/components/game/GameCanvas.tsx` — canvas ref + `requestAnimationFrame` render loop + click/hover hit detection. `hitTest(x)` maps canvas x-coordinate to `{ seesaw, side }`.

`src/components/game/GameUI.tsx` — score, next-ball preview, restart button.

## Key Design Decisions

- **4 colors, not 5**: With 5 colors and MATCH_MIN=3, match probability per full stack is ~19%, too low for fun gameplay. 4 colors gives ~28%.
- **CATAPULT_THRESHOLD=3**: Allows both sides of a seesaw to accumulate balls before catapulting, enabling horizontal matches. Without this threshold, catapults aggressively empty one side, making horizontal matches impossible.
- **One catapult per seesaw per chain**: The `visited` Set in `processCatapults` prevents a seesaw from being re-processed in the same chain, keeping both sides populated.
- **Canvas rendering**: All drawing in `renderer.ts` is stateless — given a `GameState`, it produces the same output. The seesaw angle is computed from `computeAngle(left, right)` and stored in `SeesawState`.

## AI Development Workflow

This repo uses the GitHub Issues-based skill system from the parent template. Track features as GitHub Issues; run `/requirements`, `/architecture`, `/frontend`, `/backend`, `/qa`, `/deploy` skills for structured development.

Commit format: `type(#N): description` (N = GitHub issue number)
