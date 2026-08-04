/**
 * Gem / genindlæs igangværende spil (veje, penge, jobs, flåde).
 */

const SESSION_KEY = 'flowtown-session-v1';

export function hasSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return !!(data && data.scenarioId && Array.isArray(data.roads));
  } catch {
    return false;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export function loadSessionRaw() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.scenarioId) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {import('./game.js').Game} game
 */
export function serializeSession(game) {
  if (!game || !game.scenarioId || !game.running) return null;
  const roads = (game.roads || [])
    .filter(r => r.owner === 'player' || !r.owner)
    .map(r => ({
      id: r.id,
      points: (r.points || []).map(p => ({ x: p.x, y: p.y })),
      owner: r.owner || 'player',
      lanes: r.lanes || 2,
      isBridge: !!r.isBridge,
      paidCost: r.paidCost || 0,
      oneWay: r.oneWay === -1 || r.oneWay === 1 ? r.oneWay : 0,
      hasLight: !!r.hasLight
    }));

  const jobs = (game.jobs || [])
    .filter(j => j.active)
    .map(j => ({
      id: j.id,
      type: j.type,
      fromName: j.from?.name,
      toName: j.to?.name,
      amount: j.amount,
      delivered: j.delivered,
      reward: j.reward,
      active: true
    }));

  const fleet = (game.getPlayerFleet?.() || []).map(v => ({
    id: v.id,
    classId: v.classId,
    upgradeRank: v.upgradeRank | 0,
    homeName: v.homeName,
    parkName: v.parkName || v.homeName,
    x: v.x,
    y: v.y
  }));

  const growth = (game.districts || []).map(d => ({
    name: d.name,
    growth: d.growth | 0,
    deliveriesHere: d.deliveriesHere | 0,
    buildings: d.buildings
      ? {
          station: !!d.buildings.station,
          warehouse: !!d.buildings.warehouse,
          depot: !!d.buildings.depot
        }
      : null
  }));

  return {
    version: 1,
    savedAt: Date.now(),
    scenarioId: game.scenarioId,
    botsEnabled: !!game.botsEnabled,
    money: Math.floor(game.money),
    playerScore: game.playerScore | 0,
    arrivedCount: game.arrivedCount | 0,
    playerDelivered: game.playerDelivered | 0,
    jobsCompleted: game.jobsCompleted | 0,
    sessionTime: game.sessionTime || 0,
    camera: {
      x: game.camera?.x || 0,
      y: game.camera?.y || 0,
      zoom: game.camera?.zoom || 1
    },
    roads,
    jobs,
    fleet,
    growth
  };
}

export function saveSession(game) {
  const data = serializeSession(game);
  if (!data) return false;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function sessionSummary(data) {
  if (!data) return '';
  const roads = data.roads?.length || 0;
  const fleet = data.fleet?.length || 0;
  const money = data.money ?? 0;
  const name = data.scenarioId || '?';
  return `${name} · $${money} · ${roads} veje · ${fleet} biler`;
}
