/**
 * Map places: byer, landbrug, fabrikker, havne (TTD-light).
 * Realistiske danske/skandinaviske navne, faste pr. layout-seed.
 */

export const PLACE_TYPES = {
  capital: {
    id: 'capital',
    label: 'Hovedby',
    icon: '⭐',
    color: '#a78bfa',
    passengers: 1.3,
    cargo: 0.7
  },
  town: {
    id: 'town',
    label: 'By',
    icon: '🏠',
    color: '#60a5fa',
    passengers: 1.15,
    cargo: 0.55
  },
  farm: {
    id: 'farm',
    label: 'Landbrug',
    icon: '🌾',
    color: '#84cc16',
    passengers: 0.35,
    cargo: 1.25
  },
  factory: {
    id: 'factory',
    label: 'Fabrik',
    icon: '🏭',
    color: '#f59e0b',
    passengers: 0.55,
    cargo: 1.35
  },
  harbor: {
    id: 'harbor',
    label: 'Havn',
    icon: '⚓',
    color: '#0ea5e9',
    passengers: 0.65,
    cargo: 1.2
  }
};

const NAME_POOLS = {
  capital: [
    'Roskilde', 'Kolding', 'Viborg', 'Næstved', 'Horsens', 'Slagelse', 'Svendborg', 'Hillerød'
  ],
  town: [
    'Birkehøj', 'Mølleby', 'Granlund', 'Solkær', 'Engsted', 'Klintborg', 'Lindelev',
    'Ålholm', 'Sandved', 'Højby', 'Rødkilde', 'Tjørnebjerg', 'Fasanvang', 'Skovlunde',
    'Nørre Åby', 'Østerhøj', 'Søndersted', 'Vesterled'
  ],
  farm: [
    'Grønhøj Gods', 'Vestervang', 'Søndermark', 'Hvedemark', 'Kløverholt', 'Mosevang',
    'Rugbjerg', 'Enghaven', 'Bøgehøj Mark', 'Lærkevang', 'Stubmark', 'Østermark'
  ],
  factory: [
    'Nordindustri', 'Jernværket', 'Betonværket', 'Papirfabrikken', 'Mejeriet Øst',
    'Siloanlæg Vest', 'Maskinfabrikken', 'Tekstilværket', 'Kemiværket', 'Træindustri'
  ],
  harbor: [
    'Havnsund', 'Fiskerup Havn', 'Kystterminalen', 'Ankerkaj', 'Strømhavn',
    'Nordkajen', 'Bugthavnen', 'Løgstør Kaj'
  ]
};

/** Default world layout – relative coords (0–1) on a large map */
export const DEFAULT_LAYOUT = [
  { rx: 0.48, ry: 0.46, rr: 0.038, type: 'capital' },
  { rx: 0.14, ry: 0.16, rr: 0.032, type: 'town' },
  { rx: 0.86, ry: 0.18, rr: 0.030, type: 'factory' },
  { rx: 0.10, ry: 0.52, rr: 0.034, type: 'harbor' },
  { rx: 0.88, ry: 0.48, rr: 0.030, type: 'town' },
  { rx: 0.18, ry: 0.86, rr: 0.032, type: 'farm' },
  { rx: 0.52, ry: 0.88, rr: 0.031, type: 'factory' },
  { rx: 0.82, ry: 0.82, rr: 0.032, type: 'farm' }
];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickName(pool, used, rng) {
  const available = pool.filter(n => !used.has(n));
  const list = available.length ? available : pool;
  const name = list[Math.floor(rng() * list.length)];
  used.add(name);
  return name;
}

/**
 * Build place definitions with stable names for a seed.
 * @param {number} [seed=42]
 * @param {object[]|null} [layout] relative slots; default DEFAULT_LAYOUT
 */
export function buildPlaceDefs(seed = 42, layout = null) {
  const rng = mulberry32(seed | 0);
  const used = new Set();
  const slots = layout && layout.length ? layout : DEFAULT_LAYOUT;
  return slots.map((slot, i) => {
    const type = PLACE_TYPES[slot.type] || PLACE_TYPES.town;
    const pool = NAME_POOLS[slot.type] || NAME_POOLS.town;
    const name = pickName(pool, used, rng);
    return {
      id: `p${i}`,
      rx: slot.rx,
      ry: slot.ry,
      rr: slot.rr,
      type: type.id,
      typeLabel: type.label,
      icon: type.icon,
      color: type.color,
      name,
      passengers: type.passengers,
      cargo: type.cargo
    };
  });
}

export function placeTypeMeta(typeId) {
  return PLACE_TYPES[typeId] || PLACE_TYPES.town;
}

/**
 * Score how natural a job is for from→to + typeKey.
 * Higher = better TTD-style flow.
 */
export function jobRouteScore(from, to, typeKey) {
  const ft = from.type || 'town';
  const tt = to.type || 'town';
  let s = 0;

  if (typeKey === 'cargo') {
    // Farm / harbor → factory; factory → harbor / capital; farm → harbor
    if (ft === 'farm' && (tt === 'factory' || tt === 'harbor' || tt === 'capital')) s += 90;
    if (ft === 'factory' && (tt === 'harbor' || tt === 'capital' || tt === 'town')) s += 70;
    if (ft === 'harbor' && (tt === 'factory' || tt === 'capital')) s += 75;
    if (ft === 'town' && tt === 'factory') s += 25;
    // Weak reverse cargo
    if (ft === 'factory' && tt === 'farm') s -= 20;
    s += ((from.cargo || 1) + (to.cargo || 1)) * 12;
  } else {
    // Passengers: towns and capital
    if ((ft === 'town' || ft === 'capital') && (tt === 'town' || tt === 'capital')) s += 85;
    if (ft === 'capital' || tt === 'capital') s += 25;
    if ((ft === 'harbor' || tt === 'harbor') && (ft === 'town' || tt === 'town' || ft === 'capital' || tt === 'capital')) s += 40;
    // Workers to factory
    if ((ft === 'town' || ft === 'capital') && tt === 'factory') s += 55;
    if (ft === 'factory' && (tt === 'town' || tt === 'capital')) s += 45;
    // Farms rarely send people
    if (ft === 'farm' && typeKey === 'passengers') s -= 15;
    s += ((from.passengers || 1) + (to.passengers || 1)) * 10;
  }
  return s;
}
