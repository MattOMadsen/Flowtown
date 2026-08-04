import { Game } from './game.js';
import { upgradePrice } from './fleet.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

// UI buttons
document.getElementById('btn-undo').addEventListener('click', () => game.undo());
document.getElementById('btn-clear').addEventListener('click', () => game.clearRoads());
document.getElementById('btn-toggle').addEventListener('click', (e) => {
  game.togglePause();
  e.target.textContent = game.paused ? 'Play' : 'Pause';
});

const btnDraw = document.getElementById('btn-draw');
const btnErase = document.getElementById('btn-erase');
const btnUpgrade = document.getElementById('btn-upgrade');
const btnBots = document.getElementById('btn-bots');
const botPanel = document.getElementById('bot-panel');

function setMode(mode) {
  game.setMode(mode);
  const ring = (btn, on, color) => {
    if (!btn) return;
    btn.classList.toggle('ring-2', on);
    if (color === 'emerald') btn.classList.toggle('ring-emerald-500', on);
    if (color === 'rose') btn.classList.toggle('ring-rose-500', on);
    if (color === 'sky') btn.classList.toggle('ring-sky-500', on);
  };
  ring(btnDraw, mode === 'draw', 'emerald');
  ring(btnErase, mode === 'erase', 'rose');
  ring(btnUpgrade, mode === 'upgrade', 'sky');
  if (btnUpgrade) {
    btnUpgrade.classList.toggle('bg-sky-500', mode === 'upgrade');
    btnUpgrade.classList.toggle('text-white', mode === 'upgrade');
    btnUpgrade.classList.toggle('border-sky-600', mode === 'upgrade');
    btnUpgrade.classList.toggle('bg-white/95', mode !== 'upgrade');
    btnUpgrade.classList.toggle('text-stone-700', mode !== 'upgrade');
  }
  canvas.style.cursor = mode === 'draw' ? 'crosshair' : 'pointer';
}

btnDraw.addEventListener('click', () => setMode('draw'));
btnErase.addEventListener('click', () => setMode('erase'));
if (btnUpgrade) btnUpgrade.addEventListener('click', () => setMode('upgrade'));
setMode('draw');

function updateBotButton() {
  const on = game.botsEnabled;
  btnBots.textContent = on ? 'Bots: Til' : 'Bots: Fra';
  btnBots.classList.toggle('bg-rose-500', on);
  btnBots.classList.toggle('text-white', on);
  btnBots.classList.toggle('border-rose-600', on);
  btnBots.classList.toggle('bg-white/95', !on);
  btnBots.classList.toggle('text-stone-700', !on);
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
  game.loadScenario(selectedScenarioId, { bots: withBots });
  updateBotButton();
  game.start();
  lastStarsShown = -1;
  const goalsPanel = document.getElementById('goals-panel');
  if (goalsPanel) goalsPanel.classList.toggle('hidden', !!game.scenario?.freeplay);
  refreshGoalsUi();
}

function openMapSelect() {
  game.running = false;
  game.closeDistrictSheet?.();
  const help = document.getElementById('help');
  if (help) help.style.display = 'flex';
  const end = document.getElementById('end-panel');
  if (end) {
    end.classList.add('hidden');
    end.classList.remove('flex');
  }
  renderScenarioList();
}

function refreshGoalsUi() {
  const ui = game.getGoalsUi?.();
  const panel = document.getElementById('goals-panel');
  if (!ui || !panel) return;
  if (ui.freeplay) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
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
  const es = document.getElementById('end-stars');
  if (es) es.textContent = starString(stars);
  const et = document.getElementById('end-text');
  if (et) et.textContent = stars >= 3 ? 'Alle stjerner! Vælg næste bane eller fortæt.' : 'Stjerner gemt. Du kan fortsætte.';
}

document.getElementById('btn-how')?.addEventListener('click', () => {
  document.getElementById('how-box')?.classList.toggle('hidden');
});
document.getElementById('end-map')?.addEventListener('click', () => openMapSelect());
document.getElementById('end-continue')?.addEventListener('click', () => {
  const end = document.getElementById('end-panel');
  if (end) {
    end.classList.add('hidden');
    end.classList.remove('flex');
  }
  game.running = true;
  game.paused = false;
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

// Foldbare opgaver – default lukket på smal skærm (Nord må ikke dækkes)
let jobsExpanded = !window.matchMedia('(max-width: 640px)').matches;
const jobsList = document.getElementById('jobs-list');
const jobsChevron = document.getElementById('jobs-chevron');
function setJobsExpanded(on) {
  jobsExpanded = on;
  if (jobsList) jobsList.classList.toggle('hidden', !on);
  if (jobsChevron) jobsChevron.textContent = on ? '▼' : '▶';
}
setJobsExpanded(jobsExpanded);
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
bindTap('btn-jobs-toggle', () => setJobsExpanded(!jobsExpanded));

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
    const barColor = j.type === 'cargo' ? 'bg-amber-500' : 'bg-blue-500';
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

  const totalUp = game.meta?.totalUpgrades || 0;
  const metaEl = document.getElementById('ds-upgrades-meta');
  if (metaEl) {
    let next = null;
    if (totalUp < 5) next = 5;
    else if (totalUp < 10) next = 10;
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

  // Upgrade list
  const upList = document.getElementById('ds-upgrade-list');
  const upEmpty = document.getElementById('ds-upgrade-empty');
  const vehicles = game.getFleetForSheet?.(d.name) || [];
  if (upEmpty) upEmpty.classList.toggle('hidden', vehicles.length > 0);
  if (upList) {
    upList.innerHTML = vehicles.map(v => {
      const clsIcon = v.classId === 'car_fast' ? '⚡' : v.classId === 'truck_heavy' ? '🚛' : (v.kind === 'truck' ? '📦' : '👤');
      const rank = v.upgradeRank || 0;
      const cap = v.getCargoCapacity?.() || 1;
      const maxed = rank >= 3;
      const price = upgradePrice(rank, v.classId || 'car_std');
      const can = !maxed && game.money >= price;
      const status = v.job ? 'på job' : 'ledig';
      const home = v.homeName || '—';
      return `
        <div class="flex items-center gap-2 p-2 rounded-xl border border-stone-200 bg-white">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-stone-800 truncate">${clsIcon} rank ${rank}/3 · last ${cap}</div>
            <div class="text-[11px] text-stone-500">${escapeHtml(home)} · ${status}</div>
          </div>
          <button type="button" data-upgrade-id="${v.id}"
            class="shrink-0 py-2 px-3 rounded-lg text-xs font-bold touch-manipulation
              ${maxed ? 'bg-stone-100 text-stone-400' : can ? 'bg-violet-500 text-white' : 'bg-stone-100 text-stone-400'}"
            ${maxed || !can ? 'disabled' : ''}>
            ${maxed ? 'MAX' : `+Last $${price}`}
          </button>
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
  }
}

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
  if (xpLabel) xpLabel.textContent = `${prog.xp}/${prog.need} XP`;

  const flowEl = document.getElementById('flow-pct');
  if (flowEl) {
    const total = game.arrivedCount + game.vehicles.length;
    const pct = total > 5
      ? Math.round((game.arrivedCount / (game.arrivedCount + Math.max(1, game.vehicles.length * 0.55))) * 100)
      : 0;
    flowEl.textContent = pct + '%';
  }

  renderJobs();
  renderBots();
  refreshDistrictSheet();
  refreshGoalsUi();
  refreshZoomLabel();
}, 280);

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

// Tegn startskærm (distrikter synlige før Start)
game.draw();
