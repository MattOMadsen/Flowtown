/**
 * Procedural tile-map with grass/dirt variants (less repetition).
 */

import { pointInWater } from './water.js';

/** Indices into TILE_KEYS */
export const TILE_KEYS = [
  'grass', 'grass2', 'grass3',
  'dirt', 'dirt2', 'dirt3',
  'forest',
  'water'
];

const GRASS = [0, 1, 2];
const DIRT = [3, 4, 5];
const FOREST = 6;
const WATER = 7;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * @returns {{ cols:number, rows:number, tileSize:number, grid:Uint8Array }}
 */
export function buildTileMap(worldW, worldH, dpr, districts = [], waterBodies = [], seed = 42) {
  const tileSize = Math.max(44, Math.round(52 * (dpr || 1)));
  const cols = Math.max(4, Math.ceil(worldW / tileSize));
  const rows = Math.max(4, Math.ceil(worldH / tileSize));
  const grid = new Uint8Array(cols * rows);
  const rng = mulberry32((seed | 0) + 777);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      // default grass variant by checker + noise (breaks grid look)
      let t = GRASS[(x * 3 + y * 5 + Math.floor(rng() * 3)) % GRASS.length];

      if (pointInWater(cx, cy, waterBodies)) {
        t = WATER;
      } else {
        const n = rng();
        if (n < 0.1) t = FOREST;
        else if (n < 0.15) t = pick(DIRT, rng);

        for (const d of districts) {
          const dist = Math.hypot(d.x - cx, d.y - cy);
          if (dist > d.r * 5.5) continue;
          if (d.type === 'farm' && dist < d.r * 3.6) t = pick(DIRT, rng);
          if (d.type === 'factory' && dist < d.r * 2.9) t = pick(DIRT, rng);
          if (d.type === 'harbor' && dist < d.r * 2.3) t = pick(DIRT, rng);
          if ((d.type === 'town' || d.type === 'capital') && dist < d.r * 2.5 && rng() < 0.45) {
            t = pick(DIRT, rng);
          }
          if (dist > d.r * 2.8 && dist < d.r * 5.2 && rng() < 0.22) t = FOREST;
        }
      }
      grid[y * cols + x] = t;
    }
  }

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const v = grid[i];
      if (v === WATER || GRASS.includes(v)) continue;
      let same = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = grid[(y + dy) * cols + (x + dx)];
        // same family
        const family = (a) => (GRASS.includes(a) ? 'g' : DIRT.includes(a) ? 'd' : a);
        if (family(n) === family(v)) same++;
      }
      if (same === 0 && v !== FOREST) grid[i] = pick(GRASS, rng);
    }
  }

  return { cols, rows, tileSize, grid };
}

export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap) return;
  const { cols, rows, tileSize, grid } = tileMap;
  const solids = {
    grass: '#a8c97a',
    grass2: '#9bc06e',
    grass3: '#b5d488',
    dirt: '#c4b48a',
    dirt2: '#d0bc94',
    dirt3: '#b8a67c',
    forest: '#5f8f4e',
    water: '#a8c97a'
  };

  // Slight overdraw hides seams between tiles
  const bleed = 1.15;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let key = TILE_KEYS[grid[y * cols + x]] || 'grass';
      if (key === 'water') {
        key = TILE_KEYS[GRASS[(x + y) % GRASS.length]] || 'grass';
      }
      const px = x * tileSize;
      const py = y * tileSize;
      const img = tileImgs?.[key];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px, py, tileSize + bleed, tileSize + bleed);
      } else {
        ctx.fillStyle = solids[key] || solids.grass;
        ctx.fillRect(px, py, tileSize + bleed, tileSize + bleed);
      }
    }
  }

  // Soft light wash over tiles (unifies palette)
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, rows * tileSize);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(40, 30, 15, 0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cols * tileSize, rows * tileSize);
  ctx.restore();
}
