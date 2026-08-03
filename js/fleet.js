/**
 * Player fleet: buy, classes, upgrades (F1/F2 + U1/U2).
 */

export const FLEET = {
  carBase: 70,
  truckBase: 105,
  priceStep: 22,
  hardCap: 12,
  baseCap: 3,
  levelsPerSlot: 2,
  /** Max +last ranks per vehicle */
  maxUpgradeRank: 3,
  /** Meta unlock thresholds (total upgrades ever) */
  unlockFastAt: 5,
  unlockHeavyAt: 10
};

/** Vehicle class catalog */
export const VEHICLE_CLASSES = {
  car_std: {
    id: 'car_std',
    kind: 'car',
    label: 'Standard bil',
    short: 'Bil',
    icon: '👤',
    desc: 'Balanceret',
    basePrice: 70,
    baseCargo: 1,
    speedMul: 1,
    sizeMul: 1,
    unlockAt: 0
  },
  car_fast: {
    id: 'car_fast',
    kind: 'car',
    label: 'Hurtig bil',
    short: 'Hurtig',
    icon: '⚡',
    desc: 'Hurtig, mindre last',
    basePrice: 120,
    baseCargo: 1,
    speedMul: 1.38,
    sizeMul: 0.92,
    unlockAt: FLEET.unlockFastAt
  },
  truck_std: {
    id: 'truck_std',
    kind: 'truck',
    label: 'Standard lastbil',
    short: 'Lastbil',
    icon: '📦',
    desc: 'Gods',
    basePrice: 105,
    baseCargo: 1,
    speedMul: 1,
    sizeMul: 1,
    unlockAt: 0
  },
  truck_heavy: {
    id: 'truck_heavy',
    kind: 'truck',
    label: 'Tung lastbil',
    short: 'Tung',
    icon: '🚛',
    desc: 'Meget last, langsom',
    basePrice: 160,
    baseCargo: 2,
    speedMul: 0.72,
    sizeMul: 1.15,
    unlockAt: FLEET.unlockHeavyAt
  }
};

export const STARTER_CLASSES = ['car_std', 'truck_std'];

export function fleetCap(level = 1) {
  const L = Math.max(1, level | 0);
  const extra = Math.floor((L - 1) / FLEET.levelsPerSlot);
  return Math.min(FLEET.hardCap, FLEET.baseCap + extra);
}

export function getClass(classId) {
  return VEHICLE_CLASSES[classId] || VEHICLE_CLASSES.car_std;
}

export function buyPriceForClass(classId, ownedCount) {
  const c = getClass(classId);
  return c.basePrice + Math.max(0, ownedCount) * FLEET.priceStep;
}

/** @deprecated use buyPriceForClass */
export function buyPrice(kind, ownedCount) {
  return buyPriceForClass(kind === 'truck' ? 'truck_std' : 'car_std', ownedCount);
}

export function cargoCapacity(classId, upgradeRank = 0) {
  const c = getClass(classId);
  const rank = Math.max(0, Math.min(FLEET.maxUpgradeRank, upgradeRank | 0));
  return c.baseCargo + rank;
}

export function upgradePrice(upgradeRank = 0, classId = 'car_std') {
  const rank = Math.max(0, upgradeRank | 0);
  const c = getClass(classId);
  const premium = Math.round((c.basePrice - 70) * 0.15);
  return 45 + rank * 38 + Math.max(0, premium);
}

export function canUpgrade(upgradeRank) {
  return (upgradeRank | 0) < FLEET.maxUpgradeRank;
}

/** Job type → vehicle kind */
export function kindForJob(job) {
  if (!job) return 'car';
  return job.type === 'cargo' ? 'truck' : 'car';
}

export function vehicleCanDoJob(vehicle, job) {
  if (!vehicle || !job) return false;
  return vehicle.kind === kindForJob(job);
}

/**
 * Which classes are unlocked given total upgrades (+ explicit list).
 */
export function resolveUnlockedClasses(meta) {
  const total = meta?.totalUpgrades | 0;
  const set = new Set(STARTER_CLASSES);
  if (Array.isArray(meta?.unlockedClasses)) {
    for (const id of meta.unlockedClasses) {
      if (VEHICLE_CLASSES[id]) set.add(id);
    }
  }
  for (const c of Object.values(VEHICLE_CLASSES)) {
    if (c.unlockAt > 0 && total >= c.unlockAt) set.add(c.id);
  }
  return [...set];
}

/**
 * After an upgrade, grant new class unlocks. Mutates meta.unlocks/unlockedClasses.
 * @returns {string[]} newly unlocked class ids
 */
export function applyUpgradeUnlocks(meta) {
  if (!meta.unlockedClasses) meta.unlockedClasses = [...STARTER_CLASSES];
  const before = new Set(meta.unlockedClasses);
  const resolved = resolveUnlockedClasses(meta);
  const newly = [];
  for (const id of resolved) {
    if (!before.has(id)) {
      meta.unlockedClasses.push(id);
      newly.push(id);
    }
  }
  // Keep unlocks array for future shop flags
  if (!meta.unlocks) meta.unlocks = [];
  for (const id of newly) {
    const flag = `class:${id}`;
    if (!meta.unlocks.includes(flag)) meta.unlocks.push(flag);
  }
  return newly;
}

export function classLabel(classId) {
  return getClass(classId).label;
}
