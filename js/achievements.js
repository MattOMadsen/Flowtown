/**
 * P2-4: Achievements – localStorage flags + toast hooks.
 */

export const ACHIEVEMENTS = [
  {
    id: 'first_road',
    icon: '🛤️',
    title: 'Første vej',
    desc: 'Byg din første vej',
    xp: 8
  },
  {
    id: 'first_car',
    icon: '🚗',
    title: 'Flåde i gang',
    desc: 'Køb din første bil',
    xp: 8
  },
  {
    id: 'first_delivery',
    icon: '📦',
    title: 'Første levering',
    desc: 'Lever gods eller passagerer',
    xp: 10
  },
  {
    id: 'first_job',
    icon: '✅',
    title: 'Opgave klaret',
    desc: 'Fuldfør en hel opgave',
    xp: 12
  },
  {
    id: 'fleet_5',
    icon: '🚛',
    title: 'Lille firma',
    desc: 'Eje 5 biler på én gang',
    xp: 14
  },
  {
    id: 'money_500',
    icon: '💰',
    title: 'Halvanden tusind',
    desc: 'Hav mindst $1500 på kontoen',
    xp: 10
  },
  {
    id: 'level_3',
    icon: '⬆️',
    title: 'Netværks-level 3',
    desc: 'Nå level 3',
    xp: 12
  },
  {
    id: 'connect_all',
    icon: '🔗',
    title: 'Hele nettet',
    desc: 'Forbind alle steder med vej',
    xp: 20
  },
  {
    id: 'rush_job',
    icon: '🚇',
    title: 'Rush-mester',
    desc: 'Fuldfør en opgave under rush hour',
    xp: 15
  },
  {
    id: 'builder',
    icon: '🚉',
    title: 'Bygherre',
    desc: 'Placer station, lager eller depot',
    xp: 12
  },
  {
    id: 'oneway',
    icon: '➡️',
    title: 'Envejs-trafik',
    desc: 'Sæt en vej til envejs',
    xp: 8
  },
  {
    id: 'traffic_light',
    icon: '🚦',
    title: 'Grønt lys',
    desc: 'Placer et trafiklys',
    xp: 8
  },
  {
    id: 'sell_car',
    icon: '🏷️',
    title: 'Brugtbil',
    desc: 'Sælg en bil fra flåden',
    xp: 6
  },
  {
    id: 'growth_3',
    icon: '🏙️',
    title: 'By i vækst',
    desc: 'Få en by til størrelse 3',
    xp: 14
  },
  {
    id: 'star_1',
    icon: '⭐',
    title: 'Stjerne',
    desc: 'Få mindst 1 stjerne på en bane',
    xp: 10
  }
];

export function ensureAchievements(meta) {
  if (!meta.achievements || typeof meta.achievements !== 'object') {
    meta.achievements = {};
  }
  return meta.achievements;
}

export function hasAchievement(meta, id) {
  return !!ensureAchievements(meta)[id];
}

/**
 * Unlock if not already. Returns achievement def or null.
 */
export function unlockAchievement(meta, id) {
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;
  const bag = ensureAchievements(meta);
  if (bag[id]) return null;
  bag[id] = { at: Date.now() };
  return def;
}

export function achievementProgress(meta) {
  const bag = ensureAchievements(meta);
  const unlocked = ACHIEVEMENTS.filter(a => bag[a.id]).length;
  return {
    unlocked,
    total: ACHIEVEMENTS.length,
    ratio: ACHIEVEMENTS.length ? unlocked / ACHIEVEMENTS.length : 0,
    list: ACHIEVEMENTS.map(a => ({
      ...a,
      done: !!bag[a.id],
      at: bag[a.id]?.at || null
    }))
  };
}
