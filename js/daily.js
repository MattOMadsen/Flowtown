/**
 * IMP-A1: Soft daily mini-goal (localStorage, no dark patterns).
 */

const DAILY_KEY = 'flowtown-daily-v1';

const POOL = [
  { id: 'deliver_12', type: 'deliver', amount: 12, label: 'Lever 12 enheder i dag', icon: '📦', xp: 14, money: 40 },
  { id: 'deliver_20', type: 'deliver', amount: 20, label: 'Lever 20 enheder i dag', icon: '📦', xp: 20, money: 55 },
  { id: 'jobs_2', type: 'jobs', amount: 2, label: 'Fuldfør 2 opgaver i dag', icon: '✅', xp: 12, money: 35 },
  { id: 'jobs_4', type: 'jobs', amount: 4, label: 'Fuldfør 4 opgaver i dag', icon: '✅', xp: 18, money: 50 },
  { id: 'score_200', type: 'score', amount: 200, label: 'Tjen 200 score i dag', icon: '⭐', xp: 12, money: 30 },
  { id: 'score_400', type: 'score', amount: 400, label: 'Tjen 400 score i dag', icon: '⭐', xp: 18, money: 45 },
  { id: 'buy_1', type: 'buy', amount: 1, label: 'Køb 1 bil i dag', icon: '🚗', xp: 10, money: 25 },
  { id: 'flow_20', type: 'flow_hold', amount: 20, label: 'Hold flow ≥65% i 20s', icon: '💨', xp: 16, money: 40 }
];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashDate(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickGoal(dateStr) {
  const rng = mulberry32(hashDate(dateStr) ^ 0xf10a7);
  return POOL[Math.floor(rng() * POOL.length)];
}

function defaultState(dateStr) {
  const goal = pickGoal(dateStr);
  return {
    date: dateStr,
    goalId: goal.id,
    type: goal.type,
    amount: goal.amount,
    label: goal.label,
    icon: goal.icon,
    xp: goal.xp,
    money: goal.money,
    progress: 0,
    claimed: false,
    /** Soft streak: consecutive days claimed */
    streak: 0
  };
}

export function loadDaily() {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) {
      const s = defaultState(today);
      saveDaily(s);
      return s;
    }
    const data = JSON.parse(raw);
    if (!data || data.date !== today) {
      const prev = data;
      const s = defaultState(today);
      // Soft streak only if claimed yesterday
      if (prev?.claimed && prev.date) {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yk = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
        if (prev.date === yk) s.streak = (prev.streak | 0) + 1;
      }
      saveDaily(s);
      return s;
    }
    return {
      ...defaultState(today),
      ...data,
      date: today
    };
  } catch {
    const s = defaultState(today);
    saveDaily(s);
    return s;
  }
}

export function saveDaily(state) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * Apply session deltas to daily progress (idempotent max).
 * @param {object} state
 * @param {{ delivered?: number, jobs?: number, score?: number, buys?: number, flowHold?: number }} delta
 */
export function applyDailyProgress(state, delta = {}) {
  if (!state || state.claimed) return state;
  let p = state.progress | 0;
  if (state.type === 'deliver' && delta.delivered != null) p = Math.max(p, delta.delivered | 0);
  if (state.type === 'jobs' && delta.jobs != null) p = Math.max(p, delta.jobs | 0);
  if (state.type === 'score' && delta.score != null) p = Math.max(p, delta.score | 0);
  if (state.type === 'buy' && delta.buys != null) p = Math.max(p, delta.buys | 0);
  if (state.type === 'flow_hold' && delta.flowHold != null) p = Math.max(p, Math.floor(delta.flowHold));
  state.progress = Math.min(state.amount, p);
  saveDaily(state);
  return state;
}

export function isDailyComplete(state) {
  return !!state && (state.progress | 0) >= (state.amount | 0);
}

/**
 * Claim reward once. Mutates state.
 * @returns {{ ok: boolean, xp?: number, money?: number, streak?: number, reason?: string }}
 */
export function claimDaily(state) {
  if (!state) return { ok: false, reason: 'none' };
  if (state.claimed) return { ok: false, reason: 'claimed' };
  if (!isDailyComplete(state)) return { ok: false, reason: 'incomplete' };
  state.claimed = true;
  // streak was carried from yesterday on rollover; ensure at least 1 when claiming
  if ((state.streak | 0) < 1) state.streak = 1;
  saveDaily(state);
  const bonus = Math.min(30, (state.streak | 0) * 4);
  return {
    ok: true,
    xp: (state.xp | 0) + Math.floor(bonus / 2),
    money: (state.money | 0) + bonus,
    streak: state.streak | 0
  };
}

export function dailyUi(state) {
  if (!state) return null;
  const need = state.amount | 0;
  const prog = Math.min(need, state.progress | 0);
  return {
    label: state.label,
    icon: state.icon,
    progress: prog,
    amount: need,
    ratio: need > 0 ? prog / need : 0,
    complete: isDailyComplete(state),
    claimed: !!state.claimed,
    streak: state.streak | 0,
    xp: state.xp,
    money: state.money
  };
}
