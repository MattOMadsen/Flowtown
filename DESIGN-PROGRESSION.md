# Flowtown – vanedannende progression (designplan)

**Status:** Levende plan – ideer lander her; implementering i batches af **1–3 ting** efter værdi  
**Sidst opdateret:** 2026-08-04 – se også IMPROVEMENTS.md “Forslag (levende backlog)”  
**Mål:** Cozy mini Transport Tycoon med *to valutaer*, levels/baner, meningsfuld trafik, større verdener – uden at miste frihånds-identitet.

### Arbejdsgang (aftalt med dig)

1. **Du** kommer med ideer/forslag.  
2. **Jeg** lægger dem ind i denne plan (+ `IMPROVEMENTS.md` ID’er).  
3. Vi **udfører 1–3 ting ad gangen**, valgt efter: spiller-værdi → afhængigheder → risiko.  
4. Efter batch: tydelig status; evt. commit/push når du beder om det.

---

## 1. Hvad der er “broken” / mangler i oplevelsen i dag

| Problem | Effekt | Prioritet |
|---------|--------|-----------|
| Biler kører også uden job / i “forkerte” retninger | Støj, meningsløs trafik | **P0 – spil-følelse** |
| Biler hakker ved vejender / dårlig reverse | Frustration | **P0 – teknisk** |
| Svag “forbindelse” til byer (kun soft snap) | Netværket føles løst | **P0** |
| Kun $ + score, ingen XP/level/shop | Lav “én runde mere” | **P1** |
| Én sandbox-map, ingen baner/stjerner | Ingen klar progression | **P1** |
| Lille map, få jobtyper, intet vand | Hurtigt “færdig” | **P1–P2** |
| Enkeltsporede veje | Kø, flaskehalse uden upgrade-loop | **P1** (efter P0-fix) |

**Princip:** Først få *flow* (meningsfuld trafik + by-forbindelse). Derefter *loop* (XP/penge/baner). Vanedannende spil = “kort session → belønning → næste mål”.

---

## 2. Anbefalet kerne-loop (den mest vanedannende model)

Inspireret af: Mini Metro (klarhed), Pocket Trains/Transport Tycoon lite (netværk), mobile city-builders (session + stars), men **simpelt** nok til browser + mobil.

### To valutaer med *forskellige job* (aldrig samme shop)

| Valuta | Navn i UI | Du får det for | Du bruger det til |
|--------|-----------|----------------|-------------------|
| **Penge ($)** | Penge | Leverancer, bonus-mål, (lidt) idle fra netværk | Bygge/opgradere veje, købe flåde, midlertidige buffs |
| **XP → Level** | Netværks-XP / Level | Færdige jobs, stjerner, “første forbindelse”, flow-bonus | **Låse op** (ikke købe 1:1) – nye baner, vejtyper, biltyper, shop-slots |

**Score** (highscore) forbliver en *rekord* (ego/leaderboard), ikke en tredje shop-valuta.

### Session-loop (2–8 minutter)

```
Vælg bane → tegn forbindelser → udfør 2–4 jobs
→ stjerner + $ + XP → level-up toast
→ unlock eller shop-køb → “Næste bane” / “Én runde mere”
```

### Hvorfor det er vanedannende

1. **Klare mini-mål** hver bane (3 stjerner) – “bare én stjerne mere”.  
2. **Permanent meta** (level + unlocks) – fremskridt forsvinder ikke.  
3. **Kort feedback** (ding, float +$, XP-bar fyldes).  
4. **Soft fail** – du taber ikke; du får færre stjerner.  
5. **Valg** i shop (hvad opgraderer jeg?) – agency.  
6. **Nye baner** med friske layouts/navne – novelty uden nyt engine.

### Hvad vi *ikke* gør (bevidst)

- Ingen lootboxes / pay-to-win.  
- Ingen tre valutaer (guld/gems/energy) der forvirrer.  
- Ingen “tog” i første meta-fase (for stort scope) – **bus/lastbil-opgraderinger først**, sporvogn/tog som sen unlock.  
- Ikke tvinge dobbeltspor som eneste løsning før reverse/spawn er fixed.

---

## 3. Byer: navne, design, forbindelse

### 3.1 Random (men faste pr. bane) navne

- Navneliste: cozy dansk/skandinavisk stil, f.eks. *Birkehøj, Havnsund, Mølleby, Granlund, Solkær, Fiskerup, Engsted, Klintborg*…  
- Seed pr. bane + slot, så **samme bane = samme navne** (genkendelse).  
- Internt: `id: "d0"`, display `name`, type `residential | harbor | farm | industry | capital`.

### 3.2 Bedre by-design (stadig 2D cozy, ikke 3D)

Hver by tegnes som lille “blob-by”:

- Base-plade (farve efter type)  
- 3–6 simple bygninger (rektangler/tag-trekanter) i silhuet  
- Ikon-ring: 🏠 havn ⚓ gård 🌾 fabrik 🏭 hovedstad ⭐  
- **Hub-punkt** (tydelig vejport) – veje snapper hertil, ikke vilkårligt på randen  
- Navneskilt under byen (ikke midt i bygninger)

### 3.3 Bedre *conect* (forbindelse)

| Feature | Beskrivelse |
|---------|-------------|
| **Hub snap** | Vejende skal lande på byens port-node (stærk magnet) |
| **Connected-flag** | By er “online” når mindst én spiller-vej rører hub inden for radius |
| **Visual link** | Tynd stiplet “service-line” hub → nærmeste vej indtil connected; så solid |
| **Connection bonus** | Første gang by A–B er path-forbundet: engangs XP + toast |
| **Spawn kun fra connected hubs** | Biler starter på hub + første vejsegment (stopper “start i dødvinkel”) |

Det løser både “svag connection” og en del af spawn-hakning.

---

## 4. Trafik: hakning + dobbeltspor

### 4.1 P0 – Fix hakning (før nye features)

Rodårsager (nuværende kode):

- Skift af `progress` 0↔1 uden smooth handoff  
- Spawn på distrikt-center i stedet for road-point  
- Reverse flip der “snapper”  
- Manglende junction-graph (kun heuristik)

**Fixes:**

1. Spawn altid på `closestPoint` på vej nær hub, `progress` inde i (0.02–0.98).  
2. Ved road-switch: kort **lerp** (0.08–0.12 s) position/vinkel.  
3. Junction graph: endpoints inden for snap-distance = node; biler vælger edge.  
4. Aldrig sæt progress til præcis 0 eller 1 undtagen ved leave-node.  
5. “End of road”: find next *eller* U-turn med animation, ikke teleport.

### 4.2 Dobbeltspor – anbefalet model

**Ikke** to separate frihånds-streger (for svært at tegne).

**I stedet: vej har `lanes: 1 | 2`**

| lanes | Adfærd | Visual |
|-------|--------|--------|
| 1 (start) | Logisk tovejs, men smal kapacitet, mere kø | Én asfalt + midterstribe |
| 2 (upgrade $) | To virtuelle baner (modsat retning), mindre collision | Bredere, dobbelt midterlinje, pile begge veje |

- Opgradering: tryk på vej i “Opgrader”-mode eller shop “2-sporet kit”.  
- Senere (level): motorvej `lanes: 3` / højere hastighed.

Det er vanedannende: du *ser* flaskehalse → bruger $ på upgrade → flow stiger → flere jobs → mere XP.

---

## 5. Progression: Level, shop, baner

### 5.1 Level-kurve (meta)

- XP fra: job complete, stjerner, first-link, “flow > X% i 30s”, daglig bonus (senere).  
- Level 1→10 hurtigt, derefter langsommere (klassisk).  
- Hvert level: **1 unlock** + toast + evt. lille $ bonus.

**Eksempel unlocks (tidlig):**

| Level | Unlock |
|-------|--------|
| 1 | Sandbox intro-bane |
| 2 | Lastbil (gods) – hvis ikke allerede |
| 3 | Shop åben |
| 4 | Vej-opgradering 2-spor |
| 5 | Bane 2 “Kyststrækningen” |
| 6 | Hurtigere personbil |
| 7 | Bus (højere passager-kapacitet) |
| 8 | Bane 3 |
| 9 | Depot (spawn-buff nær by) |
| 10 | Bane “Storby” + bots i campaign |

### 5.2 Shop (kun for $ – det der er unlocked)

Kategorier:

- **Flåde:** +1 bil-slot, hurtigere bil, lastbil, bus  
- **Infrastruktur:** 2-spor kit, billigere veje (10%), snap-booster  
- **By:** “Turistbureau” (flere passager-jobs), “Lager” (flere gods-jobs)  
- **Senere:** sporvogn/tog (kræver high level + “skinner”-tool)

**Regel:** XP/level *låser op*; $ *køber mængde/styrke*. Det er det klassiske sunde split.

### 5.3 Baner (campaign)

Hver bane er en **scenario-definition** (JSON-lignende i JS):

```text
{
  id, name, seed,
  districts: [{rx,ry,rr,type}],
  startMoney, goals: [
    { type: 'deliver', amount: 15, stars: 1 },
    { type: 'connect_all', stars: 1 },
    { type: 'money', amount: 800, stars: 1 }
  ],
  unlockLevel, nextId
}
```

- **Menu:** kort-vælger med stjerner (0–3), lock-icon hvis level for lavt.  
- **Win:** 1+ stjerne → “Videre” + XP; 3 stjerner → bonus XP.  
- **Freeplay:** unlock’es efter bane 1 – uendelig sandbox med meta-unlocks.  
- **Persist:** `localStorage`: level, xp, unlocks, owned items, stars per map.

### 5.4 Mål der føles godt (ikke grindy)

Per bane, max 3 stjerner, mix af:

1. Lever X enheder  
2. Forbind alle byer  
3. Hold flow ≥ 70% i N sekunder **eller** tjen $Y  

Korte baner (3–6 byer) først; større maps senere.

---

## 6. Implementeringsfaser (1–3 ting pr. batch)

Hver **batch** = 1–3 konkrete leverancer. Rækkefølge kan finjusteres, men afhængigheder respekteres.

### Fase A – “Trafik der giver mening” (første batch-kandidater)

| Batch | Indhold (max 3) | Værdi |
|-------|-----------------|--------|
| **A1** | ~~Job-styret spawn~~ **DONE** | Ingen free-roam; cap pr. job; despawn jobless/stuck |
| **A2** | ~~Fix hakning~~ **DONE** | Spawn på vej + retning, blend 0.1s, clamp t, U-turn blend |
| **A3** | By-hubs + stærkere snap + “connected”; seedede bynavne | Netværk føles rigtigt |

**Succes A:** næsten alle biler er “på vej med last”; færre stuck; byer er steder man kobler på.

### Fase B – “Meta: XP + penge der begge bruges”

| Batch | Indhold | Værdi |
|-------|---------|--------|
| **B1** | ~~XP-bar, level, localStorage~~ **DONE** | meta.js + UI; XP ved levering/job/first-link |
| **B2** | ~~Shop (bottom sheet)~~ **DONE** – 🛒 buffs + bygninger | Penge får mere formål |
| **B3** | 2-spor vej-opgradering ($ + unlock) | Klassisk flaskehals→upgrade loop |

**Succes B:** efter ~5 min har man level’et og købt mindst én ting.

### Fase C – “Baner & stjerner”

| Batch | Indhold | Værdi |
|-------|---------|--------|
| **C1** | `scenarios.js`: 3 baner + freeplay; 3-stjerne goals | Klar “næste mål” |
| **C2** | Map-select + end-of-run panel; unlock via level/stjerner | Campaign-følelse |
| **C3** | Større world bounds + 1–2 ekstra byer på senere baner | Mere plads til strategi |

**Succes C:** “Næste bane” er det naturlige tryk efter en run.

### Fase D – “Verden: vand, broer, jobtyper”

| Batch | Indhold | Værdi |
|-------|---------|--------|
| **D1** | Vand-lag (polygons/sø/kyst) + collision: normal vej må ikke gennem vand | Layout-identitet |
| **D2** | Bro-tool / bro-segment (dyrere $): tillader krydsning; visuelt dæk + piller | Strategisk valg |
| **D3** | Flere jobtyper (fx ekspres, turister, farligt gods) med unlock | Variation |

**Succes D:** mindst én bane hvor bro er *nødvendig eller meget stærk* for 3 stjerner.

### Fase E – “Habit polish” (valgfri)

1. Soft SFX + mute.  
2. Daily mini-mål.  
3. Achievements.  
4. Bus / senere sporvogn.  
5. Stærkere bots i campaign.  

---

## 7. Tekniske berøringspunkter (eksisterende kode)

| Område | Filer |
|--------|--------|
| Byer / draw / snap | `js/game.js` |
| Bil-bevægelse | `js/vehicle.js` |
| Veje visual/lanes | `js/road.js` |
| Jobs | `js/jobs.js` |
| UI / shop / map select | `index.html`, `js/main.js`, `style.css` |
| Persist meta | ny `js/meta.js` eller `js/progress.js` |
| Scenarios | ny `js/scenarios.js` |
| Navne | ny `js/names.js` |
| Docs | `PLAN.md`, `IMPROVEMENTS.md`, `AGENTS.md` |

**Ikke** omskriv hele engine – lag progression ovenpå Fase 1.

---

## 8. UI-skitser (sikkert ift. distrikter)

- **XP-bar:** tynd under top-bar (fuld bredde), ikke over byer.  
- **Shop-knap:** ved zoom-kolonnen (højre).  
- **Map select / end run:** fuld overlay (som nuværende help).  
- **Jobs:** forbliver foldbar midt-top; collapsed default på mobil.  
- Følg `AGENTS.md` safe-zones (Nord/Vest/Øst/Syd).

---

## 9. Metrics for “virker det?”

- Gennemsnitlig tid til første level-up < 3 min.  
- ≥ 50% af runs køber mindst 1 shop-item.  
- Spillere åbner bane 2 inden for første session.  
- Færre “stuck” biler (idleTime) efter Fase A.  

(Kan logges soft i `localStorage` counters til dig selv.)

---

## 10. Anbefalet beslutning (summary)

| Valg | Anbefaling |
|------|------------|
| Penge vs XP | **$ = køb / byg**; **XP/level = unlock** (aldrig samme shop) |
| Baner | 3-stjerne scenarios + freeplay; videre via stjerner/level |
| Trafik | Primært **job-drevet**; ingen meningsløs tomkørsel |
| Map | Større world + flere byer over baner; **vand + broer** i Fase D |
| Dobbeltspor | Opgradering for $, ikke default |
| Tog | Sen unlock, ikke A–C |
| Første kode | **A1** (job-trafik) → **A2** (hakning) → **B1** (XP) – højst 1–3 pr. session |

---

## 11. Idé-inbox (nye forslag lander her)

| Dato | Idé | Status | Foreslået batch |
|------|-----|--------|-----------------|
| 2026-08-03 | Point/XP + penge begge skal bruges (level + shop) | **B1 done**, shop B2 | B1–B2 |
| 2026-08-03 | Flere baner; videre ved mål/XP | I plan | C1–C2 |
| 2026-08-03 | Biler skal ikke køre hvor der ikke er opgaver | **Done A1** | A1 |
| 2026-08-03 | Større map, flere opgaver/typer | I plan | C3, D3 |
| 2026-08-03 | Vand + broer | I plan | D1–D2 |
| 2026-08-03 | Køb biler i stedet for auto-spawn; tryk på by → køb 1 bil | **F1+F2 done** | F1–F2 |
| 2026-08-03 | Opgrader biler (læs/fart); unlock bedre biltyper efter X opgraderinger; variation | U1–U3 done | U1–U3 |
| 2026-08-04 | Større map, længere mellem byer; fabrik/landbrug/havn; realistiske navne | **M1 done** (batch) | **M1** |
| 2026-08-04 | C1 baner + meget bedre kort/verden-design | **C1 + VIS1 done** | C1 |
| 2026-08-04 | Design: zoom, intet tomt land, sprites, rigtigt playable board | **VIS3 done** | VIS3 |
| 2026-08-04 | Pænere tile-map / ground assets | **VIS4 done** | VIS4 |
| — | *(næste forslag fra dig)* | — | — |

---

## 15. Større map & TTD-steder (M1)

### Anbefaling
- **Ja** til større world + flere stedtyper (by, landbrug, fabrik, havn, hovedby).
- **Navne:** danske/skandinaviske pools, seed-faste (genkendelse).
- **Jobs:** kæder farm→fabrik→havn/by, passagerer by↔hovedby (ikke random Nord→Syd).
- **Mobil:** Fit/pan/zoom (findes); lavere minZoom; labels under hub; undgå flere permanente HUD-hjørner.

### Batch M1 (denne leverance)
- World ~1.95× viewport, 8 steder, silhuetter, typed jobs, realistiske navne.

---

## 13. Flåde: købte biler (TT-følelse uden mobil-helvede)

### Problem med auto-spawn i dag
Mange biler “kommer af sig selv” → trafikstøj, mindre ejerskab, mindre TT-agtigt.

### Anbefalet model (hybrid der føles som Deluxe, spiller på mobil)

| Princip | Valg |
|---------|------|
| **Ejerskab** | Du **køber** biler for $ (ikke uendelig auto-spawn) |
| **Stationering** | Køb sker i en **by** (depot) – bilen hører til der |
| **Opgaver** | Aktive jobs assignes til ledige biler (auto: “nærmeste ledige”) |
| **Mobil** | **Tryk by → lille sheet** “+👤 bil $X / +📦 lastbil $Y” – 1–2 tryk, ikke micro-management pr. tur |
| **Cap** | Start f.eks. **2 bil-slots**; flere slots via $ eller level-unlock (B1/B2) |
| **Ikke** | Tving “vælg rute for hver bil hver gang” (det bliver træls på mobil) |

### Loop (vanedannende + TT-light)
```
Tjen $ på jobs → tryk by → køb bil → bil kører selv til job fra den by
→ flaskehals? køb flere / anden by → senere 2-spor / bus
```

### Hvad vi *bevidst* undgår på mobil
- Trække bil manuelt hver gang  
- 10 menuer dybt  
- At man *skal* styre hver bil for at tjene  

**TT Deluxe-kerne vi beholder:** dit netværk + din flåde + økonomi.  
**Mobil-kerne:** tegn veje, køb flåde, se jobs køre – auto-assign.

### UX-skitse
1. Tap by → panel: navn, “Ledige biler: 1”, knapper **Køb personbil**, **Køb lastbil** (priser stiger mildt pr. bil i flåden).  
2. Top/stats: `Flåde 3/6` (ejede / cap).  
3. Fjern (eller slå næsten helt fra) player auto-`spawnVehicle` uden ejerskab.  
4. Bots kan beholde simpel auto-flåde (AI “køber” soft) så de ikke snyder.

### Implementeringsbatch
| Batch | Indhold |
|-------|---------|
| **F1** | ~~DONE~~ Flåde-state, by-tap køb, stop player auto-spawn |
| **F2** | ~~DONE~~ Auto-assign + bottom sheet + flåde i stats |
| **F3** | ~~DONE~~ Pris-kurve + sælg bil + køb flåde-slot |

**Prioritet ift. B2 shop:** F1 kan *erstatte* “+1 bil i shop” midlertidigt – shop bliver opgraderinger (fart, cap, 2-spor), by-tap er hvor flåden vokser.

### Anbefalet rækkefølge nu
1. ~~**F1+F2**~~ done  
2. **U1** bil-klasser + opgrader last (by-sheet) – retention uden kedelig grind  
3. ~~**B3** 2-spor~~ done  
4. C baner, D vand/broer, B2 global shop hvis stadig behov 

---

## 14. Bil-opgraderinger & klasser (retention uden kedsomhed)

### Mål
Længere spilletid via **valg** (fart vs last vs specialisering), ikke kun “køb bil #12 der er ens”.

### Anbefalet model (mobil-first)

| Princip | Valg |
|---------|------|
| **Klasser** | 2–3 linjer: **Hurtig** (lidt last), **Standard**, **Tung** (meget last, langsom) – både person- og gods-variant |
| **Opgrader pr. bil** | Tryk bil *eller* by-sheet “Mine biler” → **+Last** / **+Fart** (koster $) |
| **Soft soft-cap pr. bil** | Max 3–4 ranks pr. bil, så man ikke grinder én bil uendeligt |
| **Tier-unlock** | Efter **X totale opgraderinger** (meta, fx 5) → unlock **næste bilklasse** i købsmenuen |
| **Ikke** | Separate stats-skærme i 5 lag; ikke “equip gear” som idle RPG |

### Hvorfor det ikke bliver ensformet
1. **Tradeoff:** hurtig bil tømmer små jobs; tung bil er bedre til store gods-jobs.  
2. **Unlock-rytme:** ny biltype ca. hvert 5–8 opgraderinger → “snart noget nyt”.  
3. **By-specialisering:** hurtige biler i Centrum, lastbiler ved industri (senere).  
4. **Jobs matcher klasser** (allerede 👤/📦) – senere ekspres-jobs der belønner fart.

### Mobil-UX
- By-sheet udvides: fane **Køb** | **Opgrader** (liste max 4–5 biler “her” / “alle”, store knapper).  
- Opgrader = **ét tryk** “+1 last $N” med tydelig før/efter (1→2 enheder).  
- Ingen drag-and-drop inventory.

### Progression (eksempel)
| Meta | Unlock |
|------|--------|
| Start | Standard bil + standard lastbil |
| 5 opgraderinger | Hurtig bil (lav last, høj fart) |
| 10 | Tung lastbil (høj last) |
| 15 | Bus / ekspres (senere) |
| Level (B1) | Flåde-cap (allerede) |

**$ = opgrader/køb**, **XP/level = cap + evt. tidlig tier** – hold split rent.

### Batches
| ID | Indhold |
|----|---------|
| **U1** | ~~DONE~~ upgradeRank +last, by-sheet fane Opgrader |
| **U2** | ~~DONE~~ totalUpgrades meta; hurtig@5, tung@10 |
| **U3** | ~~DONE~~ stripe/ring/pips + classFit i assign |

### Mobil-risiko
- For mange knapper i sheet → **faner**, collapsed default.  
- For stærk tung bil → alle køber kun den → balance: jobs med tidsbonus / small passenger jobs.

---

## 12. Næste skridt (2026-08-04)

**Batch 1:** ~~IMP-A2 + IMP-D1~~ done.  
**Batch 2:** ~~A3 baner + A4 flow-mål + A5 bygning-UI~~ done.  
**Batch 3:** ~~PWA + dagligt mini-mål + end-run polish~~ done.

Fuld ID-liste: [IMPROVEMENTS.md](./IMPROVEMENTS.md) § Forslag.
