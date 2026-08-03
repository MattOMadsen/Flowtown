import { Game } from './game.js';

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
const btnBots = document.getElementById('btn-bots');
const botPanel = document.getElementById('bot-panel');

function setMode(mode) {
  game.setMode(mode);
  if (mode === 'draw') {
    btnDraw.classList.add('ring-2', 'ring-emerald-500');
    btnErase.classList.remove('ring-2', 'ring-rose-500');
    canvas.style.cursor = 'crosshair';
  } else {
    btnErase.classList.add('ring-2', 'ring-rose-500');
    btnDraw.classList.remove('ring-2', 'ring-emerald-500');
    canvas.style.cursor = 'pointer';
  }
}

btnDraw.addEventListener('click', () => setMode('draw'));
btnErase.addEventListener('click', () => setMode('erase'));
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

function startGame(withBots) {
  document.getElementById('help').style.display = 'none';
  if (withBots) game.setBotsEnabled(true);
  updateBotButton();
  game.start();
}

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-start-bots').addEventListener('click', () => startGame(true));

// Zoom UI
const zoomLabel = document.getElementById('zoom-label');
function refreshZoomLabel() {
  if (zoomLabel) zoomLabel.textContent = game.getZoomPercent() + '%';
}
document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
  game.zoomBy(1.15);
  refreshZoomLabel();
});
document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
  game.zoomBy(1 / 1.15);
  refreshZoomLabel();
});
document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
  game.resetCamera();
  refreshZoomLabel();
});

function renderJobs() {
  const list = document.getElementById('jobs-list');
  const jobs = game.getActiveJobs();
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

// Stats update
setInterval(() => {
  document.getElementById('car-count').textContent = game.vehicles.length;
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

document.body.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
