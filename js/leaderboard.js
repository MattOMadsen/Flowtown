/**
 * P3-3/4: Lokal leaderboard (localStorage).
 * Klar til senere cloud – API er allerede score-baseret.
 */

const LB_KEY = 'flowtown-leaderboard-v1';
const NAME_KEY = 'flowtown-player-name';
const MAX_ENTRIES = 12;

export function getPlayerName() {
  try {
    const n = localStorage.getItem(NAME_KEY);
    if (n && n.trim()) return n.trim().slice(0, 16);
  } catch { /* ignore */ }
  return 'Spiller';
}

export function setPlayerName(name) {
  const n = String(name || 'Spiller').trim().slice(0, 16) || 'Spiller';
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch { /* ignore */ }
  return n;
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(LB_KEY);
    if (!raw) return { version: 1, global: [], byScenario: {} };
    const data = JSON.parse(raw);
    return {
      version: 1,
      global: Array.isArray(data.global) ? data.global : [],
      byScenario: data.byScenario && typeof data.byScenario === 'object' ? data.byScenario : {}
    };
  } catch {
    return { version: 1, global: [], byScenario: {} };
  }
}

function saveRaw(data) {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Score-sort: stars desc, then score desc, then delivered desc, then newer first
 */
function sortEntries(list) {
  return [...list].sort((a, b) => {
    if ((b.stars | 0) !== (a.stars | 0)) return (b.stars | 0) - (a.stars | 0);
    if ((b.score | 0) !== (a.score | 0)) return (b.score | 0) - (a.score | 0);
    if ((b.delivered | 0) !== (a.delivered | 0)) return (b.delivered | 0) - (a.delivered | 0);
    return (b.at | 0) - (a.at | 0);
  });
}

function entryKey(e) {
  return `${e.name}|${e.scenarioId || ''}|${e.stars}|${e.score}|${e.delivered}`;
}

/**
 * Submit a run. Dedupes near-identical spam within same session.
 * @returns {{ improved: boolean, rank: number, entry: object }}
 */
export function submitScore({
  name,
  scenarioId,
  scenarioName,
  score,
  delivered,
  stars,
  money,
  jobsCompleted
}) {
  const data = loadRaw();
  const entry = {
    name: (name || getPlayerName()).slice(0, 16),
    scenarioId: scenarioId || 'freeplay',
    scenarioName: scenarioName || scenarioId || 'Bane',
    score: Math.max(0, score | 0),
    delivered: Math.max(0, delivered | 0),
    stars: Math.max(0, Math.min(3, stars | 0)),
    money: Math.max(0, money | 0),
    jobsCompleted: Math.max(0, jobsCompleted | 0),
    at: Date.now()
  };

  // Global board
  data.global.push(entry);
  data.global = sortEntries(data.global).slice(0, MAX_ENTRIES);

  // Per-scenario
  const sid = entry.scenarioId;
  if (!data.byScenario[sid]) data.byScenario[sid] = [];
  data.byScenario[sid].push(entry);
  data.byScenario[sid] = sortEntries(data.byScenario[sid]).slice(0, MAX_ENTRIES);

  saveRaw(data);

  const board = data.byScenario[sid];
  const rank = board.findIndex(e => e.at === entry.at && e.name === entry.name) + 1;
  const improved = rank > 0 && rank <= 3;
  return { improved, rank: rank || board.length, entry, board };
}

export function getLeaderboard(scenarioId = null) {
  const data = loadRaw();
  if (scenarioId) {
    return sortEntries(data.byScenario[scenarioId] || []).slice(0, MAX_ENTRIES);
  }
  return sortEntries(data.global).slice(0, MAX_ENTRIES);
}

export function getBestForScenario(scenarioId) {
  const list = getLeaderboard(scenarioId);
  return list[0] || null;
}

/** Text line to copy/share (no backend multiplayer yet) */
export function formatShareLine(entry) {
  if (!entry) return '';
  const stars = '★'.repeat(entry.stars | 0) + '☆'.repeat(3 - (entry.stars | 0));
  return `Flowtown – ${entry.scenarioName}: ${stars} · score ${entry.score} · ${entry.delivered} leveret (${entry.name})`;
}

export function clearLeaderboard() {
  try {
    localStorage.removeItem(LB_KEY);
  } catch { /* ignore */ }
}

/* ─── P3-4: simpel cloud via JSONBlob (gratis, ingen API-nøgle) ─── */

const CLOUD_KEY = 'flowtown-cloud-blob-id';
const JSONBLOB = 'https://jsonblob.com/api/jsonBlob';

export function getCloudCode() {
  try {
    return localStorage.getItem(CLOUD_KEY) || '';
  } catch {
    return '';
  }
}

export function setCloudCode(id) {
  try {
    if (id) localStorage.setItem(CLOUD_KEY, id);
    else localStorage.removeItem(CLOUD_KEY);
  } catch { /* ignore */ }
}

function mergeBoards(a, b) {
  const map = new Map();
  for (const e of [...(a || []), ...(b || [])]) {
    const k = `${e.name}|${e.scenarioId}|${e.score}|${e.stars}|${e.delivered}`;
    const prev = map.get(k);
    if (!prev || (e.at | 0) > (prev.at | 0)) map.set(k, e);
  }
  return sortEntries([...map.values()]).slice(0, MAX_ENTRIES);
}

/**
 * Publish local scores to cloud. Creates or updates blob.
 * @returns {Promise<{ ok: boolean, code?: string, error?: string }>}
 */
export async function publishToCloud() {
  const data = loadRaw();
  const payload = {
    version: 1,
    app: 'flowtown',
    updatedAt: Date.now(),
    global: data.global,
    byScenario: data.byScenario
  };
  const code = getCloudCode();
  try {
    if (code) {
      const res = await fetch(`${JSONBLOB}/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, code };
    }
    const res = await fetch(JSONBLOB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Location: .../jsonBlob/<id>
    const loc = res.headers.get('Location') || res.headers.get('location') || '';
    const m = loc.match(/jsonBlob\/([^/?#]+)/i);
    let id = m ? m[1] : '';
    if (!id) {
      try {
        const j = await res.json();
        id = j.id || j.blobId || '';
      } catch { /* ignore */ }
    }
    if (!id) throw new Error('Ingen cloud-kode i svar');
    setCloudCode(id);
    return { ok: true, code: id };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Pull cloud board and merge into local.
 * @param {string} [code]
 * @returns {Promise<{ ok: boolean, merged?: number, error?: string }>}
 */
export async function pullFromCloud(code = null) {
  const id = (code || getCloudCode() || '').trim();
  if (!id) return { ok: false, error: 'Mangler cloud-kode' };
  try {
    const res = await fetch(`${JSONBLOB}/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = await res.json();
    if (!remote || remote.app !== 'flowtown') {
      // still accept if it has global array
      if (!Array.isArray(remote?.global)) throw new Error('Ugyldig cloud-data');
    }
    const local = loadRaw();
    local.global = mergeBoards(local.global, remote.global || []);
    const scen = { ...(local.byScenario || {}) };
    for (const [k, list] of Object.entries(remote.byScenario || {})) {
      scen[k] = mergeBoards(scen[k] || [], list || []);
    }
    local.byScenario = scen;
    saveRaw(local);
    setCloudCode(id);
    return { ok: true, merged: (remote.global || []).length, code: id };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Export compact pack for clipboard (offline fallback) */
export function exportPack() {
  const data = loadRaw();
  const json = JSON.stringify({
    v: 1,
    app: 'flowtown',
    g: data.global,
    s: data.byScenario
  });
  try {
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return json;
  }
}

export function importPack(raw) {
  try {
    let text = String(raw || '').trim();
    if (!text) return { ok: false, error: 'Tom pakke' };
    let data;
    try {
      data = JSON.parse(decodeURIComponent(escape(atob(text))));
    } catch {
      data = JSON.parse(text);
    }
    if (!data || (data.app && data.app !== 'flowtown')) {
      if (!data?.g && !data?.global) return { ok: false, error: 'Ugyldig pakke' };
    }
    const local = loadRaw();
    local.global = mergeBoards(local.global, data.g || data.global || []);
    const scen = { ...(local.byScenario || {}) };
    for (const [k, list] of Object.entries(data.s || data.byScenario || {})) {
      scen[k] = mergeBoards(scen[k] || [], list || []);
    }
    local.byScenario = scen;
    saveRaw(local);
    return { ok: true, merged: (data.g || data.global || []).length };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke læse pakke' };
  }
}
