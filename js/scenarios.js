/**
 * Campaign scenarios – 3-star goals, different layouts (C1).
 */

/** Compact intro layout */
export const LAYOUT_INTRO = [
  { rx: 0.45, ry: 0.42, rr: 0.038, type: 'capital' },
  { rx: 0.16, ry: 0.20, rr: 0.030, type: 'town' },
  { rx: 0.78, ry: 0.22, rr: 0.030, type: 'factory' },
  { rx: 0.12, ry: 0.55, rr: 0.028, type: 'farm' },
  { rx: 0.82, ry: 0.58, rr: 0.028, type: 'town' },
  { rx: 0.48, ry: 0.78, rr: 0.030, type: 'farm' }
];

export const LAYOUT_COAST = [
  { rx: 0.52, ry: 0.40, rr: 0.034, type: 'capital' },
  { rx: 0.10, ry: 0.32, rr: 0.034, type: 'harbor' },
  { rx: 0.28, ry: 0.16, rr: 0.028, type: 'town' },
  { rx: 0.78, ry: 0.18, rr: 0.030, type: 'factory' },
  { rx: 0.90, ry: 0.42, rr: 0.027, type: 'town' },
  { rx: 0.72, ry: 0.58, rr: 0.028, type: 'town' },
  { rx: 0.40, ry: 0.72, rr: 0.030, type: 'farm' },
  { rx: 0.18, ry: 0.70, rr: 0.028, type: 'farm' },
  { rx: 0.62, ry: 0.82, rr: 0.028, type: 'factory' }
];

export const LAYOUT_VALLEY = [
  { rx: 0.48, ry: 0.46, rr: 0.032, type: 'capital' },
  { rx: 0.12, ry: 0.12, rr: 0.026, type: 'town' },
  { rx: 0.40, ry: 0.14, rr: 0.024, type: 'town' },
  { rx: 0.82, ry: 0.12, rr: 0.026, type: 'factory' },
  { rx: 0.10, ry: 0.42, rr: 0.030, type: 'harbor' },
  { rx: 0.30, ry: 0.38, rr: 0.024, type: 'farm' },
  { rx: 0.70, ry: 0.36, rr: 0.026, type: 'factory' },
  { rx: 0.90, ry: 0.48, rr: 0.026, type: 'town' },
  { rx: 0.16, ry: 0.72, rr: 0.026, type: 'farm' },
  { rx: 0.48, ry: 0.78, rr: 0.026, type: 'town' },
  { rx: 0.72, ry: 0.80, rr: 0.026, type: 'farm' },
  { rx: 0.88, ry: 0.78, rr: 0.026, type: 'factory' }
];

/** Ø-kæde: steder på hver side – broer er nøglen */
export const LAYOUT_ISLANDS = [
  { rx: 0.18, ry: 0.28, rr: 0.032, type: 'harbor' },
  { rx: 0.22, ry: 0.55, rr: 0.028, type: 'town' },
  { rx: 0.14, ry: 0.78, rr: 0.026, type: 'farm' },
  { rx: 0.48, ry: 0.42, rr: 0.034, type: 'capital' },
  { rx: 0.52, ry: 0.72, rr: 0.027, type: 'factory' },
  { rx: 0.78, ry: 0.22, rr: 0.030, type: 'town' },
  { rx: 0.86, ry: 0.48, rr: 0.030, type: 'factory' },
  { rx: 0.82, ry: 0.76, rr: 0.028, type: 'harbor' }
];

/** Tæt bynet – godt til flow/kø-udfordring */
export const LAYOUT_NIGHT = [
  { rx: 0.50, ry: 0.48, rr: 0.036, type: 'capital' },
  { rx: 0.28, ry: 0.28, rr: 0.028, type: 'town' },
  { rx: 0.72, ry: 0.26, rr: 0.028, type: 'town' },
  { rx: 0.22, ry: 0.52, rr: 0.026, type: 'factory' },
  { rx: 0.78, ry: 0.52, rr: 0.026, type: 'factory' },
  { rx: 0.38, ry: 0.74, rr: 0.027, type: 'farm' },
  { rx: 0.62, ry: 0.76, rr: 0.027, type: 'farm' },
  { rx: 0.50, ry: 0.18, rr: 0.026, type: 'harbor' }
];

/**
 * @typedef {{ type: 'deliver'|'connect_all'|'money'|'jobs'|'flow', amount?: number, seconds?: number, stars: number }} Goal
 */

export const SCENARIOS = [
  {
    id: 'intro',
    name: 'Første forbindelser',
    blurb: 'Lille dal – lær at forbinde by og landbrug.',
    seed: 101,
    startMoney: 1500,
    worldScale: 1.45,
    unlockLevel: 1,
    layout: LAYOUT_INTRO,
    goals: [
      { type: 'deliver', amount: 6, stars: 1 },
      { type: 'connect_all', stars: 1 },
      { type: 'money', amount: 350, stars: 1 }
    ]
  },
  {
    id: 'coast',
    name: 'Kyststrækningen',
    blurb: 'Havn, fabrik og marker – gods skal ud.',
    seed: 202,
    startMoney: 1350,
    worldScale: 1.62,
    unlockLevel: 2,
    layout: LAYOUT_COAST,
    goals: [
      { type: 'deliver', amount: 12, stars: 1 },
      { type: 'jobs', amount: 2, stars: 1 },
      { type: 'money', amount: 400, stars: 1 }
    ]
  },
  {
    id: 'valley',
    name: 'Industri-dalen',
    blurb: 'Stort kort – fuld netværks-udfordring.',
    seed: 303,
    startMoney: 1300,
    worldScale: 1.88,
    unlockLevel: 3,
    layout: LAYOUT_VALLEY,
    goals: [
      { type: 'deliver', amount: 18, stars: 1 },
      { type: 'connect_all', stars: 1 },
      { type: 'jobs', amount: 3, stars: 1 }
    ]
  },
  {
    id: 'islands',
    name: 'Ø-broerne',
    blurb: 'Vand deler landet – byg broer og hold flow over vandet.',
    seed: 404,
    startMoney: 1550,
    worldScale: 1.72,
    unlockLevel: 3,
    layout: LAYOUT_ISLANDS,
    goals: [
      { type: 'connect_all', stars: 1 },
      { type: 'deliver', amount: 14, stars: 1 },
      { type: 'flow', amount: 65, seconds: 28, stars: 1 }
    ]
  },
  {
    id: 'nightrush',
    name: 'Nat-rush',
    blurb: 'Tæt bynet – hold trafikken kørende under rush og mørke.',
    seed: 505,
    startMoney: 1400,
    worldScale: 1.58,
    unlockLevel: 4,
    layout: LAYOUT_NIGHT,
    /** Start later in day cycle + slightly wet */
    startTimeOfDay: 0.68,
    startWeather: 'rain',
    forceBotsHint: true,
    goals: [
      { type: 'flow', amount: 70, seconds: 32, stars: 1 },
      { type: 'jobs', amount: 3, stars: 1 },
      { type: 'deliver', amount: 16, stars: 1 }
    ]
  },
  {
    id: 'freeplay',
    name: 'Sandkasse',
    blurb: 'Fri leg på det store standardkort. Ingen stjerne-krav.',
    seed: 42,
    startMoney: 1600,
    worldScale: 1.85,
    unlockLevel: 1,
    layout: null, // default full layout
    goals: [],
    freeplay: true
  }
];

export function getScenario(id) {
  return SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
}

export function goalLabel(goal) {
  if (goal.type === 'deliver') return `Lever ${goal.amount} enheder`;
  if (goal.type === 'connect_all') return 'Forbind alle steder (vej nær hvert)';
  if (goal.type === 'money') return `Tjen op til $${goal.amount}`;
  if (goal.type === 'jobs') return `Fuldfør ${goal.amount} opgaver`;
  if (goal.type === 'flow') {
    const sec = goal.seconds || 30;
    const pct = goal.amount || 70;
    return `Hold flow ≥ ${pct}% i ${sec}s`;
  }
  return 'Mål';
}

/**
 * Evaluate goals against game snapshot.
 * @returns {{ stars: number, details: {goal, done:boolean, progress:string}[] }}
 */
export function evaluateGoals(scenario, snap) {
  const goals = scenario?.goals || [];
  if (!goals.length) {
    return { stars: 0, details: [], freeplay: true };
  }
  const details = goals.map(g => {
    let done = false;
    let progress = '';
    if (g.type === 'deliver') {
      const v = snap.delivered || 0;
      done = v >= g.amount;
      progress = `${Math.min(v, g.amount)}/${g.amount}`;
    } else if (g.type === 'money') {
      const v = Math.floor(snap.money || 0);
      done = v >= g.amount;
      progress = `$${v}/$${g.amount}`;
    } else if (g.type === 'jobs') {
      const v = snap.jobsCompleted || 0;
      done = v >= g.amount;
      progress = `${Math.min(v, g.amount)}/${g.amount}`;
    } else if (g.type === 'connect_all') {
      done = !!snap.allConnected;
      progress = done ? 'OK' : '…';
    } else if (g.type === 'flow') {
      const need = g.seconds || 30;
      const thr = g.amount || 70;
      const hold = snap.flowHoldBest || 0;
      const cur = snap.flowPct || 0;
      done = hold >= need;
      progress = done
        ? `${need}s ✓`
        : `${Math.floor(Math.min(hold, need))}/${need}s · nu ${cur}%`;
      // thr used only for hold tracking in game; show if under
      if (!done && cur < thr) progress = `nu ${cur}% (mål ${thr}%)`;
    }
    return { goal: g, done, progress };
  });
  const stars = details.reduce((n, d) => n + (d.done ? (d.goal.stars || 1) : 0), 0);
  return { stars: Math.min(3, stars), details, freeplay: false };
}
