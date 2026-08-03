/**
 * Flowtown meta-progression (B1): XP, level, persistent unlocks.
 * Rule: XP/level unlocks content; $ buys power/quantity (shop later).
 */

const STORAGE_KEY = 'flowtown-meta-v1';

/** XP required to advance from `level` → `level+1` */
export function xpForLevel(level) {
  const L = Math.max(1, level | 0);
  // Hurtigt 1→10, derefter stejlere
  return Math.floor(36 + L * 26 + L * L * 3.5);
}

export function defaultMeta() {
  return {
    version: 1,
    level: 1,
    xp: 0,
    totalXp: 0,
    unlocks: [],
    /** Pair keys "A|B" (sorted names) that already paid first-link XP */
    firstLinks: [],
    /** Lifetime vehicle upgrades (U1/U2 progression) */
    totalUpgrades: 0,
    /** Unlocked vehicle class ids */
    unlockedClasses: ['car_std', 'truck_std']
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMeta();
    const data = JSON.parse(raw);
    const base = defaultMeta();
    return {
      ...base,
      ...data,
      level: Math.max(1, parseInt(data.level, 10) || 1),
      xp: Math.max(0, parseInt(data.xp, 10) || 0),
      totalXp: Math.max(0, parseInt(data.totalXp, 10) || 0),
      unlocks: Array.isArray(data.unlocks) ? data.unlocks : [],
      firstLinks: Array.isArray(data.firstLinks) ? data.firstLinks : [],
      totalUpgrades: Math.max(0, parseInt(data.totalUpgrades, 10) || 0),
      unlockedClasses: Array.isArray(data.unlockedClasses) && data.unlockedClasses.length
        ? data.unlockedClasses
        : [...base.unlockedClasses]
    };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      level: meta.level,
      xp: meta.xp,
      totalXp: meta.totalXp,
      unlocks: meta.unlocks || [],
      firstLinks: meta.firstLinks || [],
      totalUpgrades: meta.totalUpgrades || 0,
      unlockedClasses: meta.unlockedClasses || ['car_std', 'truck_std']
    }));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Add XP; auto level-up while possible.
 * @returns {{ leveled: boolean, levelsGained: number, level: number, xp: number, need: number, amount: number }}
 */
export function addXp(meta, amount) {
  const gain = Math.max(0, Math.floor(amount || 0));
  if (gain <= 0) {
    return {
      leveled: false,
      levelsGained: 0,
      level: meta.level,
      xp: meta.xp,
      need: xpForLevel(meta.level),
      amount: 0
    };
  }

  meta.xp += gain;
  meta.totalXp += gain;
  let levelsGained = 0;

  // Cap runaway loops
  for (let i = 0; i < 50; i++) {
    const need = xpForLevel(meta.level);
    if (meta.xp < need) break;
    meta.xp -= need;
    meta.level += 1;
    levelsGained += 1;
  }

  saveMeta(meta);
  return {
    leveled: levelsGained > 0,
    levelsGained,
    level: meta.level,
    xp: meta.xp,
    need: xpForLevel(meta.level),
    amount: gain
  };
}

export function levelProgress(meta) {
  const need = xpForLevel(meta.level);
  return {
    level: meta.level,
    xp: meta.xp,
    need,
    ratio: need > 0 ? Math.min(1, meta.xp / need) : 0,
    totalXp: meta.totalXp
  };
}

/** Stable key for district pair */
export function pairKey(nameA, nameB) {
  return [String(nameA), String(nameB)].sort().join('|');
}

export function hasFirstLink(meta, nameA, nameB) {
  const k = pairKey(nameA, nameB);
  return (meta.firstLinks || []).includes(k);
}

/** Mark pair as claimed; returns true if newly claimed */
export function claimFirstLink(meta, nameA, nameB) {
  const k = pairKey(nameA, nameB);
  if (!meta.firstLinks) meta.firstLinks = [];
  if (meta.firstLinks.includes(k)) return false;
  meta.firstLinks.push(k);
  saveMeta(meta);
  return true;
}

/** XP grants (tunable) */
export const XP_REWARDS = {
  /** Per unit delivered by player */
  perUnit: 3,
  /** When a full job is completed by player */
  jobCompleteBase: 16,
  jobCompletePerUnit: 2,
  /** First time two districts are roughly linked */
  firstLink: 28,
  /** Soft money bonus on level-up */
  levelMoneyBase: 18,
  levelMoneyPerLevel: 4
};
