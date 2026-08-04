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

export function randomJobAmount(typeKey, from, to) {
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
  return base;
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
export function generateJob(districts, existingJobs = []) {
  if (!districts || districts.length < 2) return null;

  const factories = districts.filter(d => d.type === 'factory');
  const farms = districts.filter(d => d.type === 'farm');

  // ~40% of jobs: force a meaningful factory chain
  if (factories.length && Math.random() < 0.42) {
    const factory = factories[Math.floor(Math.random() * factories.length)];
    // Prefer outbound finished goods; sometimes inbound from farm
    if (farms.length && Math.random() < 0.35) {
      const farm = farms[Math.floor(Math.random() * farms.length)];
      const amount = randomJobAmount('cargo', farm, factory);
      return createJob(farm, factory, 'cargo', amount);
    }
    const sink = pickFactorySink(districts, factory, existingJobs);
    if (sink) {
      const amount = randomJobAmount('cargo', factory, sink);
      return createJob(factory, sink, 'cargo', amount);
    }
  }

  // Farm → factory boost
  if (farms.length && factories.length && Math.random() < 0.25) {
    const farm = farms[Math.floor(Math.random() * farms.length)];
    const factory = factories[Math.floor(Math.random() * factories.length)];
    return createJob(farm, factory, 'cargo', randomJobAmount('cargo', farm, factory));
  }

  // Dedicated tourist / express attempts (~18% each when places exist)
  if (Math.random() < 0.18) {
    const hubs = districts.filter(isTouristPlace);
    if (hubs.length >= 2) {
      const from = hubs[Math.floor(Math.random() * hubs.length)];
      let to = hubs[Math.floor(Math.random() * hubs.length)];
      while (to === from) to = hubs[Math.floor(Math.random() * hubs.length)];
      return createJob(from, to, 'tourist', randomJobAmount('tourist', from, to));
    }
  }
  if (Math.random() < 0.16) {
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];
    return createJob(from, to, 'express', randomJobAmount('express', from, to));
  }

  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 32; attempt++) {
    const wantCargo = Math.random() < 0.42;
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
          randomJobAmount('cargo', factory, sink)
        );
      }
    }
    const from = districts[0];
    const to = districts[1] || districts[0];
    if (from === to) return null;
    best = { from, to, typeKey: 'passengers' };
  }

  const amount = randomJobAmount(best.typeKey, best.from, best.to);
  return createJob(best.from, best.to, best.typeKey, amount);
}
