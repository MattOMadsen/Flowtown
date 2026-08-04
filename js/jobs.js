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
    rewardPerUnit: 16
  },
  cargo: {
    id: 'cargo',
    label: 'Gods',
    icon: '📦',
    vehicle: 'truck',
    unit: 'kasser',
    baseReward: 34,
    rewardPerUnit: 20
  }
};

let nextJobId = 1;

export function createJob(from, to, typeKey, amount) {
  const type = JOB_TYPES[typeKey] || JOB_TYPES.passengers;
  const dist = Math.hypot((to.x || 0) - (from.x || 0), (to.y || 0) - (from.y || 0));
  const distBonus = Math.round(dist * 0.012);
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
  else base = 4 + Math.floor(Math.random() * 7);
  if (typeKey === 'cargo' && (from?.type === 'farm' || from?.type === 'factory' || from?.type === 'harbor')) {
    base += 1 + Math.floor(Math.random() * 2);
  }
  if (typeKey === 'passengers' && (from?.type === 'capital' || from?.type === 'town')) {
    base += Math.floor(Math.random() * 2);
  }
  return base;
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

  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 32; attempt++) {
    const typeKey = Math.random() < 0.45 ? 'passengers' : 'cargo';
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];

    const routeJobs = existingJobs.filter(
      j => j.active && j.from.name === from.name && j.to.name === to.name
    ).length;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const typeScore = jobRouteScore(from, to, typeKey);
    // Hard reject nonsense cargo
    if (typeKey === 'cargo' && typeScore < 0) continue;

    const score =
      typeScore +
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
