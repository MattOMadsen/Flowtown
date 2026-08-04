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

### UX / retention (04/08 batch 1·2·4·5)
- [x] **P1-2** Tutorial første gang (3 trin, spring over)
- [x] **P1-1** Soft Web Audio + mute-knap (🔊/🔇)
- [x] **PROG-D3** Jobtyper: ekspres ⚡ + turister 🧳 (+ person/gods)
- [x] **P1-6** Gem session (autosave + “Fortsæt gemt spil”)

### Økonomi + peak + vækst (04/08 F3 / P1-3 / P1-4)
- [x] **PROG-F3** Pris-kurve (kvadratisk), sælg bil (~55%), køb ekstra flåde-slot
- [x] **P1-3** Rush hour (~28s peak / 95s cyklus): flere jobs, større mængder, HUD-badge
- [x] **P1-4** Distrikter vokser (max 8) via leverancer + tid; større radius + job-demand

### Shop + snap + bygninger (04/08 B2 / P0-4 / P2-3)
- [x] **PROG-B2** Global butik (🛒): billigere veje, snap-boost, turist/logistik + bygninger
- [x] **P0-4** Tydelig snap: magnet, guide-linje, label (by/kryds/vej), farve pr. type
- [x] **P2-3** Station / lager / depot på by (demand + assign-bonus), ikoner på kort
- [x] Pan-ned flyttet væk fra minimap (bottom-left, ikke midt på kort)

### Safe-area + trafik + trophies (04/08 P0-5 / P2-1 / P2-4)
- [x] **P0-5** `viewport-fit=cover`, safe-area CSS-vars, zoom/pan/HUD/sheets respekterer notch/home
- [x] **P2-1** Envejs (➡️ cycle) + trafiklys (🚦) med bil-respekt og gem i session
- [x] **P2-4** Achievements (🏆): 15 badges, XP + toast, localStorage

### UI + bots + vejr + end (04/08)
- [x] Minimap **venstre-bund**, pan-ned **midt-bund**, zoom **2×2** højre
- [x] **P3-2** Stærkere bot-AI (job-steal, haste, motorvej, aggression)
- [x] **P3-1** Dag/nat + regn/tåge (overlay, fart, HUD)
- [x] End-of-run panel (stats, næste bane) + “tryk by”-hint første minut

---

### Leaderboard + minimap-by (04/08 P3-3 + polish)
- [x] **P3-3** Lokal topscore (🏅): navn, pr. bane / global, kopiér score – cloud-klar API
- [x] **Minimap tap→by** Hop til sted ved prik + toast med navn

---

### Cloud + bus/van (04/08)
- [x] Zoom-grid: **−** hvor Fit før stod (`+ Fit / − %`)
- [x] Grøn by-hint **over** pan-ned (midt-bund)
- [x] **P3-4** Cloud topscore via JSONBlob-kode + pakke import/export
- [x] **Bus** 🚌 (unlock 15) + **varebil** 🚐 (unlock 8) + sprites

---

## Forslag (levende backlog – 2026-08-04)

Prioritet: **A** (hurtig spil-værdi) → **F** (senere deluxe).  
Batch-plan: **1** flaskehals + mere-menu · **2** baner/flow/bygninger · **3** PWA + dagligt mål + end-run.

### A – Høj værdi
| ID | Forslag | Anbefaling | Status |
|----|---------|------------|--------|
| IMP-A1 | Daglige/ugentlige mini-mål | Ja | Mangler |
| IMP-A2 | Flaskehals-feedback (glød, toast, hint) | Ja | ~~Done~~ Batch 1 |
| IMP-A3 | Flere baner med personlighed | Ja | ~~Done~~ Ø-broerne + Nat-rush |
| IMP-A4 | Flow-score som stjerne/mål | Hybrid | ~~Done~~ `flow` goal + hold-timer |
| IMP-A5 | Synligere by-bygninger (effekt i UI) | Ja polish | ~~Done~~ by-sheet panel |

### B – Retention
| ID | Forslag | Anbefaling | Status |
|----|---------|------------|--------|
| IMP-B1 | Daglig login-bonus (blød) | Ja | Mangler |
| IMP-B2 | Flere unlock-milestones | Ja | Mangler |
| IMP-B3 | Freeplay + valgfri challenges | Ja (efter baner) | Mangler |
| IMP-B4 | End-of-run: XP, unlock, del-score | Ja | Delvist |

### C – Trafik / TT
| ID | Forslag | Anbefaling | Status |
|----|---------|------------|--------|
| IMP-C1 | Connected-status (online-ring) | Ja | Delvist |
| IMP-C2 | Rute-preview ved job-assign | Hybrid | Mangler |
| IMP-C3 | Vej-slid | Nej (nu) | Parkeret |
| IMP-C4 | Depot-spawn kun fra hub | Ja hvis spawn mærkelig | Delvist |

### D – UI / mobil
| ID | Forslag | Anbefaling | Status |
|----|---------|------------|--------|
| IMP-D1 | Tool-overflow / mere-menu | Ja | ~~Done~~ Batch 1 |
| IMP-D2 | By-tap: info vs shop | Hybrid | Mangler |
| IMP-D3 | Minimap-hint første gang | Ja | Delvist (by-tap findes) |
| IMP-D4 | Mere cozy ambient-lyd | Ja lille batch | Delvist mute |

### E – Teknik
| ID | Forslag | Anbefaling | Status |
|----|---------|------------|--------|
| T-1–T-5 | Tests, cull, graph-cache, a11y | Ja før store refactors | Mangler |
| PWA | Install + offline | Ja før multiplayer | Mangler |

### F – Deluxe (senere)
| ID | Forslag | Anbefaling |
|----|---------|------------|
| MP | Live multiplayer | Senere (cloud-kode dækker deling nu) |
| RAIL | Tog/sporvogn | Hybrid – ét high-level unlock |
| WXJOB | Vejr påvirker jobmix | Ja lille |
| ACH2 | Flere achievements | Ja |

### Batch-rækkefølge (anbefalet)
1. ~~**IMP-A2 + IMP-D1**~~ flaskehals + mere-menu **DONE 2026-08-04**  
2. ~~**IMP-A3 + A4 + A5**~~ baner, flow-stjerne, bygning-UI **DONE**  
3. **PWA + IMP-A1 + IMP-B4** – app-følelse + habit + end-run  

---

## Mangler / næste (anbefalet rækkefølge)

| Pri | ID | Forslag | Noter |
|-----|-----|---------|--------|
| 1 | **PWA + IMP-A1 + B4** | Install, dagligt mål, end-run | Batch 3 |
| 2 | **T-1–T-5** | Tests, cull, a11y | Kvalitet |
| 3 | **Ægte multiplayer** | Live session / server | Backend |

---

## P0 – Hurtige wins

| ID | Forslag | Noter |
|----|---------|--------|
| P0-1 | ~~Kompakt/foldbar opgaveliste~~ | Done |
| P0-2 | ~~Minimap + fit all~~ | Done (+ viewport-fix 04/08) |
| P0-3 | ~~Bedre pathfinding~~ | Done – kan altid finpudses |
| P0-4 | ~~Tydeligere snap-feedback~~ | Done 2026-08-04 |
| P0-5 | ~~Safe-area padding~~ | Done 2026-08-04 |

## P0+ – Spil-kerne (se DESIGN-PROGRESSION.md)

| ID | Forslag | Noter |
|----|---------|--------|
| PROG-A1–A2 | ~~Job-trafik + bil-fix~~ | Done |
| PROG-A3 | By-hubs + snap + connected | Delvist i game.js |
| PROG-B1 | ~~XP + level~~ | Done |
| PROG-B2 | ~~Global shop~~ | Done 2026-08-04 – 🛒 butik |
| PROG-B3 | ~~2-spor~~ | Done |
| PROG-C1 | ~~Baner + stjerner~~ | Done |
| PROG-C2 | End-of-run polish | Delvist |
| PROG-D3 | ~~Ekspres + turist jobs~~ | Done 2026-08-04 |
| PROG-F3 | ~~Pris-kurve / sælg / cap~~ | Done 2026-08-04 |
| PROG-U1–U3 | ~~Opgrader + unlock + match~~ | Done |

## P1 – Spil-følelse

| ID | Status | Noter |
|----|--------|--------|
| P1-1 | ~~Lyd + mute~~ | Done 2026-08-04 |
| P1-2 | ~~Tutorial~~ | Done 2026-08-04 |
| P1-3 | ~~Rush hour~~ | Done 2026-08-04 – ~28s peak / 95s cyklus |
| P1-4 | ~~Distrikter vokser~~ | Done 2026-08-04 – leverancer + tid, max 8 |
| P1-5 | Større map | Delvist via M1/MAP2 |
| P1-6 | ~~Gem session~~ | Done 2026-08-04 |

## P2 / P3 / Teknik

Se tidligere tabeller: trafiklys, bygninger, achievements, vejr, bot-AI, multiplayer, tests, PWA – **ikke startet** medmindre noteret ovenfor.

---

## Sådan bruger du listen

1. Vælg ID (fx `P1-2`).
2. Implementér fokuseret (1–3 ting pr. batch).
3. Flyt til **Lavet** med dato.
4. Opdater `AGENTS.md` hvis der opstod en ny “lært fejl”.
