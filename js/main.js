import { Game } from './game.js';
import { upgradePrice, sellPriceForClass } from './fleet.js';
import { loadGameAssets } from './assets.js';
import {
  unlockAudio,
  isMuted,
  toggleMute,
  playUi
} from './audio.js';
import {
  hasSavedSession,
  loadSessionRaw,
  saveSession,
  clearSession,
  sessionSummary
} from './session.js';
import {
  TUTORIAL_STEPS,
  shouldShowTutorial,
  setTutorialDone
} from './tutorial.js';
import {
  getCloudCode,
  publishToCloud,
  pullFromCloud,
  exportPack,
  importPack
} from './leaderboard.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
loadGameAssets().then(() => game.requestDraw?.());

// Unlock audio on first gesture
const unlockOnce = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', unlockOnce, true);
};
window.addEventListener('pointerdown', unlockOnce, true);

// UI buttons
document.getElementById('btn-undo').addEventListener('click', () => { playUi(); game.undo(); });
document.getElementById('btn-clear').addEventListener('click', () => { playUi(); game.clearRoads(); });
document.getElementById('btn-toggle').addEventListener('click', (e) => {
  playUi();
  game.togglePause();
  e.target.textContent = game.paused ? 'Play' : 'Pause';
});

// Mute
const btnMute = document.getElementById('btn-mute');
function refreshMuteBtn() {
  if (!btnMute) return;
  const m = isMuted();
  btnMute.setAttribute('aria-pressed', m ? 'true' : 'false');
  btnMute.title = m ? 'Lyd er slået fra' : 'Lyd er slået til';
  const img = document.getElementById('mute-icon-img');
  const fb = document.getElementById('mute-icon-fallback');
  if (img) {
    img.style.opacity = m ? '0.35' : '1';
    img.style.filter = m ? 'grayscale(1)' : '';
  }
  if (fb) {
    fb.textContent = m ? '🔇' : '🔊';
    // keep icon img primary; fallback only if img missing
    fb.classList.add('hidden');
  }
}
refreshMuteBtn();
btnMute?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleMute();
  refreshMuteBtn();
  if (!isMuted()) playUi();
});

const btnDraw = document.getElementById('btn-draw');
const btnErase = document.getElementById('btn-erase');
const btnUpgrade = document.getElementById('btn-upgrade');
const btnBridge = document.getElementById('btn-bridge');
const btnOneway = document.getElementById('btn-oneway');
const btnLight = document.getElementById('btn-light');
const btnBots = document.getElementById('btn-bots');
const botPanel = document.getElementById('bot-panel');
const hudEl = document.getElementById('ui');

function setMode(mode) {
  // pan mode removed from primary UX – keep for API safety
  if (mode === 'pan') mode = 'draw';
  game.setMode(mode);
  const ring = (btn, on, color) => {
    if (!btn) return;
    btn.classList.toggle('ring-2', on);
    btn.classList.toggle('ring-emerald-500', on && color === 'emerald');
    btn.classList.toggle('ring-rose-500', on && color === 'rose');
    btn.classList.toggle('ring-sky-500', on && color === 'sky');
    btn.classList.toggle('ring-cyan-500', on && color === 'cyan');
    btn.classList.toggle('ring-amber-500', on && color === 'amber');
    btn.classList.toggle('ring-violet-500', on && color === 'violet');
    btn.classList.toggle('is-active', on);
  };
  ring(btnDraw, mode === 'draw', 'emerald');
  ring(btnErase, mode === 'erase', 'rose');
  ring(btnUpgrade, mode === 'upgrade', 'sky');
  ring(btnBridge, mode === 'bridge', 'cyan');
  ring(btnOneway, mode === 'oneway', 'amber');
  ring(btnLight, mode === 'light', 'violet');
  canvas.style.cursor =
    (mode === 'draw' || mode === 'bridge') ? 'crosshair' : 'pointer';
}

const morePanel = document.getElementById('more-panel');
const btnMore = document.getElementById('btn-more');
let moreOpen = false;

function setMoreOpen(on) {
  moreOpen = !!on;
  if (morePanel) morePanel.classList.toggle('hidden', !moreOpen);
  if (btnMore) {
    btnMore.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
    btnMore.classList.toggle('is-active', moreOpen);
  }
}

function closeMore() {
  setMoreOpen(false);
}

btnMore?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  playUi();
  setMoreOpen(!moreOpen);
});

// Luk mere-menu ved tryk udenfor
document.addEventListener('pointerdown', (e) => {
  if (!moreOpen) return;
  const wrap = document.querySelector('.hud-more-wrap');
  if (wrap && !wrap.contains(e.target)) closeMore();
}, true);

btnDraw.addEventListener('click', () => { closeMore(); setMode('draw'); });
btnErase.addEventListener('click', () => { closeMore(); setMode('erase'); });
if (btnUpgrade) btnUpgrade.addEventListener('click', () => { closeMore(); setMode('upgrade'); });
if (btnBridge) btnBridge.addEventListener('click', () => { closeMore(); setMode('bridge'); });
if (btnOneway) btnOneway.addEventListener('click', () => { setMode('oneway'); closeMore(); });
if (btnLight) btnLight.addEventListener('click', () => { setMode('light'); closeMore(); });
setMode('draw');

// Flaskehals-strip
function refreshBottleneckUi() {
  const strip = document.getElementById('bottleneck-strip');
  const text = document.getElementById('bottleneck-text');
  if (!strip) return;
  const ui = game.getBottleneckUi?.() || { active: false };
  strip.classList.toggle('hidden', !ui.active);
  if (ui.active && text) {
    text.textContent = `${ui.text}${ui.dens != null ? ` · ${ui.dens}` : ''}`;
    strip.classList.toggle('is-critical', !!ui.critical);
  }
}
document.getElementById('bottleneck-go')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  playUi();
  game.focusBottleneck?.();
});

// HUD offset for pan arrows / bot panel (menu forsvinder IKKE automatisk)
function setHudCompact(on) {
  if (!hudEl) return;
  hudEl.classList.toggle('hud-compact', !!on);
  updateHudOffset();
}
function updateHudOffset() {
  if (!hudEl) return;
  document.documentElement.style.setProperty(
    '--hud-offset',
    `${Math.ceil(hudEl.getBoundingClientRect().height) + 8}px`
  );
}
// Manuel mini/udvid – aldrig auto ved pan/zoom
document.getElementById('btn-hud-expand')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setHudCompact(false);
});
document.getElementById('btn-hud-mini')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setHudCompact(true);
});
hudEl?.querySelector('.hud-status')?.addEventListener('click', () => {
  if (hudEl.classList.contains('hud-compact')) setHudCompact(false);
});

// Edge pan arrows (+ hold to repeat)
function bindPanEdge(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  let hold = null;
  const step = () => game.panNudge?.(dir);
  const start = (e) => {
    e.preventDefault();
    e.stopPropagation();
    step();
    clearInterval(hold);
    hold = setInterval(step, 140);
  };
  const stop = () => {
    clearInterval(hold);
    hold = null;
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}
bindPanEdge('pan-left', 'left');
bindPanEdge('pan-right', 'right');
bindPanEdge('pan-up', 'up');
bindPanEdge('pan-down', 'down');

function updateBotButton() {
  const on = game.botsEnabled;
  if (btnBots) {
    btnBots.textContent = on ? '🤖✓' : '🤖';
    btnBots.title = on ? 'Bots: til' : 'Bots: fra';
    btnBots.classList.toggle('is-active', on);
    btnBots.classList.toggle('ring-2', on);
    btnBots.classList.toggle('ring-rose-500', on);
  }
  botPanel.classList.toggle('hidden', !on);
}

btnBots.addEventListener('click', () => {
  game.toggleBots();
  updateBotButton();
});

let selectedScenarioId = 'intro';
let lastStarsShown = -1;

function starString(n) {
  const s = Math.max(0, Math.min(3, n | 0));
  return '★'.repeat(s) + '☆'.repeat(3 - s);
}

function renderScenarioList() {
  const list = document.getElementById('scenario-list');
  if (!list || !game.listScenariosForUi) return;
  const items = game.listScenariosForUi();
  list.innerHTML = items.map(s => {
    const locked = s.locked;
    const sel = s.id === selectedScenarioId;
    return `
      <button type="button" data-scenario="${s.id}"
        class="w-full text-left p-3 rounded-xl border transition touch-manipulation
          ${locked ? 'opacity-50 border-stone-200 bg-stone-50' : sel ? 'border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50' : 'border-stone-200 bg-white hover:border-stone-300'}"
        ${locked ? 'disabled' : ''}>
        <div class="flex justify-between gap-2 items-start">
          <span class="font-semibold text-stone-800 text-sm">${escapeHtml(s.name)}</span>
          <span class="text-amber-500 text-xs font-bold shrink-0">${locked ? '🔒 Lv' + s.unlockLevel : starString(s.stars)}</span>
        </div>
        <p class="text-[11px] text-stone-500 mt-0.5">${escapeHtml(s.blurb || '')}</p>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-scenario]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedScenarioId = btn.getAttribute('data-scenario');
      renderScenarioList();
      startGame();
    });
  });
}

function startGame() {
  const help = document.getElementById('help');
  if (help) help.style.display = 'none';
  const withBots = !!document.getElementById('start-with-bots')?.checked;
  clearSession(); // nyt spil overskriver gammelt save
  game.loadScenario(selectedScenarioId, { bots: withBots });
  if (game.scenario?.forceBotsHint && !withBots) {
    game.showToast?.('Tip: slå bots til for ekstra kaos i Nat-rush', 3.0);
  }
  updateBotButton();
  game.start();
  lastStarsShown = -1;
  const goalsPanel = document.getElementById('goals-panel');
  if (goalsPanel) goalsPanel.classList.toggle('hidden', !!game.scenario?.freeplay);
  refreshGoalsUi();
  saveSession(game);
  maybeStartTutorial();
}

function continueGame() {
  const data = loadSessionRaw();
  if (!data) return;
  const help = document.getElementById('help');
  if (help) help.style.display = 'none';
  selectedScenarioId = data.scenarioId;
  game.restoreSession(data);
  updateBotButton();
  lastStarsShown = -1;
  const goalsPanel = document.getElementById('goals-panel');
  if (goalsPanel) goalsPanel.classList.toggle('hidden', !!game.scenario?.freeplay);
  refreshGoalsUi();
  playUi();
}

function refreshContinueButton() {
  const btn = document.getElementById('btn-continue');
  const sum = document.getElementById('continue-summary');
  const data = hasSavedSession() ? loadSessionRaw() : null;
  if (!btn) return;
  if (data) {
    btn.classList.remove('hidden');
    if (sum) {
      sum.classList.remove('hidden');
      sum.textContent = sessionSummary(data);
    }
  } else {
    btn.classList.add('hidden');
    if (sum) sum.classList.add('hidden');
  }
}

document.getElementById('btn-continue')?.addEventListener('click', (e) => {
  e.preventDefault();
  continueGame();
});

function openMapSelect() {
  if (game.running) saveSession(game);
  game.running = false;
  game.closeDistrictSheet?.();
  const help = document.getElementById('help');
  if (help) help.style.display = 'flex';
  const end = document.getElementById('end-panel');
  if (end) {
    end.classList.add('hidden');
    end.classList.remove('flex');
  }
  hideTutorial();
  renderScenarioList();
  refreshContinueButton();
}

// --- Tutorial ---
let tutStep = 0;
function hideTutorial() {
  const el = document.getElementById('tutorial');
  if (el) el.classList.add('hidden');
}
function showTutorialStep(i) {
  const el = document.getElementById('tutorial');
  if (!el) return;
  const step = TUTORIAL_STEPS[i];
  if (!step) {
    setTutorialDone();
    hideTutorial();
    return;
  }
  tutStep = i;
  el.classList.remove('hidden');
  const title = document.getElementById('tut-title');
  const body = document.getElementById('tut-body');
  const hint = document.getElementById('tut-hint');
  if (title) title.textContent = step.title;
  if (body) body.textContent = step.body;
  if (hint) hint.textContent = step.hint;
  const next = document.getElementById('tut-next');
  if (next) next.textContent = i >= TUTORIAL_STEPS.length - 1 ? 'Kom i gang!' : 'Næste';
  const dots = document.getElementById('tut-dots');
  if (dots) {
    dots.innerHTML = TUTORIAL_STEPS.map((_, di) =>
      `<span class="inline-block w-1.5 h-1.5 rounded-full ${di === i ? 'bg-emerald-500' : 'bg-stone-300'}"></span>`
    ).join('');
  }
}
function maybeStartTutorial() {
  if (!shouldShowTutorial()) return;
  showTutorialStep(0);
}
document.getElementById('tut-next')?.addEventListener('click', (e) => {
  e.preventDefault();
  playUi();
  if (tutStep >= TUTORIAL_STEPS.length - 1) {
    setTutorialDone();
    hideTutorial();
  } else {
    showTutorialStep(tutStep + 1);
  }
});
document.getElementById('tut-skip')?.addEventListener('click', (e) => {
  e.preventDefault();
  playUi();
  setTutorialDone();
  hideTutorial();
});

function refreshGoalsUi() {
  const ui = game.getGoalsUi?.();
  const panel = document.getElementById('goals-panel');
  if (!ui || !panel) return;
  if (ui.freeplay) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  // ensure layout class
  panel.classList.add('hud-goals');
  const title = document.getElementById('goals-title');
  if (title) title.textContent = ui.scenarioName || 'Mål';
  const stars = document.getElementById('goals-stars');
  if (stars) stars.textContent = starString(ui.stars);
  const list = document.getElementById('goals-list');
  if (list) {
    list.innerHTML = (ui.details || []).map(d => `
      <li class="flex justify-between gap-2 ${d.done ? 'text-emerald-700 font-medium' : ''}">
        <span class="truncate">${d.done ? '✓' : '○'} ${escapeHtml(d.label)}</span>
        <span class="tabular-nums shrink-0 text-stone-500">${escapeHtml(d.progress)}</span>
      </li>`).join('');
    // Keep collapsed unless user opened
    list.classList.toggle('hidden', !goalsExpanded);
  }

  // Auto-save stars when they increase; show end panel at 3★
  if (ui.stars > lastStarsShown && ui.stars >= 1) {
    lastStarsShown = ui.stars;
    const res = game.tryCompleteScenario(false);
    if (ui.stars >= 3) showEndPanel(ui.stars);
  }
}

function showEndPanel(stars) {
  const end = document.getElementById('end-panel');
  if (!end) return;
  end.classList.remove('hidden');
  end.classList.add('flex');
  game.paused = true;

  const summary = game.getRunSummary?.() || {};
  const es = document.getElementById('end-stars');
  if (es) es.textContent = starString(stars);
  const title = document.getElementById('end-title');
  if (title) {
    title.textContent = stars >= 3
      ? 'Perfekt netværk!'
      : stars === 2
        ? 'Stærkt kørt!'
        : 'Bane klaret!';
  }
  const et = document.getElementById('end-text');
  if (et) {
    let msg = stars >= 3
      ? 'Alle tre stjerner – du er klar til næste udfordring.'
      : stars === 2
        ? 'To stjerner gemt. Kan du hente den sidste?'
        : 'Stjerne gemt. Fortsæt eller prøv en ny bane.';
    if (summary.levelsGained > 0) {
      msg += ` Level ${summary.level}!`;
    }
    et.textContent = msg;
  }
  const exp = document.getElementById('end-xp');
  if (exp) {
    const xp = summary.sessionXp | 0;
    exp.textContent = xp > 0
      ? `✨ +${xp} XP denne runde · Lv ${summary.level || 1}`
      : `Lv ${summary.level || 1} · spil videre for XP`;
  }
  const ed = document.getElementById('end-delivered');
  if (ed) ed.textContent = String((summary.delivered ?? game.playerDelivered) | 0);
  const em = document.getElementById('end-money');
  if (em) em.textContent = `$${summary.money ?? Math.floor(game.money)}`;
  const ej = document.getElementById('end-jobs');
  if (ej) ej.textContent = String((summary.jobs ?? game.jobsCompleted) | 0);

  const un = document.getElementById('end-unlock');
  if (un) {
    if (summary.nextUnlock) {
      const left = Math.max(0, summary.nextUnlock.at - (summary.totalUpgrades | 0));
      un.textContent = left > 0
        ? `Næste bil-unlock: ${summary.nextUnlock.label} om ${left} opgradering${left === 1 ? '' : 'er'}`
        : `Næste bil-unlock: ${summary.nextUnlock.label} er klar!`;
    } else {
      un.textContent = 'Alle biltyper ulåst · opgrader flåden videre!';
    }
  }

  // Næste bane i listen (hvis ulåst)
  const nextBtn = document.getElementById('end-next');
  const list = game.listScenariosForUi?.() || [];
  const idx = list.findIndex(s => s.id === game.scenarioId);
  let next = null;
  for (let i = idx + 1; i < list.length; i++) {
    if (!list[i].locked && !list[i].freeplay) { next = list[i]; break; }
  }
  if (!next) {
    const fp = list.find(s => s.freeplay && !s.locked);
    if (fp && game.scenarioId !== fp.id) next = fp;
  }
  if (nextBtn) {
    if (next) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = next.freeplay ? 'Freeplay →' : `Næste: ${next.name} →`;
      nextBtn.dataset.nextId = next.id;
    } else {
      nextBtn.classList.add('hidden');
      delete nextBtn.dataset.nextId;
    }
  }
  playUi();
}

document.getElementById('btn-how')?.addEventListener('click', () => {
  document.getElementById('how-box')?.classList.toggle('hidden');
});
document.getElementById('end-map')?.addEventListener('click', () => openMapSelect());
document.getElementById('end-share')?.addEventListener('click', async () => {
  playUi();
  const line = game.getShareScoreLine?.() || game.getRunSummary?.()?.shareLine || 'Flowtown';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Flowtown', text: line });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(line);
      game.showToast?.('Score kopieret!', 2.0);
    } else {
      game.showToast?.(line, 3.5);
    }
  } catch {
    try {
      await navigator.clipboard?.writeText(line);
      game.showToast?.('Score kopieret!', 2.0);
    } catch {
      game.showToast?.(line, 3.0);
    }
  }
});
document.getElementById('end-continue')?.addEventListener('click', () => {
  const end = document.getElementById('end-panel');
  if (end) {
    end.classList.add('hidden');
    end.classList.remove('flex');
  }
  game.running = true;
  game.paused = false;
});
document.getElementById('end-next')?.addEventListener('click', () => {
  const btn = document.getElementById('end-next');
  const id = btn?.dataset?.nextId;
  const end = document.getElementById('end-panel');
  if (end) {
    end.classList.add('hidden');
    end.classList.remove('flex');
  }
  if (id) {
    selectedScenarioId = id;
    playUi();
    game.start(id);
    lastStarsShown = 0;
  }
});

renderScenarioList();

// Zoom UI – touch + click, stopPropagation så canvas ikke spiser events
const zoomLabel = document.getElementById('zoom-label');
function refreshZoomLabel() {
  if (zoomLabel) zoomLabel.textContent = game.getZoomPercent() + '%';
}
function bindZoomBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  let last = 0;
  const fire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - last < 280) return; // undgå touchend+click dobbelt
    last = now;
    fn();
    refreshZoomLabel();
  };
  el.addEventListener('click', fire);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('touchend', fire, { passive: false });
}
bindZoomBtn('btn-zoom-in', () => game.zoomBy(1.2));
bindZoomBtn('btn-zoom-out', () => game.zoomBy(1 / 1.2));
bindZoomBtn('btn-zoom-fit', () => game.fitCamera());
bindZoomBtn('btn-zoom-reset', () => game.resetCamera());

// Foldbare opgaver/mål – altid lukket som standard (mindre kort-dække)
let jobsExpanded = false;
let goalsExpanded = false;
const jobsList = document.getElementById('jobs-list');
const jobsChevron = document.getElementById('jobs-chevron');
function setJobsExpanded(on) {
  jobsExpanded = on;
  if (jobsList) jobsList.classList.toggle('hidden', !on);
  if (jobsChevron) jobsChevron.textContent = on ? '▼' : '▶';
  const btn = document.getElementById('btn-jobs-toggle');
  if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  // Dropdown flyder – HUD-højde ændrer sig næsten ikke
  requestAnimationFrame(updateHudOffset);
}
setJobsExpanded(false);

function setGoalsExpanded(on) {
  goalsExpanded = on;
  const gl = document.getElementById('goals-list');
  const gc = document.getElementById('goals-chevron');
  if (gl) gl.classList.toggle('hidden', !on);
  if (gc) gc.textContent = on ? '▼' : '▶';
  const btn = document.getElementById('btn-goals-toggle');
  if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  requestAnimationFrame(updateHudOffset);
}
setGoalsExpanded(false);
document.getElementById('btn-goals-toggle')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  // Kun én dropdown åben ad gangen
  if (!goalsExpanded) setJobsExpanded(false);
  setGoalsExpanded(!goalsExpanded);
});
function bindTap(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  let last = 0;
  const fire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - last < 280) return;
    last = now;
    fn();
  };
  el.addEventListener('click', fire);
  el.addEventListener('touchend', fire, { passive: false });
}
bindTap('btn-jobs-toggle', () => {
  if (!jobsExpanded) setGoalsExpanded(false);
  setJobsExpanded(!jobsExpanded);
});
// Luk mission-dropdowns ved tryk udenfor
document.addEventListener(
  'pointerdown',
  (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#jobs-panel') || t.closest('#goals-panel')) return;
    if (jobsExpanded) setJobsExpanded(false);
    if (goalsExpanded) setGoalsExpanded(false);
  },
  true
);

function renderJobs() {
  const list = document.getElementById('jobs-list');
  const jobs = game.getActiveJobs();
  const countEl = document.getElementById('jobs-count');
  if (countEl) countEl.textContent = `(${jobs.length})`;
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML = '<li class="text-stone-400 italic">Ingen endnu…</li>';
    return;
  }
  list.innerHTML = jobs.map(j => {
    const pct = Math.round(j.progress * 100);
    let barColor = 'bg-blue-500';
    if (j.type === 'cargo') barColor = 'bg-amber-500';
    else if (j.type === 'express') barColor = 'bg-pink-500';
    else if (j.type === 'tourist') barColor = 'bg-violet-500';
    return `
      <li class="leading-tight">
        <div class="flex justify-between gap-1">
          <span class="truncate">${escapeHtml(j.label)}</span>
          <span class="text-emerald-700 font-medium shrink-0">$${j.reward}</span>
        </div>
        <div class="mt-0.5 h-1 rounded-full bg-stone-200 overflow-hidden">
          <div class="${barColor} h-full transition-all duration-300" style="width:${pct}%"></div>
        </div>
      </li>`;
  }).join('');
}

function renderBots() {
  if (!game.botsEnabled) return;
  const list = document.getElementById('bot-list');
  const bots = game.getBotStats();
  list.innerHTML = bots.map(b => `
    <li class="flex items-center justify-between gap-1">
      <span class="flex items-center gap-1.5 truncate">
        <span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:${b.color}"></span>
        ${escapeHtml(b.name)}
      </span>
      <span class="tabular-nums font-medium">$${b.money}</span>
    </li>
  `).join('');
  document.getElementById('player-score').textContent = Math.floor(game.playerScore);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Leaderboard (P3-3)
const lbSheet = document.getElementById('lb-sheet');
let lbOpen = false;
let lbTab = 'scenario'; // scenario | global

function setLbOpen(on) {
  lbOpen = !!on;
  if (!lbSheet) return;
  lbSheet.classList.toggle('hidden', !lbOpen);
  if (lbOpen) {
    closeMore();
    setAchieveOpen(false);
    setShopOpen(false);
    if (districtSheet) districtSheet.classList.add('hidden');
    const nameIn = document.getElementById('lb-name');
    if (nameIn) nameIn.value = game.getLeaderboardUi?.()?.playerName || 'Spiller';
    refreshLbSheet();
  }
}

function refreshLbSheet() {
  if (!lbSheet || !lbOpen) return;
  const ui = game.getLeaderboardUi?.() || { global: [], scenario: [], playerName: 'Spiller' };
  const tabSc = document.getElementById('lb-tab-scenario');
  const tabGl = document.getElementById('lb-tab-global');
  if (tabSc) {
    tabSc.classList.toggle('bg-amber-500', lbTab === 'scenario');
    tabSc.classList.toggle('text-white', lbTab === 'scenario');
    tabSc.classList.toggle('bg-stone-100', lbTab !== 'scenario');
    tabSc.classList.toggle('text-stone-700', lbTab !== 'scenario');
  }
  if (tabGl) {
    tabGl.classList.toggle('bg-amber-500', lbTab === 'global');
    tabGl.classList.toggle('text-white', lbTab === 'global');
    tabGl.classList.toggle('bg-stone-100', lbTab !== 'global');
    tabGl.classList.toggle('text-stone-700', lbTab !== 'global');
  }
  const codeEl = document.getElementById('lb-cloud-code');
  if (codeEl) {
    const c = getCloudCode();
    codeEl.textContent = c ? c.slice(0, 12) + (c.length > 12 ? '…' : '') : '—';
  }
  const list = document.getElementById('lb-list');
  if (!list) return;
  const rows = lbTab === 'global' ? (ui.global || []) : (ui.scenario || []);
  if (!rows.length) {
    list.innerHTML = `<p class="text-xs text-stone-400 italic text-center py-4">Ingen scores endnu – klar en bane med stjerner!</p>`;
    return;
  }
  list.innerHTML = rows.map((e, i) => {
    const stars = '★'.repeat(e.stars | 0) + '☆'.repeat(3 - (e.stars | 0));
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const when = e.at ? new Date(e.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : '';
    return `
      <div class="flex items-center gap-2 p-2 rounded-xl border border-stone-200 bg-white">
        <span class="text-sm font-bold w-7 shrink-0 text-center">${medal}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-stone-800 truncate">${escapeHtml(e.name)}</div>
          <div class="text-[10px] text-stone-500 truncate">${escapeHtml(e.scenarioName || '')} · ${when}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-bold text-amber-600">${stars}</div>
          <div class="text-[11px] tabular-nums text-stone-600">${e.score | 0} · ${e.delivered | 0}📦</div>
        </div>
      </div>`;
  }).join('');
}

bindTap('btn-leaderboard', () => {
  playUi();
  setLbOpen(!lbOpen);
});
bindTap('lb-close', () => setLbOpen(false));
bindTap('lb-tab-scenario', () => {
  lbTab = 'scenario';
  refreshLbSheet();
});
bindTap('lb-tab-global', () => {
  lbTab = 'global';
  refreshLbSheet();
});
bindTap('lb-save-name', () => {
  const nameIn = document.getElementById('lb-name');
  const n = game.setPlayerDisplayName?.(nameIn?.value || 'Spiller');
  if (nameIn && n) nameIn.value = n;
  game.showToast?.(`Navn: ${n}`, 1.6);
  playUi();
});
bindTap('lb-share', async () => {
  const line = game.getShareScoreLine?.() || '';
  const pack = exportPack();
  const text = `${line}\n\nFlowtown-pakke (indsæt under Hent/import):\n${pack}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      game.showToast?.('Score + pakke kopieret!', 2.2);
    } else {
      game.showToast?.(line, 3.5);
    }
  } catch {
    game.showToast?.(line, 3.5);
  }
  playUi();
});

bindTap('lb-cloud-pub', async () => {
  playUi();
  game.showToast?.('Publicerer topscore…', 1.2);
  const res = await publishToCloud();
  if (res.ok) {
    game.showToast?.(`Cloud klar · kode ${String(res.code).slice(0, 10)}…`, 3.2);
    refreshLbSheet();
  } else {
    game.showToast?.(`Cloud fejlede: ${res.error || 'ukendt'}`, 3.0);
  }
});

bindTap('lb-cloud-pull', async () => {
  playUi();
  game.showToast?.('Henter cloud…', 1.0);
  const res = await pullFromCloud();
  if (res.ok) {
    game.showToast?.(`Hentet · ${res.merged || 0} poster flettet`, 2.6);
    refreshLbSheet();
  } else {
    game.showToast?.(res.error || 'Kunne ikke hente', 2.8);
  }
});

bindTap('lb-cloud-use', async () => {
  playUi();
  const input = document.getElementById('lb-cloud-input');
  const raw = (input?.value || '').trim();
  if (!raw) {
    game.showToast?.('Indsæt cloud-kode eller pakke', 2.0);
    return;
  }
  // Long base64 pack?
  if (raw.length > 40) {
    const imp = importPack(raw);
    if (imp.ok) {
      game.showToast?.(`Pakke importeret (${imp.merged || 0})`, 2.4);
      refreshLbSheet();
      return;
    }
  }
  const res = await pullFromCloud(raw);
  if (res.ok) {
    game.showToast?.('Cloud-kode gemt · scores flettet', 2.6);
    if (input) input.value = '';
    refreshLbSheet();
  } else {
    // try as pack fallback
    const imp = importPack(raw);
    if (imp.ok) {
      game.showToast?.(`Pakke importeret (${imp.merged || 0})`, 2.4);
      refreshLbSheet();
    } else {
      game.showToast?.(res.error || imp.error || 'Ugyldig kode', 2.8);
    }
  }
});

// Achievements (P2-4)
const achieveSheet = document.getElementById('achieve-sheet');
let achieveOpen = false;

function setAchieveOpen(on) {
  achieveOpen = !!on;
  if (!achieveSheet) return;
  achieveSheet.classList.toggle('hidden', !achieveOpen);
  if (achieveOpen) {
    closeMore();
    setShopOpen(false);
    setLbOpen(false);
    if (districtSheet) districtSheet.classList.add('hidden');
    refreshAchieveSheet();
  }
}

function refreshAchieveSheet() {
  if (!achieveSheet || !achieveOpen) return;
  const prog = game.getAchievementsUi?.() || { unlocked: 0, total: 0, list: [] };
  const sub = document.getElementById('achieve-sub');
  if (sub) sub.textContent = `${prog.unlocked}/${prog.total} ulåst`;
  const list = document.getElementById('achieve-list');
  if (!list) return;
  list.innerHTML = (prog.list || []).map(a => `
    <div class="flex gap-2 items-start p-2.5 rounded-xl border ${
      a.done ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-stone-50 opacity-75'
    }">
      <span class="text-xl shrink-0">${a.done ? a.icon : '🔒'}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-stone-800">${escapeHtml(a.title)}</div>
        <div class="text-[11px] text-stone-500">${escapeHtml(a.desc)}</div>
      </div>
      <span class="text-[10px] font-bold tabular-nums ${a.done ? 'text-amber-700' : 'text-stone-400'}">+${a.xp} XP</span>
    </div>
  `).join('');
}

bindTap('btn-achieve', () => {
  playUi();
  setAchieveOpen(!achieveOpen);
});
bindTap('achieve-close', () => setAchieveOpen(false));

// Global shop (PROG-B2)
const shopSheet = document.getElementById('shop-sheet');
let shopOpen = false;

function setShopOpen(on) {
  shopOpen = !!on;
  if (!shopSheet) return;
  shopSheet.classList.toggle('hidden', !shopOpen);
  if (shopOpen) {
    closeMore();
    // Skjul by-sheet visuelt, men behold valgt by (til station/lager/depot)
    if (districtSheet) districtSheet.classList.add('hidden');
    if (achieveOpen) setAchieveOpen(false);
    if (lbOpen) setLbOpen(false);
    refreshShopSheet();
  }
}

function refreshShopSheet() {
  if (!shopSheet || !shopOpen) return;
  const list = document.getElementById('shop-list');
  const sub = document.getElementById('shop-sub');
  const hint = document.getElementById('shop-hint');
  const d = game.getSelectedDistrict?.();
  const level = game.meta?.level || 1;
  if (sub) sub.textContent = `Level ${level} · $${Math.floor(game.money)} · level låser · $ køber`;
  if (hint) {
    hint.textContent = d
      ? `Bygninger placeres i: ${d.name}`
      : 'Bygninger: tryk en by først, så køb station/lager/depot';
    hint.classList.toggle('text-teal-700', !!d);
    hint.classList.toggle('text-amber-700', !d);
  }
  const catalog = game.getShopUi?.() || [];
  if (!list) return;
  list.innerHTML = catalog.map(item => {
    if (!item.unlocked) {
      return `
        <div class="w-full py-2.5 px-3 rounded-xl border border-dashed border-stone-300 bg-stone-50">
          <div class="flex justify-between gap-2 items-center">
            <span class="font-semibold text-stone-500 text-sm">🔒 ${item.icon} ${escapeHtml(item.label)}</span>
            <span class="text-[11px] text-stone-400">Lv ${item.unlockLevel}</span>
          </div>
          <span class="text-[11px] text-stone-400">${escapeHtml(item.desc)}</span>
        </div>`;
    }
    if (item.owned) {
      return `
        <div class="w-full py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <div class="flex justify-between gap-2 items-center">
            <span class="font-semibold text-emerald-800 text-sm">✓ ${item.icon} ${escapeHtml(item.label)}</span>
            <span class="text-[11px] text-emerald-600">Aktiv</span>
          </div>
          <span class="text-[11px] text-emerald-700/80">${escapeHtml(item.desc)}</span>
        </div>`;
    }
    const can = item.canBuy;
    return `
      <button type="button" data-shop-id="${item.id}"
        class="w-full text-left py-2.5 px-3 rounded-xl border touch-manipulation active:scale-[0.99] transition
          ${can ? 'bg-white border-stone-200 hover:border-amber-400' : 'bg-stone-50 border-stone-100 opacity-70'}"
        ${can ? '' : 'disabled'}>
        <div class="flex justify-between gap-2 items-center">
          <span class="font-semibold text-stone-800 text-sm">${item.icon} ${escapeHtml(item.label)}</span>
          <span class="font-bold text-amber-800 tabular-nums text-sm">$${item.price}</span>
        </div>
        <span class="text-[11px] text-stone-500">${escapeHtml(item.desc)}</span>
        ${item.blockReason && !can ? `<span class="block text-[10px] text-rose-600 mt-0.5">${escapeHtml(item.blockReason)}</span>` : ''}
      </button>`;
  }).join('');

  list.querySelectorAll('[data-shop-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-shop-id');
      game.buyShopItem(id);
      refreshShopSheet();
      refreshDistrictSheet();
    });
  });
}

bindTap('btn-shop', () => {
  playUi();
  if (!game.running) {
    game.showToast?.('Start en bane først');
    return;
  }
  setShopOpen(!shopOpen);
});
bindTap('shop-close', () => setShopOpen(false));

// District sheet (køb + opgrader)
const districtSheet = document.getElementById('district-sheet');
let dsTab = 'buy';

function setDsTab(tab) {
  dsTab = tab === 'upgrade' ? 'upgrade' : 'buy';
  const buyP = document.getElementById('ds-panel-buy');
  const upP = document.getElementById('ds-panel-upgrade');
  const tabBuy = document.getElementById('ds-tab-buy');
  const tabUp = document.getElementById('ds-tab-upgrade');
  if (buyP) buyP.classList.toggle('hidden', dsTab !== 'buy');
  if (upP) upP.classList.toggle('hidden', dsTab !== 'upgrade');
  if (tabBuy) {
    tabBuy.classList.toggle('bg-emerald-500', dsTab === 'buy');
    tabBuy.classList.toggle('text-white', dsTab === 'buy');
    tabBuy.classList.toggle('bg-stone-100', dsTab !== 'buy');
    tabBuy.classList.toggle('text-stone-700', dsTab !== 'buy');
  }
  if (tabUp) {
    tabUp.classList.toggle('bg-violet-500', dsTab === 'upgrade');
    tabUp.classList.toggle('text-white', dsTab === 'upgrade');
    tabUp.classList.toggle('bg-stone-100', dsTab !== 'upgrade');
    tabUp.classList.toggle('text-stone-700', dsTab !== 'upgrade');
  }
}

function refreshDistrictSheet() {
  if (!districtSheet) return;
  const d = game.getSelectedDistrict?.();
  if (!d) {
    districtSheet.classList.add('hidden');
    return;
  }
  // By-tap mens shop/achievements er åben: skift til by-sheet
  if (shopOpen) {
    shopOpen = false;
    if (shopSheet) shopSheet.classList.add('hidden');
  }
  if (achieveOpen) {
    achieveOpen = false;
    if (achieveSheet) achieveSheet.classList.add('hidden');
  }
  if (lbOpen) {
    lbOpen = false;
    if (lbSheet) lbSheet.classList.add('hidden');
  }
  districtSheet.classList.remove('hidden');
  setDsTab(dsTab);

  const title = document.getElementById('ds-title');
  if (title) title.textContent = d.name;
  const stats = game.getFleetStats?.() || { owned: 0, cap: 3, idle: 0, busy: 0 };
  const homeCount = game.getPlayerFleet?.().filter(v => v.homeName === d.name).length || 0;
  const sub = document.getElementById('ds-sub');
  if (sub) {
    const typePart = d.typeLabel ? `${d.icon || ''} ${d.typeLabel} · ` : '';
    sub.textContent = `${typePart}${homeCount} stationeret her`.trim();
  }
  const fl = document.getElementById('ds-fleet');
  if (fl) fl.textContent = `Flåde ${stats.owned}/${stats.cap} · ${stats.idle} ledige · ${stats.busy} på job`;

  const growthEl = document.getElementById('ds-growth');
  if (growthEl) {
    const g = d.growth | 0;
    const parts = [];
    if (g > 0) parts.push(`🏙️ Størrelse ${g}/8`);
    else if ((d.deliveriesHere | 0) > 0) parts.push(`🏙️ ${d.deliveriesHere | 0} leverancer`);
    // Demand multipliers (building + growth)
    const p = Math.round((d.passengers || 1) * 100);
    const c = Math.round((d.cargo || 1) * 100);
    parts.push(`👤${p}% · 📦${c}%`);
    if (parts.length) {
      growthEl.classList.remove('hidden');
      growthEl.textContent = parts.join(' · ');
    } else {
      growthEl.classList.add('hidden');
      growthEl.textContent = '';
    }
  }

  // IMP-A5: synlige bygningseffekter
  const bui = document.getElementById('ds-buildings');
  if (bui) {
    const info = game.getDistrictBuildingUi?.(d) || { lines: [], hasAny: false };
    if (info.hasAny && info.lines?.length) {
      bui.classList.remove('hidden');
      bui.innerHTML = `
        <div class="text-[10px] font-bold uppercase tracking-wide text-teal-800 mb-0.5">Bygninger i ${escapeHtml(d.name)}</div>
        ${info.lines.map(l => `
          <div class="flex items-start gap-1.5 text-[11px] text-stone-700">
            <span class="shrink-0">${l.icon}</span>
            <span><b class="text-stone-800">${escapeHtml(l.label)}</b> — ${escapeHtml(l.effect)}</span>
          </div>`).join('')}
        <p class="text-[10px] text-teal-700/90 pt-0.5">Køb flere under 🛒 Butik (by valgt)</p>`;
    } else {
      bui.classList.remove('hidden');
      bui.innerHTML = `
        <div class="text-[11px] text-stone-600">
          <span class="font-semibold text-stone-700">Ingen bygninger endnu</span>
          <span class="block text-[10px] text-stone-500 mt-0.5">Station 🚉 · Lager 🏭 · Depot 🚏 i 🛒 Butik — boost jobs her</span>
        </div>`;
    }
  }

  const totalUp = game.meta?.totalUpgrades || 0;
  const metaEl = document.getElementById('ds-upgrades-meta');
  if (metaEl) {
    let next = null;
    if (totalUp < 5) next = 5;
    else if (totalUp < 8) next = 8;
    else if (totalUp < 10) next = 10;
    else if (totalUp < 15) next = 15;
    metaEl.textContent = next
      ? `Opgraderinger i alt: ${totalUp} · næste bil-unlock ved ${next}`
      : `Opgraderinger i alt: ${totalUp} · alle biltyper ulåst`;
  }

  // Buy catalog
  const buyList = document.getElementById('ds-buy-list');
  if (buyList && game.getBuyCatalog) {
    const catalog = game.getBuyCatalog();
    buyList.innerHTML = catalog.map(c => {
      if (c.unlocked) {
        const can = stats.owned < stats.cap && game.money >= c.price;
        return `
          <button type="button" data-buy-class="${c.id}"
            class="w-full text-left py-2.5 px-3 rounded-xl border touch-manipulation active:scale-[0.99] transition
              ${can ? 'bg-white border-stone-200 hover:border-emerald-400' : 'bg-stone-50 border-stone-100 opacity-60'}"
            ${can ? '' : 'disabled'}>
            <div class="flex justify-between gap-2 items-center">
              <span class="font-semibold text-stone-800 text-sm">${c.icon} ${escapeHtml(c.label)}</span>
              <span class="font-bold text-amber-800 tabular-nums text-sm">$${c.price}</span>
            </div>
            <span class="text-[11px] text-stone-500">${escapeHtml(c.desc)}</span>
          </button>`;
      }
      return `
        <div class="w-full py-2.5 px-3 rounded-xl border border-dashed border-stone-300 bg-stone-50">
          <div class="flex justify-between gap-2 items-center">
            <span class="font-semibold text-stone-500 text-sm">🔒 ${c.icon} ${escapeHtml(c.label)}</span>
            <span class="text-[11px] text-stone-400">${totalUp}/${c.unlockAt}</span>
          </div>
          <span class="text-[11px] text-stone-400">Opgrader flåden ${c.remaining}× mere for at låse op</span>
        </div>`;
    }).join('');

    buyList.querySelectorAll('[data-buy-class]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-buy-class');
        game.buyVehicleAt(d, id);
        refreshDistrictSheet();
      });
    });
  }

  // F3: ekstra flåde-slot
  const slotBtn = document.getElementById('ds-buy-slot');
  const slotPriceEl = document.getElementById('ds-slot-price');
  if (slotBtn) {
    const showSlot = stats.canBuySlot && (stats.owned >= stats.cap - 1 || stats.owned >= stats.cap);
    slotBtn.classList.toggle('hidden', !showSlot && !(stats.canBuySlot && stats.owned >= 2));
    // Vis altid hvis man kan købe og flåde er tæt på fuld, ellers også hvis fuld
    if (stats.canBuySlot) {
      slotBtn.classList.remove('hidden');
      const canPay = game.money >= (stats.slotPrice || 0);
      slotBtn.disabled = !canPay;
      slotBtn.classList.toggle('opacity-60', !canPay);
      if (slotPriceEl) slotPriceEl.textContent = `$${stats.slotPrice || 0}`;
    } else {
      slotBtn.classList.add('hidden');
    }
  }

  // Upgrade list + sell
  const upList = document.getElementById('ds-upgrade-list');
  const upEmpty = document.getElementById('ds-upgrade-empty');
  const vehicles = game.getFleetForSheet?.(d.name) || [];
  if (upEmpty) upEmpty.classList.toggle('hidden', vehicles.length > 0);
  if (upList) {
    upList.innerHTML = vehicles.map(v => {
      const clsIcon = v.classId === 'bus' ? '🚌'
        : v.classId === 'van' ? '🚐'
        : v.classId === 'car_fast' ? '⚡'
        : v.classId === 'truck_heavy' ? '🚛'
        : (v.kind === 'truck' ? '📦' : '👤');
      const rank = v.upgradeRank || 0;
      const cap = v.getCargoCapacity?.() || 1;
      const maxed = rank >= 3;
      const price = upgradePrice(rank, v.classId || 'car_std');
      const can = !maxed && game.money >= price;
      const busy = !!v.job;
      const status = busy ? 'på job' : 'ledig';
      const home = v.homeName || '—';
      const sellP = sellPriceForClass(v.classId || 'car_std', rank);
      return `
        <div class="flex items-center gap-2 p-2 rounded-xl border border-stone-200 bg-white">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-stone-800 truncate">${clsIcon} rank ${rank}/3 · last ${cap}</div>
            <div class="text-[11px] text-stone-500">${escapeHtml(home)} · ${status}</div>
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            <button type="button" data-upgrade-id="${v.id}"
              class="py-1.5 px-2.5 rounded-lg text-[11px] font-bold touch-manipulation
                ${maxed ? 'bg-stone-100 text-stone-400' : can ? 'bg-violet-500 text-white' : 'bg-stone-100 text-stone-400'}"
              ${maxed || !can ? 'disabled' : ''}>
              ${maxed ? 'MAX' : `+Last $${price}`}
            </button>
            <button type="button" data-sell-id="${v.id}"
              class="py-1.5 px-2.5 rounded-lg text-[11px] font-bold touch-manipulation
                ${busy ? 'bg-stone-100 text-stone-400' : 'bg-rose-50 text-rose-700 border border-rose-200'}"
              ${busy ? 'disabled' : ''} title="Sælg bil">
              Sælg $${sellP}
            </button>
          </div>
        </div>`;
    }).join('');

    upList.querySelectorAll('[data-upgrade-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        game.upgradeVehicle(btn.getAttribute('data-upgrade-id'));
        refreshDistrictSheet();
      });
    });
    upList.querySelectorAll('[data-sell-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        game.sellVehicle(btn.getAttribute('data-sell-id'));
        refreshDistrictSheet();
      });
    });
  }
}

bindTap('ds-buy-slot', () => {
  game.buyFleetSlot?.();
  refreshDistrictSheet();
});

window.addEventListener('flowtown:district-sheet', () => refreshDistrictSheet());

bindTap('ds-close', () => {
  game.closeDistrictSheet?.();
  refreshDistrictSheet();
});
bindTap('ds-tab-buy', () => {
  setDsTab('buy');
  refreshDistrictSheet();
});
bindTap('ds-tab-upgrade', () => {
  setDsTab('upgrade');
  refreshDistrictSheet();
});

// Stats update
setInterval(() => {
  const fleet = game.getFleetStats?.();
  const busy = fleet ? fleet.busy : 0;
  document.getElementById('car-count').textContent = busy;
  const fleetEl = document.getElementById('fleet-count');
  if (fleetEl && fleet) fleetEl.textContent = `${fleet.owned}/${fleet.cap}`;
  const rushBadge = document.getElementById('rush-badge');
  const rushLabel = document.getElementById('rush-label');
  if (rushBadge) {
    const rush = !!game.isRushHour?.();
    rushBadge.classList.toggle('hidden', !rush);
    if (rush && rushLabel) {
      const rem = Math.ceil(game.getRushPhase?.().remaining || 0);
      rushLabel.textContent = `Rush ${rem}s`;
    }
  }
  const weatherLabel = document.getElementById('weather-label');
  if (weatherLabel && game.getAtmosphereUi) {
    weatherLabel.textContent = game.getAtmosphereUi().short;
  }
  const cityHint = document.getElementById('city-hint');
  if (cityHint) {
    cityHint.classList.toggle('hidden', !game.shouldShowCityHint?.());
  }
  document.getElementById('road-count').textContent = game.roads.length;
  document.getElementById('arrived-count').textContent = game.arrivedCount;
  document.getElementById('best-count').textContent = game.playerScore;
  document.getElementById('alltime-count').textContent = game.allTimeBest;
  document.getElementById('money-count').textContent = Math.floor(game.money);

  const moneyBadge = document.getElementById('money-badge');
  if (game.money < 40) {
    moneyBadge.classList.add('ring-2', 'ring-rose-400');
  } else {
    moneyBadge.classList.remove('ring-2', 'ring-rose-400');
  }

  // B1: XP / level
  const prog = game.getMetaProgress?.() || { level: 1, xp: 0, need: 36, ratio: 0 };
  const levelEl = document.getElementById('level-count');
  if (levelEl) levelEl.textContent = String(prog.level);
  const xpFill = document.getElementById('xp-fill');
  if (xpFill) xpFill.style.width = `${Math.round(prog.ratio * 100)}%`;
  const xpLabel = document.getElementById('xp-label');
  if (xpLabel) xpLabel.textContent = `${prog.xp}/${prog.need}`;

  const flowEl = document.getElementById('flow-pct');
  if (flowEl) {
    const pct = game.flowPct != null ? game.flowPct : 0;
    flowEl.textContent = pct + '%';
    // Soft color when holding flow goal
    const thr = game.getFlowThreshold?.() || 70;
    flowEl.parentElement?.classList.toggle('text-emerald-700', pct >= thr);
  }

  renderJobs();
  renderBots();
  refreshDistrictSheet();
  if (shopOpen) refreshShopSheet();
  if (achieveOpen) refreshAchieveSheet();
  if (lbOpen) refreshLbSheet();
  refreshGoalsUi();
  refreshBottleneckUi();
  refreshDailyUi();
  refreshZoomLabel();
  updateHudOffset();
}, 280);

function refreshDailyUi() {
  const strip = document.getElementById('daily-strip');
  if (!strip) return;
  const ui = game.getDailyUi?.();
  if (!ui) {
    strip.classList.add('hidden');
    return;
  }
  strip.classList.remove('hidden');
  strip.classList.toggle('is-done', ui.complete || ui.claimed);
  const icon = document.getElementById('daily-icon');
  if (icon) icon.textContent = ui.claimed ? '✓' : (ui.icon || '📅');
  const label = document.getElementById('daily-label');
  if (label) {
    label.textContent = ui.claimed
      ? `Dagsmål hentet${ui.streak > 1 ? ` · streak ${ui.streak}` : ''}`
      : ui.label;
  }
  const prog = document.getElementById('daily-prog');
  if (prog) prog.textContent = ui.claimed ? 'OK' : `${ui.progress}/${ui.amount}`;
  const claim = document.getElementById('daily-claim');
  if (claim) {
    const show = ui.complete && !ui.claimed;
    claim.classList.toggle('hidden', !show);
  }
}

document.getElementById('daily-claim')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  playUi();
  game.claimDailyReward?.();
  refreshDailyUi();
});

// PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline first fail ok */ });
  });
}

// Resize
function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  game.onResize();
}
window.addEventListener('resize', resize);
resize();

// Undgå scroll, men bloker IKKE touch på UI-knapper (zoom m.m.)
document.body.addEventListener('touchmove', (e) => {
  const t = e.target;
  if (t === canvas || (t && canvas.contains(t))) {
    e.preventDefault();
  }
}, { passive: false });

// Auto-gem session (autosave)
setInterval(() => {
  if (game.running && !game.paused) saveSession(game);
}, 8000);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game.running) saveSession(game);
});
window.addEventListener('pagehide', () => {
  if (game.running) saveSession(game);
});

refreshContinueButton();

// Tegn startskærm (distrikter synlige før Start)
game.draw();
