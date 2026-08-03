/** Job / demand system – passengers & cargo between districts */

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
  const reward = type.baseReward + amount * type.rewardPerUnit;
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
    claimedBy: null // null = open, 'player' | bot id
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
 * Pick a sensible amount based on type.
 */
export function randomJobAmount(typeKey) {
  if (typeKey === 'cargo') return 3 + Math.floor(Math.random() * 5); // 3–7
  return 4 + Math.floor(Math.random() * 7); // 4–10
}

/**
 * Generate a new job between two different districts.
 * Prefer pairs that aren't already overloaded with open jobs.
 */
export function generateJob(districts, existingJobs = []) {
  if (!districts || districts.length < 2) return null;

  const typeKey = Math.random() < 0.55 ? 'passengers' : 'cargo';
  let best = null;
  let bestScore = -Infinity;

  // Sample several random pairs, prefer less-served routes
  for (let attempt = 0; attempt < 12; attempt++) {
    const from = districts[Math.floor(Math.random() * districts.length)];
    let to = districts[Math.floor(Math.random() * districts.length)];
    while (to === from) to = districts[Math.floor(Math.random() * districts.length)];

    const routeJobs = existingJobs.filter(
      j => j.active && j.from.name === from.name && j.to.name === to.name
    ).length;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const score = dist * 0.01 - routeJobs * 40 + Math.random() * 15;
    if (score > bestScore) {
      bestScore = score;
      best = { from, to, typeKey };
    }
  }

  if (!best) return null;
  const amount = randomJobAmount(best.typeKey);
  return createJob(best.from, best.to, best.typeKey, amount);
}
