/** Job / demand system – passengers & cargo with real industry chains */

import { jobRouteScore, pickFactorySink } from './places.js';

export const JOB_TYPES = {
  passengers: {
    id: 'passengers',
    label: 'Personer',
    icon: '👤',
    vehicle: 'car',
    unit: 'personer',
    baseReward: 28,
    rewardPerUnit: 16,
    color: '#2563eb'
  },
  cargo: {
    id: 'cargo',
    label: 'Gods',
    icon: '📦',
    vehicle: 'truck',
    unit: 'kasser',
    baseReward: 34,
    rewardPerUnit: 20,
    color: '#b45309'
  },
  /** Hurtig persontransport – belønner fart */
  express: {
    id: 'express',
    label: 'Ekspres',
    icon: '⚡',
    vehicle: 'car',
    unit: 'passagerer',
    baseReward: 42,
    rewardPerUnit: 22,
    color: '#db2777',
    preferFast: true
  },
  /** Turister mellem by / havn / hovedby */
  tourist: {
    id: 'tourist',
    label: 'Turister',
    icon: '🧳',
    vehicle: 'car',
    unit: 'turister',
    baseReward: 36,
    rewardPerUnit: 18,
    color: '#7c3aed',
    tourist: true
  }
};

let nextJobId = 1;

export function setNextJobId(n) {
  nextJobId = Math.max(1, n | 0);
}

export function createJob(from, to, typeKey, amount) {
  const type = JOB_TYPES[typeKey] || JOB_TYPES.passengers;
  const dist = Math.hypot((to.x || 0) - (from.x || 0), (to.y || 0) - (from.y || 0));
  const distBonus = Math.round(dist * 0.012 * (type.id === 'express' ? 1.35 : 1));
  const reward = type.baseReward + amount * type.rewardPerUnit + distBonus;
  return {
    id: nextJobId++,
    type: type.id,
    typeMeta: type,
    from,
    to,
    amount,
    delivered: 0,
    reward,
    active: true,
    createdAt: performance.now(),
    claimedBy: null
  };
}

export function jobProgress(job) {
  return Math.min(1, job.delivered / job.amount);
}

export function jobComplete(job) {
  return job.delivered >= job.amount;
}

export function jobLabel(job) {
  const left = Math.max(0, job.amount - job.delivered);
  return `${job.typeMeta.icon} ${left} ${job.typeMeta.unit}: ${job.from.name} → ${job.to.name}`;
}

/**
 * @param {string} typeKey
 * @param {object} from
 * @param {object} to
 * @param {{ rush?: boolean, growthMul?: number }} [opts]
 */
export function randomJobAmount(typeKey, from, to, opts = {}) {
  let base;
  if (typeKey === 'cargo') base = 3 + Math.floor(Math.random() * 5);
  else if (typeKey === 'express') base = 2 + Math.floor(Math.random() * 4); // mindre, hurtigere
  else if (typeKey === 'tourist') base = 3 + Math.floor(Math.random() * 5);
  else base = 4 + Math.floor(Math.random() * 7);
  if (typeKey === 'cargo' && (from?.type === 'farm' || from?.type === 'factory' || from?.type === 'harbor')) {
    base += 1 + Math.floor(Math.random() * 2);
  }
  if ((typeKey === 'passengers' || typeKey === 'tourist') &&
      (from?.type === 'capital' || from?.type === 'town' || from?.type === 'harbor')) {
    base += Math.floor(Math.random() * 2);
  }
  // Place growth (P1-4): larger districts spawn slightly bigger jobs
  const gFrom = (from?.growth | 0) || 0;
  const gTo = (to?.growth | 0) || 0;
  const g = Math.max(gFrom, Math.floor((gFrom + gTo) * 0.5));
  if (g > 0) base += Math.min(6, Math.floor(g * 0.7) + (Math.random() < 0.4 ? 1 : 0));
  // Demand multipliers from place type * growth
  if (from?.passengers && (typeKey === 'passengers' || typeKey === 'tourist' || typeKey === 'express')) {
    base = Math.round(base * (0.85 + Math.min(0.55, from.passengers * 0.12 + g * 0.04)));
  }
  if (from?.cargo && typeKey === 'cargo') {
    base = Math.round(base * (0.85 + Math.min(0.55, from.cargo * 0.12 + g * 0.04)));
  }
  if (opts.growthMul && opts.growthMul > 1) {
    base = Math.round(base * opts.growthMul);
  }
  // Rush hour (P1-3)
  if (opts.rush) {
    base = Math.round(base * (1.35 + Math.random() * 0.25));
    base += 1 + Math.floor(Math.random() * 2);
  }
  return Math.max(2, base);
}

function isTouristPlace(d) {
  return d && (d.type === 'capital' || d.type === 'town' || d.type === 'harbor');
}

/** Pick passenger-family type for random generation */
function pickPassengerType(from, to) {
  const touristRoute = isTouristPlace(from) && isTouristPlace(to);
  const r = Math.random();
  if (touristRoute && r < 0.38) return 'tourist';
  if (r < 0.28) return 'express';
  return 'passengers';
}

/**
 * Generate job with industry logic:
 * factories always get cargo jobs TO harbor/capital/town when possible.
 */
/**
 * @param {object[]} districts
 * @param {object[]} [existingJobs]
 * @param {{ rush?: boolean }} [opts]
 */
export function generateJob(districts, existingJobs = [], opts = {}) {
  if (!districts || districts.length < 2) return null;
  const amtOpts = { rush: !!opts.rush };
  // Global shop buffs: bias passenger vs cargo generation
  const preferPass = !!opts.preferPassengers;
  const preferCargo = !!opts.preferCargo;

  const factories = districts.filter(d => d.type === 'factory');
  const farms = districts.filter(d => d.type === 'farm');

  // Weight pick toward grown places slightly
  const pickPlace = (list) => {
    if (!list.length) return null;
    let best = list[0];
    let bestW = -1;
    for (let i = 0; i < Math.min(6, list.length); i++) {
      const d = list[Math.floor(Math.random() * list.length)];
      const w = 1 + (d.growth | 0) * 0.35 + Math.random();
      if (w > bestW) { bestW = w; best = d; }
    }
    return best;
  };

  // ~40% of jobs: force a meaningful factory chain (boost with cargo hub)
  const factoryChance = preferCargo ? 0.55 : preferPass ? 0.28 : 0.42;
  if (factories.length && Math.random() < factoryChance) {
    const factory = pickPlace(factories);
    // Prefer outbound finished goods; sometimes inbound from farm
    if (farms.length && Math.random() < 0.35) {
      const farm = pickPlace(farms);
      const amount = randomJobAmount('cargo', farm, factory, amtOpts);
      return createJob(farm, factory, 'cargo', amount);
    }
    const sink = pickFactorySink(districts, factory, existingJobs);
    if (sink) {
      const amount = randomJobAmount('cargo', factory, sink, amtOpts);
      return createJob(factory, sink, 'cargo', amount);
    }
  }

  // Farm → factory boost
  if (farms.length && factories.length && Math.random() < 0.25) {
    const farm = pickPlace(farms);
    const factory = pickPlace(factories);
    return createJob(farm, factory, 'cargo', randomJobAmount('cargo', farm, factory, amtOpts));
  }

  // Dedicated tourist / express attempts (~18% each when places exist)
  const tourBase = opts.rush ? 0.28 : 0.18;
  if (Math.random() < (preferPass ? tourBase + 0.14 : tourBase)) {
    const hubs = districts.filter(isTouristPlace);
    if (hubs.length >= 2) {
      const from = pickPlace(hubs);
      let to = pickPlace(hubs);
      while (to === from) to = hubs[Math.floor(Math.random() * hubs.length)];
      return createJob(from, to, 'tourist', randomJobAmount('tourist', from, to, amtOpts));
    }
  }
  if (Math.random() < (opts.rush ? 0.26 : 0.16)) {
    const from = pickPlace(districts);
    let to = pickPlace(districts);
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];
    return createJob(from, to, 'express', randomJobAmount('express', from, to, amtOpts));
  }

  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 32; attempt++) {
    let cargoP = 0.42;
    if (preferCargo) cargoP = 0.58;
    if (preferPass) cargoP = 0.28;
    const wantCargo = Math.random() < cargoP;
    let typeKey = wantCargo ? 'cargo' : 'passengers';
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];
    if (!wantCargo) typeKey = pickPassengerType(from, to);

    const routeJobs = existingJobs.filter(
      j => j.active && j.from.name === from.name && j.to.name === to.name
    ).length;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const scoreType = typeKey === 'express' || typeKey === 'tourist' ? 'passengers' : typeKey;
    const typeScore = jobRouteScore(from, to, scoreType);
    // Hard reject nonsense cargo
    if (typeKey === 'cargo' && typeScore < 0) continue;
    if (typeKey === 'tourist' && !(isTouristPlace(from) && isTouristPlace(to))) continue;

    let bonus = 0;
    if (typeKey === 'express') bonus = 8;
    if (typeKey === 'tourist') bonus = 10;

    const score =
      typeScore +
      bonus +
      dist * 0.018 -
      routeJobs * 45 +
      Math.random() * 12;

    if (score > bestScore) {
      bestScore = score;
      best = { from, to, typeKey };
    }
  }

  if (!best || bestScore < 15) {
    // Guaranteed sensible pair
    if (factories.length) {
      const factory = factories[0];
      const sink = pickFactorySink(districts, factory, existingJobs);
      if (sink) {
        return createJob(
          factory,
          sink,
          'cargo',
          randomJobAmount('cargo', factory, sink, amtOpts)
        );
      }
    }
    const from = districts[0];
    const to = districts[1] || districts[0];
    if (from === to) return null;
    best = { from, to, typeKey: 'passengers' };
  }

  const amount = randomJobAmount(best.typeKey, best.from, best.to, amtOpts);
  return createJob(best.from, best.to, best.typeKey, amount);
}
