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

/** Default freeplay layout – larger board, more places */
export const DEFAULT_LAYOUT = [
  { rx: 0.48, ry: 0.46, rr: 0.036, type: 'capital' },
  { rx: 0.12, ry: 0.14, rr: 0.028, type: 'town' },
  { rx: 0.38, ry: 0.18, rr: 0.026, type: 'town' },
  { rx: 0.72, ry: 0.14, rr: 0.028, type: 'factory' },
  { rx: 0.90, ry: 0.28, rr: 0.027, type: 'town' },
  { rx: 0.08, ry: 0.42, rr: 0.032, type: 'harbor' },
  { rx: 0.28, ry: 0.48, rr: 0.026, type: 'farm' },
  { rx: 0.68, ry: 0.42, rr: 0.028, type: 'factory' },
  { rx: 0.88, ry: 0.55, rr: 0.026, type: 'town' },
  { rx: 0.14, ry: 0.72, rr: 0.028, type: 'farm' },
  { rx: 0.42, ry: 0.78, rr: 0.027, type: 'town' },
  { rx: 0.62, ry: 0.82, rr: 0.028, type: 'farm' },
  { rx: 0.86, ry: 0.80, rr: 0.027, type: 'factory' }
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
  const raw = layout && layout.length ? layout : DEFAULT_LAYOUT;
  const slots = ensureIndustryChains(raw);
  let townIdx = 0;
  return slots.map((slot, i) => {
    const type = PLACE_TYPES[slot.type] || PLACE_TYPES.town;
    const pool = NAME_POOLS[slot.type] || NAME_POOLS.town;
    const name = pickName(pool, used, rng);
    let spriteKey = type.id;
    if (type.id === 'town') {
      const variants = ['town', 'town2', 'town3'];
      spriteKey = variants[townIdx % variants.length];
      townIdx++;
    }
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
      spriteKey,
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
/** Cargo sinks: where factories/farms can deliver */
export const CARGO_SINKS = new Set(['harbor', 'capital', 'town', 'factory']);
export const CARGO_SOURCES = new Set(['farm', 'factory', 'harbor']);

export function isCargoSink(place) {
  return CARGO_SINKS.has(place?.type);
}

export function isCargoSource(place) {
  return CARGO_SOURCES.has(place?.type);
}

/**
 * Ensure layout has delivery chains: every factory needs a non-factory sink
 * (harbor/capital/town) and preferably a farm source.
 * Mutates/returns a safe layout.
 */
export function ensureIndustryChains(layout) {
  if (!layout?.length) return layout;
  const types = layout.map(s => s.type);
  const hasFactory = types.includes('factory');
  const hasFarm = types.includes('farm');
  const hasSink = types.some(t => t === 'harbor' || t === 'capital' || t === 'town');
  const out = layout.map(s => ({ ...s }));

  if (hasFactory && !hasSink) {
    // Convert one factory to town so there is a delivery place
    const fi = out.findIndex(s => s.type === 'factory');
    if (fi >= 0) {
      out[fi] = { ...out[fi], type: 'town', rr: out[fi].rr || 0.032 };
    }
  }
  if (hasFactory && !hasFarm) {
    // Prefer a farm for inbound goods – convert a spare town if 2+ towns
    const towns = out.map((s, i) => (s.type === 'town' ? i : -1)).filter(i => i >= 0);
    if (towns.length >= 2) {
      out[towns[towns.length - 1]] = {
        ...out[towns[towns.length - 1]],
        type: 'farm'
      };
    }
  }
  // At least one harbor if factories exist (classic TTD goods out)
  if (hasFactory && !types.includes('harbor') && !out.some(s => s.type === 'harbor')) {
    // If still no harbor after mutations, convert farthest factory-adjacent slot
    const capital = out.find(s => s.type === 'capital');
    let bestI = -1;
    let bestD = -1;
    out.forEach((s, i) => {
      if (s.type === 'town' || s.type === 'farm') {
        const d = capital
          ? Math.hypot(s.rx - capital.rx, s.ry - capital.ry)
          : s.rx;
        if (d > bestD) {
          bestD = d;
          bestI = i;
        }
      }
    });
    if (bestI >= 0 && !out.some(s => s.type === 'harbor')) {
      // Prefer coast-ish: leftmost or rightmost
      const edge = out.reduce((a, s, i) => (s.rx < out[a].rx ? i : a), 0);
      if (out[edge].type !== 'capital' && out[edge].type !== 'factory') {
        out[edge] = { ...out[edge], type: 'harbor', rr: 0.034 };
      }
    }
  }
  return out;
}

export function jobRouteScore(from, to, typeKey) {
  const ft = from.type || 'town';
  const tt = to.type || 'town';
  let s = 0;

  if (typeKey === 'cargo') {
    // Farm → factory (raw); factory → harbor/capital/town (finished goods)
    if (ft === 'farm' && tt === 'factory') s += 110;
    if (ft === 'farm' && (tt === 'harbor' || tt === 'capital')) s += 70;
    if (ft === 'factory' && tt === 'harbor') s += 120;
    if (ft === 'factory' && (tt === 'capital' || tt === 'town')) s += 95;
    if (ft === 'harbor' && tt === 'factory') s += 80;
    if (ft === 'harbor' && tt === 'capital') s += 60;
    if (ft === 'town' && tt === 'factory') s += 35;
    // Dead ends / nonsense
    if (ft === 'factory' && tt === 'farm') s -= 80;
    if (ft === 'factory' && tt === 'factory') s -= 40;
    if (ft === 'farm' && tt === 'farm') s -= 50;
    s += ((from.cargo || 1) + (to.cargo || 1)) * 12;
  } else {
    if ((ft === 'town' || ft === 'capital') && (tt === 'town' || tt === 'capital')) s += 85;
    if (ft === 'capital' || tt === 'capital') s += 25;
    if ((ft === 'harbor' || tt === 'harbor') && (ft === 'town' || tt === 'town' || ft === 'capital' || tt === 'capital')) s += 40;
    if ((ft === 'town' || ft === 'capital') && tt === 'factory') s += 70; // workers in
    if (ft === 'factory' && (tt === 'town' || tt === 'capital')) s += 55; // workers home
    if (ft === 'farm' && typeKey === 'passengers') s -= 25;
    s += ((from.passengers || 1) + (to.passengers || 1)) * 10;
  }
  return s;
}

/** Pick a good cargo destination for a factory (must exist on map) */
export function pickFactorySink(districts, factory, existingJobs = []) {
  const sinks = districts.filter(
    d => d !== factory && (d.type === 'harbor' || d.type === 'capital' || d.type === 'town')
  );
  if (!sinks.length) return null;
  let best = null;
  let bestS = -Infinity;
  for (const to of sinks) {
    const routeJobs = existingJobs.filter(
      j => j.active && j.from.name === factory.name && j.to.name === to.name
    ).length;
    const preferHarbor = to.type === 'harbor' ? 40 : to.type === 'capital' ? 20 : 10;
    const s = preferHarbor - routeJobs * 30 + Math.random() * 8;
    if (s > bestS) {
      bestS = s;
      best = to;
    }
  }
  return best;
}
