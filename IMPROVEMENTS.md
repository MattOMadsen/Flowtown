# Flowtown – forbedringsforslag (backlog)

Status opdateres når noget laves. Prioritet: **P0** (hurtigt/højt) → **P3** (senere).

## Lavet (session 2026-08)

- [x] Fase 1: jobs, økonomi, bots, biltyper
- [x] Bedre vejgrafik (lag, snap, smooth)
- [x] Zoom (knapper, hjul, pinch) + pan
- [x] Jobs-panel væk fra Nord/Vest (midt + fold)
- [x] Fit-all / “se hele byen”
- [x] Simpel minimap
- [x] Bedre pathfinding ved kryds
- [x] AGENTS.md + denne backlog
- [x] `.gitignore` for `data/`

---

## P0 – Hurtige wins

| ID | Forslag | Noter |
|----|---------|--------|
| P0-1 | ~~Kompakt/foldbar opgaveliste~~ | Done |
| P0-2 | ~~Minimap + fit all~~ | Done |
| P0-3 | ~~Bedre pathfinding~~ | Done – kan altid finpudses |
| P0-4 | Tydeligere snap-feedback (stærkere glød / kort “klik”) | Delvist via snap-glow |
| P0-5 | Safe-area padding (iPhone notch / home indicator) | `env(safe-area-inset-*)` |

## P1 – Spil-følelse

| ID | Forslag | Noter |
|----|---------|--------|
| P1-1 | Soft lyd: ding ved levering, lav vej-lyd | Web Audio, mute-knap |
| P1-2 | Første-gangs tutorial (tegn Nord→Centrum) | Overlay steps |
| P1-3 | Rush hour / peak demand | Periodisk spawn-boost |
| P1-4 | Distrikter vokser (flere jobs / større radius) | PLAN Fase 2 |
| P1-5 | Flere distrikter / større map | Kræver camera+scroll map bounds |
| P1-6 | Gem session (penge, veje, jobs) i localStorage | Ud over highscore |

## P2 – Dybde

| ID | Forslag | Noter |
|----|---------|--------|
| P2-1 | Trafiklys / envejsveje | Valgfrit tool |
| P2-2 | Flere biltyper (bus, hurtigbil) | Kapacitet/fart |
| P2-3 | Station / lager / depot-bygninger | Placering + buff |
| P2-4 | Achievements | localStorage flags |
| P2-5 | Scenarier / niveauer | “Forbind 5 byer” |

## P3 – Deluxe / senere

| ID | Forslag | Noter |
|----|---------|--------|
| P3-1 | Dynamisk vejr / tid på døgnet | Visuelt |
| P3-2 | Stærkere bot-AI (planlæg netværk) | bot.js |
| P3-3 | Multiplayer / delte maps | Kræver backend |
| P3-4 | Leaderboard | Cloud |

## Teknik / kvalitet

| ID | Forslag | Noter |
|----|---------|--------|
| T-1 | Enhedstests: snap, cost, zoom-math, path score | Node + simple asserts |
| T-2 | Performance: cull biler uden for viewport | Ved mange vehicles |
| T-3 | Road graph cache (junctions) i stedet for O(n²) scan | game draw junctions |
| T-4 | Accessibility: større touch targets, aria | Delvist zoom |
| T-5 | Offline PWA manifest (valgfrit) | |

---

## Sådan bruger du listen

1. Vælg ID (fx `P1-1`).
2. Implementér fokuseret.
3. Flyt til **Lavet** med dato.
4. Opdater `AGENTS.md` hvis der opstod en ny “lært fejl”.
