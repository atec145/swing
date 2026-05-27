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
| P1 | Keyboard-controlled crane launcher — futuristic robot crane with ball-drop animation (#2) | Deployed |
| P0 (MVP) | Seesaw physics — angle updates based on total weight each side | Deployed |
| P0 (MVP) | Catapult chain reactions — imbalance > threshold launches top ball to neighbor | Deployed |
| P0 (MVP) | Seesaw physics rework — 3-state model (left/balanced/right), weight-difference catapult distance, chain reactions (#4) | Planned |
| P0 (MVP) | Match detection — 3+ same-color balls in horizontal rows, interleaved rows, or vertical stacks | Deployed |
| P0 (MVP) | Cascade clearing — matches re-evaluated after each clear until board is stable | Deployed |
| P0 (MVP) | Scoring — 10 pts per ball cleared + 50 pts bonus per match group | Deployed |
| P0 (MVP) | Next-ball preview — shows upcoming ball's color and weight | Deployed |
| P0 (MVP) | Game-over detection — any arm stack reaches 8 balls | Deployed |
| P0 (MVP) | Restart — button appears on game-over screen | Deployed |
| P1 | Progressive difficulty — full/half (billiard-style) balls, color count grows with score (#1) | Planned |
| P1 | Global highscore ranking — Top-10 via Supabase, name entry on Top-10 entry (#10) | Planned |
| P1 | Catapult animation — parabolic arc flight, weight-based launch distance, sequential chain reactions (#3) | Planned |
| P1 | Sound effects — audio cues for drops, catapults, matches | Planned |
| P2 | Difficulty levels — adjust number of colors or catapult threshold | Planned |
| P1 | Match dissolve animation — Star Trek transporter beam effect when balls are cleared (#5) | Planned |
| P2 | Mobile/touch support — tap targets sized for phone screens | Planned |
| P1 | Special Ball: Sägeblatt — rotierendes Sägeblatt cleared komplette Arm-Spalte mit Partikeleffekten (#11) | Planned |
| P2 | Anonyme Nutzungsstatistik — Session-Tracking (Spielanzahl, Score, Dauer) via Supabase (#14) | Planned |
| P1 | Sound Effects — physikalisch-realistische Klangkulisse via Web Audio API, Mute-Button (#15) | Planned |

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
