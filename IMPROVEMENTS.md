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
- [x] **PROG-A1** Job-styret spawn (ingen free-roam) + cap pr. job
- [x] **PROG-A2** Spawn på vej, blend ved skift, clamp progress, bedre U-turn
- [x] **PROG-B1** XP + level + localStorage + first-link XP + UI bar
- [x] **PROG-F1** Køb bil via by-tryk; ejet flåde (ingen player auto-spawn)
- [x] **PROG-F2** Auto-assign jobs til ledige biler + flåde-UI
- [x] **PROG-U1** Opgrader bil +last (rank 0–3) i by-sheet
- [x] **PROG-U2** Unlock hurtig bil (5) / tung lastbil (10) via totalUpgrades
- [x] **PROG-U3** Visuel klasse-forskel + job-match i assign
- [x] **PROG-M1** Større map, stedtyper (by/landbrug/fabrik/havn), realistiske navne, typed jobs
- [x] **PROG-B3** 2-spor vej-opgradering (mode + visual + capacity)
- [x] **PROG-C1** Baner + 3 stjerner + map-select
- [x] **PROG-VIS1** Bedre verdenskort (terrain, vand, markers, hubs)
- [x] **PROG-D1** Vand/kyst + bro-tool
- [x] **PROG-VIS2** Skarpere steder + vej/bro-art
- [x] **PROG-VIS3** Playable board, tæt start-zoom, sprites (ingen bobler)

---

## P0 – Hurtige wins

| ID | Forslag | Noter |
|----|---------|--------|
| P0-1 | ~~Kompakt/foldbar opgaveliste~~ | Done |
| P0-2 | ~~Minimap + fit all~~ | Done |
| P0-3 | ~~Bedre pathfinding~~ | Done – kan altid finpudses |
| P0-4 | Tydeligere snap-feedback (stærkere glød / kort “klik”) | Delvist via snap-glow |
| P0-5 | Safe-area padding (iPhone notch / home indicator) | `env(safe-area-inset-*)` |

## P0+ – Spil-kerne (progression-plan, se DESIGN-PROGRESSION.md)

| ID | Forslag | Noter |
|----|---------|--------|
| PROG-A1 | ~~Job-styret spawn~~ | Done 2026-08-03 |
| PROG-A2 | ~~Fix bil-hakning~~ | Done 2026-08-03 |
| PROG-A3 | By-hubs + stærk snap + connected + bynavne | game.js |
| PROG-B1 | ~~XP + level + localStorage meta~~ | Done 2026-08-03 |
| PROG-B2 | Shop UI (flåde/infra unlock’et af level) | bottom sheet |
| PROG-B3 | ~~2-spor vej-opgradering~~ | Done 2026-08-04 |
| PROG-C1 | ~~Baner/scenarios + 3-stjerne~~ | Done 2026-08-04 |
| PROG-VIS1 | ~~Bedre verdenskort~~ | Done 2026-08-04 |
| PROG-C2 | Map-select + end-of-run | campaign |
| PROG-C3 | Større world bounds + flere byer på senere baner | Delvist → M1 |
| PROG-M1 | ~~Større map + TTD-steder + navne~~ | Done 2026-08-04 |
| PROG-D1 | ~~Vand + kyst~~ | Done 2026-08-04 |
| PROG-D2 | ~~Broer~~ | Done (Bro-tool) |
| PROG-VIS2 | ~~Skarpere art~~ | Done 2026-08-04 |
| PROG-D3 | Flere jobtyper (ekspres, turist, …) | jobs.js |
| PROG-F1 | ~~Køb bil via by-tryk~~ | Done |
| PROG-F2 | ~~Auto-assign + flåde-UI~~ | Done |
| PROG-F3 | Pris-kurve / sælg bil / cap via level | efter F1 |
| PROG-U1 | ~~Opgrader bil +last~~ | Done |
| PROG-U2 | ~~Unlock hurtig/tung~~ | Done 5 / 10 |
| PROG-U3 | ~~Visuelt + job-match~~ | Done |

## P1 – Spil-følelse

| ID | Forslag | Noter |
|----|---------|--------|
| P1-1 | Soft lyd: ding ved levering, lav vej-lyd | Web Audio, mute-knap |
| P1-2 | Første-gangs tutorial (tegn Nord→Centrum) | Overlay steps |
| P1-3 | Rush hour / peak demand | Periodisk spawn-boost |
| P1-4 | Distrikter vokser (flere jobs / større radius) | PLAN Fase 2 |
| P1-5 | Flere distrikter / større map | → PROG-C3 |
| P1-6 | Gem session (penge, veje, jobs) i localStorage | Ud over highscore |

## P2 – Dybde

| ID | Forslag | Noter |
|----|---------|--------|
| P2-1 | Trafiklys / envejsveje | Valgfrit tool |
| P2-2 | Flere biltyper (bus, hurtigbil) | Kapacitet/fart |
| P2-3 | Station / lager / depot-bygninger | Placering + buff |
| P2-4 | Achievements | localStorage flags |
| P2-5 | Scenarier / niveauer | → PROG-C1/C2 |

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
