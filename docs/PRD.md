# Product Requirements Document

## Vision

A browser-based reimplementation of the classic 1997 puzzle game **Swing** (Software 2000). Players drop weighted balls onto a row of seesaws; imbalance triggers chain-reaction catapults that launch balls across seesaws, and clearing 3 or more same-color balls in a row scores points. The goal is to keep the board clear as long as possible.

## Target Users

**Casual puzzle gamers** — players who enjoy quick-session, physics-feel puzzle games in the browser without installation, accounts, or downloads.

**Nostalgia seekers** — players who remember the original 1997 Swing and want to revisit it in a modern, accessible format.

Their core need: a satisfying, low-friction puzzle loop that rewards clever placement and chain-reaction thinking.

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | Game board — 6 seesaws on HTML5 Canvas | Deployed |
| P0 (MVP) | Ball dropping — click left/right side of a seesaw to place a ball | Deployed |
| P0 (MVP) | Seesaw physics — angle updates based on total weight each side | Deployed |
| P0 (MVP) | Catapult chain reactions — imbalance > threshold launches top ball to neighbor | Deployed |
| P0 (MVP) | Match detection — 3+ same-color balls in horizontal rows, interleaved rows, or vertical stacks | Deployed |
| P0 (MVP) | Cascade clearing — matches re-evaluated after each clear until board is stable | Deployed |
| P0 (MVP) | Scoring — 10 pts per ball cleared + 50 pts bonus per match group | Deployed |
| P0 (MVP) | Next-ball preview — shows upcoming ball's color and weight | Deployed |
| P0 (MVP) | Game-over detection — any arm stack reaches 8 balls | Deployed |
| P0 (MVP) | Restart — button appears on game-over screen | Deployed |
| P1 | Progressive difficulty — full/half (billiard-style) balls, color count grows with score (#1) | Planned |
| P1 | High score persistence — save best score across sessions | Planned |
| P1 | Animations — visual feedback for catapult launches and match clears | Planned |
| P1 | Sound effects — audio cues for drops, catapults, matches | Planned |
| P2 | Difficulty levels — adjust number of colors or catapult threshold | Planned |
| P2 | Mobile/touch support — tap targets sized for phone screens | Planned |

## Success Metrics

- Players can reach a score > 0 in the majority of sessions (match rate ~28% with 4 colors)
- No infinite loops or crashes in catapult chain reactions
- Session starts instantly in a browser with no login or install

## Constraints

- Single-player, browser-only (Next.js / HTML5 Canvas)
- No backend or user accounts
- No persistent state beyond a session (currently)
- Canvas is fixed at 900×580px

## Non-Goals

- Multiplayer or competitive modes
- User authentication
- Level progression or a campaign mode
- Server-side game logic
