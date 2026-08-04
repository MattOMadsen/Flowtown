/** Job / demand system – passengers & cargo between places */

import { jobRouteScore } from './places.js';

export const JOB_TYPES = {
  passengers: {
    id: 'passengers',
    label: 'Personer',
    icon: '👤',
    vehicle: 'car',
    unit: 'personer',
    baseReward: 18,
    rewardPerUnit: 12
  },
  cargo: {
    id: 'cargo',
    label: 'Gods',
    icon: '📦',
    vehicle: 'truck',
    unit: 'kasser',
    baseReward: 22,
    rewardPerUnit: 16
  }
};

let nextJobId = 1;

export function createJob(from, to, typeKey, amount) {
  const type = JOB_TYPES[typeKey] || JOB_TYPES.passengers;
  // Longer hauls pay a bit more (TTD-ish)
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
  // Heavy producers ship more
  if (typeKey === 'cargo' && (from?.type === 'farm' || from?.type === 'factory' || from?.type === 'harbor')) {
    base += 1 + Math.floor(Math.random() * 2);
  }
  if (typeKey === 'passengers' && (from?.type === 'capital' || from?.type === 'town')) {
    base += Math.floor(Math.random() * 2);
  }
  return base;
}

/**
 * Generate a job preferring TTD-style chains (farm→factory, town↔town, …).
 */
export function generateJob(districts, existingJobs = []) {
  if (!districts || districts.length < 2) return null;

  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 28; attempt++) {
    const typeKey = Math.random() < 0.48 ? 'passengers' : 'cargo';
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];

    const routeJobs = existingJobs.filter(
      j => j.active && j.from.name === from.name && j.to.name === to.name
    ).length;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const typeScore = jobRouteScore(from, to, typeKey);
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

  if (!best || bestScore < 10) {
    // Fallback: any pair
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];
    const typeKey = Math.random() < 0.5 ? 'passengers' : 'cargo';
    best = { from, to, typeKey };
  }

  const amount = randomJobAmount(best.typeKey, best.from, best.to);
  return createJob(best.from, best.to, best.typeKey, amount);
}
