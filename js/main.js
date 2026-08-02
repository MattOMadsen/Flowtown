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

document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('help').style.display = 'none';
  game.start();
});

// Stats update
setInterval(() => {
  document.getElementById('car-count').textContent = game.vehicles.length;
  document.getElementById('road-count').textContent = game.roads.length;
}, 500);

// Resize handling
function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  game.onResize();
}
window.addEventListener('resize', resize);
resize();

// Prevent scrolling on mobile
document.body.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
