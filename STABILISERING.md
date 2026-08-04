# Flowtown – stabilisering (grundlag)

**Mål:** Færre “små fejl”, solid kontrol, kamera, vejtegning.  
**Ikke mål:** Nye features (bots-AI, nye bygninger, osv.) før grundlaget er roligt.

## Principper

1. **Én input-state** ad gangen: `idle` | `pending` | `draw` | `pan` | `pinch`
2. **Kamera** er den eneste kilde til pan/zoom/rotation
3. **Verden** (roads, places, vehicles) røres ikke af input direkte – kun via `game.*`
4. **1–3 fixes** ad gangen; commit + push; test mobil

## Prioriteret bugliste (P0 → P2)

| P | Problem | Status |
|---|---------|--------|
| P0 | Pinch starter vej med 1. finger | Fixed (defer + cancel) |
| P0 | 2. finger må ikke `endStroke` (bygge vej) | Fixed (`cancelDraw`) |
| P0 | Kamera-rotation vs `screenToWorld` | Fixed (matrix) |
| P0 | Input blandet pan/draw/pinch | **Stabiliseres** med state machine |
| P1 | Vej over vej → bro/kryds | Fixed (detektion) – overvåg |
| P1 | Vej-fletning visuelt | Forbedret – overvåg |
| P1 | Cache / gammel SW på mobil | Network-first SW |
| P2 | Bots / pathfinding edge cases | Senere |
| P2 | Flere kryds-valg polish | Senere |

## Input-kontrakt

| State | Start | Tilladt | Exit |
|-------|--------|---------|------|
| `idle` | default | — | finger/mus ned → pending |
| `pending` | touch 1 finger / vent | flyt → draw; 2. finger → pinch; long-press → pan; op → tap | |
| `draw` | bekræftet 1-finger træk | move fortsætter streg; 2. finger → **cancel** streg + pinch | op → commit streg |
| `pan` | long-press / midtknap / space | flyt kamera | op → idle |
| `pinch` | 2 fingre | zoom + drej | alle fingre op → idle (kort lock) |

**Regel:** `pinch` og `draw` må aldrig være sande samtidigt.  
**Regel:** Overgang til pinch **commit’er aldrig** vej.

## Kamera-kontrakt

```
camera = { x, y, zoom, rotation }
setTransform: R(rotation) * S(zoom) + (x,y)
screenToWorld / worldToScreen / centerOnWorld / rotateBy / setZoomAt
```

Fit/reset: `rotation = 0`.

## Test-checkliste (mobil)

- [ ] 1 finger: tegn vej fra A til B
- [ ] 2 fingre: zoom uden at lægge vej
- [ ] 2 fingre: drej uden vej
- [ ] Efter pinch: slip → ingen spøgelses-vej
- [ ] Tap by midt → shop
- [ ] Træk fra by-kant → vej
- [ ] Fit / ↺ ↻ / + − virker
- [ ] Vej over vej → dialog bro/lys

## Næste efter stabilisering

1. Pathfinding + dead-ends  
2. Bots (simpel state machine)  
3. Evt. Pixi kun til rendering (valgfrit)

## Open source (reference, ikke drop-in)

- OpenTTD – design/regler, ikke browser-kode  
- Mini Metro-kloner – simpel rute-UI  
- Phaser/Pixi – kun hvis vi senere splitter rendering  
