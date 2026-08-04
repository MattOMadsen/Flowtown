# Flowtown – forbedringsforslag (backlog)

Status opdateres når noget laves. Prioritet: **P0** (hurtigt/højt) → **P3** (senere).  
**Sidst opdateret:** 2026-08-04

## Lavet (session 2026-08)

### Kerne & progression
- [x] Fase 1: jobs, økonomi, bots, biltyper
- [x] **PROG-A1/A2** Job-styret spawn + pathfinding-fix
- [x] **PROG-B1** XP + level + localStorage meta
- [x] **PROG-F1/F2** Køb bil via by-tryk + auto-assign flåde
- [x] **PROG-U1–U3** Opgrader last, unlock klasser, job-match
- [x] **PROG-C1** Baner + 3 stjerner + map-select
- [x] **PROG-M1/MAP2** Større map, stedtyper, kyst
- [x] **PROG-B3/ROAD2** 2-spor / motorvej + tovejs standard
- [x] **PROG-D1/D2/WATER2** Vand, broer, organiske søer
- [x] **PROG-INDUSTRY** Fabrik→havn/by job-kæder

### Kort, kamera, art
- [x] Zoom (knapper, hjul, pinch) + pan (long-press, pile, pinch)
- [x] Fit-all / start-zoom + playable board bounds
- [x] **PROG-VIS1–5** Terrain, tiles, steder, dybde/lys
- [x] **PROG-ART-VEH / ART2 / ART-CAP** Sted- + bil-sprites (inkl. refresh 04/08)
- [x] **PROG-MINIMAP / MINIMAP2 / MINIMAP3** Minimap worldW/H, mobil-skala, **viewport matcher kamera** (04/08)
- [x] Seamless tile-map + asfalt-tekstur på veje

### UI / UX
- [x] Jobs væk fra Nord/Vest; foldbare missioner
- [x] **PROG-HUD / HUD2 / UI-POLISH** Top-HUD: status → tools → missioner
- [x] **PROG-HUD3** Stats i top (ingen bund-bar); mission-dropdown; kompakt status-række (04/08)
- [x] **FIX-CITY-TAP** By-tap shop: større hit + long-press stjæler ikke (04/08)
- [x] Undo fuld refund, slet vejstykke, hex-hjælp, vej fra by
- [x] AGENTS.md + denne backlog + `.gitignore` for `data/`

### Balance (04/08)
- [x] Mere startpenge (~1400–1600), billigere veje/broer, mildere stuck-bøde
- [x] Lettere stjernemål i intro/coast/valley

---

## Mangler / næste (anbefalet rækkefølge)

| Pri | ID | Forslag | Noter |
|-----|-----|---------|--------|
| 1 | **P1-2** | Kort tutorial første gang | “Tegn vej → tryk by → køb bil” |
| 2 | **P1-1** | Soft lyd + mute | Ding ved levering, lav UI-klik |
| 3 | **PROG-F3** | Pris-kurve / sælg bil / flåde-cap | Efter F1 – balance-dybde |
| 4 | **PROG-D3** | Flere jobtyper (ekspres, turist) | jobs.js |
| 5 | **P1-6** | Gem session (veje, penge, jobs) | Ud over meta/highscore |
| 6 | **P1-3** | Rush hour / peak demand | Periodisk spawn-boost |
| 7 | **P1-4** | Distrikter vokser | PLAN Fase 2 |
| 8 | **P0-4** | Tydeligere snap-feedback | Delvist glød – kan styrkes |
| 9 | **P0-5** | Safe-area polish (notch/home) | Delvist `env(safe-area-*)` |
| 10 | **PROG-B2** | Global shop (infra unlock via level) | By-sheet dækker flåde i dag |
| 11 | **P2-1** | Trafiklys / envejsveje | Valgfrit tool |
| 12 | **P2-3** | Station / lager / depot | Placering + buff |
| 13 | **P2-4** | Achievements | localStorage flags |
| 14 | **P3-2** | Stærkere bot-AI | bot.js |
| 15 | **P3-1** | Vejr / tid på døgnet | Visuelt deluxe |
| 16 | **P3-3/4** | Multiplayer / leaderboard | Kræver backend |
| 17 | **T-1–T-5** | Tests, cull, graph-cache, a11y, PWA | Kvalitet |

### Hurtige polish der stadig kan give værdi
- [ ] Tydelig “tryk by for at købe”-hint første minut
- [ ] End-of-run screen mere celebratory (stjerner + XP)
- [ ] Minimap: valgfri “gå til by” ved tryk på prik
- [ ] Flere bil-/sted-varianter (bus, depot-sprite)

---

## P0 – Hurtige wins

| ID | Forslag | Noter |
|----|---------|--------|
| P0-1 | ~~Kompakt/foldbar opgaveliste~~ | Done |
| P0-2 | ~~Minimap + fit all~~ | Done (+ viewport-fix 04/08) |
| P0-3 | ~~Bedre pathfinding~~ | Done – kan altid finpudses |
| P0-4 | Tydeligere snap-feedback | Delvist via snap-glow |
| P0-5 | Safe-area padding | Delvist `env(safe-area-inset-*)` |

## P0+ – Spil-kerne (se DESIGN-PROGRESSION.md)

| ID | Forslag | Noter |
|----|---------|--------|
| PROG-A1–A2 | ~~Job-trafik + bil-fix~~ | Done |
| PROG-A3 | By-hubs + snap + connected | Delvist i game.js |
| PROG-B1 | ~~XP + level~~ | Done |
| PROG-B2 | Global shop (level-unlock infra) | Mangler – flåde er by-sheet |
| PROG-B3 | ~~2-spor~~ | Done |
| PROG-C1 | ~~Baner + stjerner~~ | Done |
| PROG-C2 | End-of-run polish | Delvist |
| PROG-D3 | Flere jobtyper | Mangler |
| PROG-F3 | Pris-kurve / sælg / cap | Mangler |
| PROG-U1–U3 | ~~Opgrader + unlock + match~~ | Done |

## P1 – Spil-følelse

| ID | Status | Noter |
|----|--------|--------|
| P1-1 | Lyd + mute | Mangler |
| P1-2 | Tutorial | Mangler – **anbefalet næste** |
| P1-3 | Rush hour | Mangler |
| P1-4 | Distrikter vokser | Mangler |
| P1-5 | Større map | Delvist via M1/MAP2 |
| P1-6 | Gem session | Mangler |

## P2 / P3 / Teknik

Se tidligere tabeller: trafiklys, bygninger, achievements, vejr, bot-AI, multiplayer, tests, PWA – **ikke startet** medmindre noteret ovenfor.

---

## Sådan bruger du listen

1. Vælg ID (fx `P1-2`).
2. Implementér fokuseret (1–3 ting pr. batch).
3. Flyt til **Lavet** med dato.
4. Opdater `AGENTS.md` hvis der opstod en ny “lært fejl”.
