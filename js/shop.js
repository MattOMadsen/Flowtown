/**
 * PROG-B2: Global shop – level unlocks, $ buys.
 * Buffs = permanent meta; bygninger = placeres på en by (session).
 */

export const SHOP_ITEMS = [
  {
    id: 'roads_cheap',
    kind: 'buff',
    icon: '🛤️',
    label: 'Billigere veje',
    desc: '−15 % pris på nye veje og broer',
    price: 180,
    unlockLevel: 2,
    once: true
  },
  {
    id: 'snap_boost',
    kind: 'buff',
    icon: '🧲',
    label: 'Snap-booster',
    desc: '+45 % snap-radius ved tegning',
    price: 150,
    unlockLevel: 2,
    once: true
  },
  {
    id: 'tourist_office',
    kind: 'buff',
    icon: '🧳',
    label: 'Turistbureau',
    desc: 'Flere person-/turist-jobs globalt',
    price: 210,
    unlockLevel: 3,
    once: true
  },
  {
    id: 'cargo_hub',
    kind: 'buff',
    icon: '📦',
    label: 'Logistik-hub',
    desc: 'Flere gods-jobs globalt',
    price: 230,
    unlockLevel: 3,
    once: true
  },
  {
    id: 'build_station',
    kind: 'building',
    building: 'station',
    icon: '🚉',
    label: 'Station',
    desc: 'I en by: +passager-demand og vækst',
    price: 165,
    unlockLevel: 3,
    once: false
  },
  {
    id: 'build_warehouse',
    kind: 'building',
    building: 'warehouse',
    icon: '🏭',
    label: 'Lager',
    desc: 'I en by: +gods-demand og vækst',
    price: 165,
    unlockLevel: 3,
    once: false
  },
  {
    id: 'build_depot',
    kind: 'building',
    building: 'depot',
    icon: '🚏',
    label: 'Depot',
    desc: 'I en by: hurtigere job-assign for biler her',
    price: 195,
    unlockLevel: 4,
    once: false
  }
];

export const BUILDING_META = {
  station: { id: 'station', icon: '🚉', label: 'Station', color: '#2563eb' },
  warehouse: { id: 'warehouse', icon: '🏭', label: 'Lager', color: '#b45309' },
  depot: { id: 'depot', icon: '🚏', label: 'Depot', color: '#0f766e' }
};

export function getShopItem(id) {
  return SHOP_ITEMS.find(i => i.id === id) || null;
}

export function hasShopBuff(meta, buffId) {
  return !!(meta?.shopOwned && meta.shopOwned[buffId]);
}

/**
 * Catalog rows for UI.
 * @param {{ level: number, money: number, shopOwned?: object }} meta
 * @param {{ hasDistrict?: boolean, districtBuildings?: object }} [ctx]
 */
export function getShopCatalog(meta, ctx = {}) {
  const level = meta?.level || 1;
  const owned = meta?.shopOwned || {};
  const money = meta?.money != null ? meta.money : Infinity;
  return SHOP_ITEMS.map(item => {
    const unlocked = level >= (item.unlockLevel || 1);
    const already = item.once && !!owned[item.id];
    let canBuy = unlocked && !already && money >= item.price;
    let blockReason = null;
    if (!unlocked) blockReason = `Level ${item.unlockLevel}`;
    else if (already) blockReason = 'Købt';
    else if (money < item.price) blockReason = 'Penge';
    if (item.kind === 'building' && canBuy) {
      if (!ctx.hasDistrict) {
        canBuy = false;
        blockReason = 'Vælg by først';
      } else if (ctx.districtBuildings?.[item.building]) {
        canBuy = false;
        blockReason = 'Allerede i byen';
      }
    }
    return {
      ...item,
      unlocked,
      owned: already,
      canBuy,
      blockReason
    };
  });
}
