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

document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('help').style.display = 'none';
  game.start();
});

// Stats update
setInterval(() => {
  document.getElementById('car-count').textContent = game.vehicles.length;
  document.getElementById('road-count').textContent = game.roads.length;
  document.getElementById('arrived-count').textContent = game.arrivedCount;
  document.getElementById('best-count').textContent = game.sessionBest;
  document.getElementById('alltime-count').textContent = game.allTimeBest;
  document.getElementById('goal-count').textContent = game.currentGoal;

  const flowEl = document.getElementById('flow-pct');
  if (flowEl) {
    const total = game.arrivedCount + game.vehicles.length;
    const pct = total > 5 ? Math.round((game.arrivedCount / (game.arrivedCount + Math.max(1, game.vehicles.length * 0.55))) * 100) : 0;
    flowEl.textContent = pct + '%';
  }

  const bar = document.getElementById('goal-bar');
  if (bar) {
    const progress = Math.min(100, (game.arrivedCount / game.currentGoal) * 100);
    bar.style.width = progress + '%';
  }
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
