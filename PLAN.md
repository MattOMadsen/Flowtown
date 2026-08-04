# Flowtown – Udviklingsplan

**Vision:** Et cozy browser-spil i stil med mini Transport Tycoon Deluxe.  
Spilleren tegner veje mellem distrikter, transporterer folk og gods, tjener penge og udvider netværket – alt imens den enkle, frihånds-tegne stil bevares.

---

## Nuværende fundament (Fase 0)

- Frihånds-tegning af veje + endpoint/midpoint snapping
- Biler der kører automatisk
- Density / kø-visualisering (grå → orange → rød)
- Erase-mode, Undo, Clear
- Progressive mål + localStorage highscore
- Touch + mus, responsivt

**Status:** Godt teknisk fundament.

---

## Fase 1 – Mini Transport Tycoon (MVP)

**Mål:** Gør det til et rigtigt spil med mening og motivation.

### Nye features
1. **Passagerer & gods**
   - Hvert distrikt har behov (folk / gods)
   - To biltyper: personbiler + lastbiler

2. **Opgaver / leverancer**
   - Eksempler: “Transportér 8 personer fra Nord → Syd”
   - “Lever 5 kasser gods fra Centrum → Øst”
   - Klare visuelle markører for aktive jobs

3. **Penge / score**
   - Belønning når en bil ankommer korrekt
   - Lille straf hvis biler sidder fast for længe
   - Synlig saldo

4. **Simpel økonomi**
   - Startkapital
   - Hver ny vej koster penge
   - Spilleren skal prioritere hvad der bygges

**Når Fase 1 er færdig**, føles det allerede som et lille Transport Tycoon.

---

## Fase 2 – Udvidelse & dybde

- Flere distrikter / større kort
- Distrikter vokser over tid (flere folk og mere gods)
- Trafiklys eller envejsveje (valgfrit)
- Forskellige biltyper med forskellig hastighed og kapacitet
- “Rush hour”-perioder
- Simple bygninger man kan placere (station, lager, depot)

---

## Fase 3 – Progression & highscore

- Niveauer / scenarier  
  (f.eks. “Forbind de 5 byer”, “Hold flow over 80 % i 3 minutter”)
- All-time highscore + senere leaderboard
- Achievements
- Gem fremskridt (localStorage → eventuelt cloud senere)

---

## Fase 4 – “Deluxe”-følelse (længere ude)

- Flere transportformer (kun hvis det passer stilen)
- Dynamisk vejr / tid på døgnet
- Konkurrence mod AI-byplanlægger
- Multiplayer / delte maps

---

## Anbefalet prioritetsrækkefølge

| Prioritet | Feature                        | Hvorfor                          |
|-----------|--------------------------------|----------------------------------|
| 1         | Passager- + gods-opgaver       | Giver mening til spillet         |
| 2         | Penge/score for leverancer     | Motivation                       |
| 3         | Vej koster penge               | Skaber strategiske valg         |
| 4         | Flere distrikter / større map  | Mere plads til strategi          |
| 5         | Distrikter der vokser          | Langsigtet progression           |

---

## Tekniske noter

Vi bygger ovenpå den nuværende kode. De vigtigste nye systemer bliver:

- **Job / Demand-system** – hvad skal transporteres hvorhen
- **Economy** – penge, omkostninger, belønninger
- Bedre bil-typer + destination-tracking
- UI til aktive opgaver og saldo

Stilen forbliver den samme: frihånds-tegning, tæthedsfarver, cozy look, mobil + PC.

---

## Næste skridt

**Fase 1 (MVP) er på plads** (jobs, penge, veje, bots).  
Fokus er nu **progression + vanedannende loop** – se den levende plan:

→ **[DESIGN-PROGRESSION.md](./DESIGN-PROGRESSION.md)**

Kort: **$ køber**, **XP/level låser op**, **baner med stjerner**, **job-styret trafik**, senere **større map + vand/broer**.  
Implementering i batches af **1–3 ting** (start anbefalet: PROG-A1 job-trafik).

---

*Sidst opdateret: 4. august 2026* – se **IMPROVEMENTS.md** for levende lavet/mangler.
