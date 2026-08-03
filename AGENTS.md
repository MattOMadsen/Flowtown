# Flowtown – agentregler

Læs denne fil før du ændrer spillet. Målet er cozy mini Transport Tycoon i browseren (vanilla JS + canvas).

## Workflow (obligatorisk)

1. **Dansk** til brugeren medmindre de skriver på andet sprog.
2. Når arbejde er **færdigt**: sig det tydeligt (status + hvad der ændrede sig).
3. Når brugeren beder om **push** / “på GitHub”: **commit + push** og bekræft med commit-hash + repo-URL.
4. **Commit ikke** `data/` (live-scratch / composer) – se `.gitignore`.
5. Efter større UI-ændringer: kør mindst `node --check` på berørte JS-filer.
6. Brug **`/check-work`** eller en review-agent efter større features, når brugeren beder om det eller før “alle 3”-agtige leverancer.

## UI må ikke dække spilverdenen

Distrikter (ca.):

| Distrikt | Plads på skærmen |
|----------|------------------|
| Nord     | øverst til venstre |
| Øst      | øverst til højre |
| Vest     | nederst til venstre |
| Syd      | nederst til højre |
| Centrum  | midt |

**Regler:**

- Overlays (jobs, bots, stats, zoom) må **ikke** permanent dække distriktnavne.
- Efter flytning af paneler: tjek **alle fire hjørner + midten** mentalt eller i browser.
- Jobs-panel: kompakt, gerne **foldbar**, midt/top eller anden “safe” zone.
- Zoom-knapper: `z-index` høj, store nok til touch, `pointer-events` OK, **ikke** blokeret af `body` touchmove.
- `touchmove` preventDefault **kun** på canvas – aldrig globalt på hele body for alle targets.

## Zoom & kamera

- Camera: `{ x, y, zoom }` i canvas-pixel space; `screenToWorld` skal matche `setTransform(zoom,0,0,zoom,x,y)`.
- Zoom: knapper (+/−/fit/reset), musehjul, pinch.
- Efter zoom/pan: `requestDraw()` så det virker også uden for main-loop edge cases.
- Undgå dobbelt-fire på mobil (touchend + click) med debounce.

## Veje & snap

- Snap til **hele polylinjen** (`closestPoint` segment-nøjagtig), ikke kun vertices.
- Endpoints prioriteres let for rene T-kryds.
- Smooth strokes forsigtigt – behold endpoints.

## Køretøjer / pathfinding

- Ved vejskift: score efter afstand til junction, retning mod target, tæthed, ejer.
- Undgå at biler “dør” ved dead-ends uden at prøve reverse/andet endpoint.
- Preferer veje der bringer dem tættere på destinations-distrikt.

## Stil

- Vanilla ES modules, ingen build-step påkrævet.
- Cozy look: bløde farver, afrundede UI, dansk copy.
- Hold ændringer fokuserede; undgå unødvendig refactor.

## Lærte fejl (opdater når noget går galt)

| Dato | Fejl | Læring |
|------|------|--------|
| 2026-08-03 | Jobs-panel top-venstre dækkede **Nord** | Placer UI i safe zones; tjek alle distrikter |
| 2026-08-03 | Jobs flyttet bottom-left dækkede **Vest** | Bottom-left er heller ikke fri – brug midt/top eller fold |
| 2026-08-03 | Zoom virkede ikke på mobil | Body `touchmove` preventDefault + manglende touch på knapper + manglende redraw |
| 2026-08-03 | GitHub HTTPS auth fejlede | SSH remote / `gh auth login` – husk at færdiggøre device flow |
| 2026-08-03 | Minimap bottom-left dækkede Vest igen | Minimap = bottom-**center** (ikke hjørner) |
| 2026-08-03 | Jobs expanded dækkede Nord på mobil | Default **collapsed** på smal skærm; smallere panel |

Når du retter en bruger-rapporteret bug: **tilføj en række** i tabellen ovenfor.

## Backlog

Se [IMPROVEMENTS.md](./IMPROVEMENTS.md) for forslag der endnu ikke er lavet.  
Se [PLAN.md](./PLAN.md) for faseroadmap.
