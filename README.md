# Flowtown

**Cozy mini Transport Tycoon** i browseren.  
Tegn veje mellem distrikter, transporter personer og gods, tjen penge – og konkurrér eventuelt mod AI-bots.

## Sådan spiller du
1. **Tegn** veje mellem distrikter (hver vej koster penge – prisen vises mens du tegner).
2. Udfør **opgaver**: 👤 personer og 📦 gods fra A → B.
3. Få **belønning** ved levering; brug pengene til flere veje.
4. **Slet** / **Undo** egne veje (delvis refund).
5. **Bots**: slå modstandere til/fra – de bygger veje og kæmper om opgaverne.

## Features (Fase 1)
- Frihånds-tegning + snapping til veje/distrikter
- Personbiler + lastbiler
- Job/demand-system med progress i UI
- Økonomi: startkapital, vejpris, leveringsbelønning, kø-straf
- Bot-modstandere (Axel AI, Nova AI) med toggle
- Density-baseret jam-farve på veje
- localStorage highscore

## Tech
Vanilla JS + Canvas + Tailwind (CDN)

## Kør lokalt
Åbn `index.html` i browseren, eller servér mappen (anbefalet for ES modules):

```bash
npx serve .
# eller: python3 -m http.server 8080
```

## Plan
Se [PLAN.md](./PLAN.md) for roadmap (Fase 2+).

---
Lavet med ❤️
