# Flowtown

**Cozy browser traffic management game**  
Tegn veje mellem distrikter og hold byen kørende. Fungerer på både mobil og PC.

## Spil

Åbn `index.html` i en browser eller host via GitHub Pages.

### Sådan spiller du
1. Tegn veje med mus eller finger mellem de farvede distrikter.
2. Biler spawner automatisk og forsøger at køre fra et distrikt til et andet.
3. Hvis vejene er for få eller dårligt forbundet, opstår der kødannelse (bilerne sænker farten).
4. Brug **Undo** / **Clear** / **Pause** efter behov.

## Features (MVP)
- Frihånds-tegning af one-way veje (touch + mouse)
- Real-time biler med simpel density-baseret jam
- 5 distrikter
- Responsivt – virker på telefon og desktop
- Ren vanilla JS + Canvas (ingen frameworks)

## Tech
- HTML5 Canvas
- Vanilla JavaScript (ES modules)
- Tailwind CSS (CDN) til UI

## Udvikling
Åbn bare mappen lokalt eller brug en simpel static server:

```bash
npx serve .
```

## Roadmap (kommende)
- Bedre pathfinding / sammenhængende vejnet
- Broer og floder
- Voksende by / nye distrikter
- Score og achievements
- Flere maps
- LocalStorage save

---

Lavet med ❤️ til Flowtown
