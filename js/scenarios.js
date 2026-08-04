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

/**
 * @typedef {{ type: 'deliver'|'connect_all'|'money'|'jobs', amount?: number, stars: number }} Goal
 */

export const SCENARIOS = [
  {
    id: 'intro',
    name: 'Første forbindelser',
    blurb: 'Lille dal – lær at forbinde by og landbrug.',
    seed: 101,
    startMoney: 1500,
    worldScale: 1.08,
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
    worldScale: 1.22,
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
    worldScale: 1.42,
    unlockLevel: 3,
    layout: LAYOUT_VALLEY,
    goals: [
      { type: 'deliver', amount: 18, stars: 1 },
      { type: 'connect_all', stars: 1 },
      { type: 'jobs', amount: 3, stars: 1 }
    ]
  },
  {
    id: 'freeplay',
    name: 'Sandkasse',
    blurb: 'Fri leg på det store standardkort. Ingen stjerne-krav.',
    seed: 42,
    startMoney: 1600,
    worldScale: 1.38,
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
    }
    return { goal: g, done, progress };
  });
  const stars = details.reduce((n, d) => n + (d.done ? (d.goal.stars || 1) : 0), 0);
  return { stars: Math.min(3, stars), details, freeplay: false };
}
