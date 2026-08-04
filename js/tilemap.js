/**
 * Procedural tile-map – blødere, mindre “kasse-agtigt” terræn.
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

function familyOf(v) {
  if (GRASS.includes(v)) return 'g';
  if (DIRT.includes(v)) return 'd';
  if (v === FOREST) return 'f';
  if (v === WATER) return 'w';
  return 'g';
}

/** Billig value-noise 0–1 */
function noise2(x, y, seed) {
  let n = Math.imul(x + seed * 374761393, 668265263)
    ^ Math.imul(y + seed * 668265263, 374761393);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * @returns {{ cols:number, rows:number, tileSize:number, grid:Uint8Array }}
 */
export function buildTileMap(worldW, worldH, dpr, districts = [], waterBodies = [], seed = 42) {
  // Lidt finere tiles = mindre synlige firkanter
  const tileSize = Math.max(36, Math.round(42 * (dpr || 1)));
  const cols = Math.max(4, Math.ceil(worldW / tileSize) + 1);
  const rows = Math.max(4, Math.ceil(worldH / tileSize) + 1);
  const grid = new Uint8Array(cols * rows);
  const rng = mulberry32((seed | 0) + 777);
  const s = (seed | 0) + 19;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      const n1 = noise2(x, y, s);
      const n2 = noise2(x * 2 + 3, y * 2 - 1, s + 7);
      const n3 = noise2(Math.floor(x / 3), Math.floor(y / 3), s + 11);

      // Base: græs med blød variation (ikke checkerboard)
      let t = GRASS[Math.floor((n1 * 2.7 + n3 * 1.3) * GRASS.length) % GRASS.length];

      if (pointInWater(cx, cy, waterBodies, districts)) {
        t = WATER;
      } else {
        // Organisk dirt/forest – ikke store firkantede blobs
        let dirtBias = 0;
        let forestBias = 0;

        // Naturlig “stier/marker” fra støj
        if (n2 > 0.72 && n3 > 0.4) dirtBias += 0.35;
        if (n2 < 0.18 && n1 > 0.45) forestBias += 0.28;
        if (n3 > 0.78) forestBias += 0.15;

        for (const d of districts) {
          const dist = Math.hypot(d.x - cx, d.y - cy);
          const rr = Math.max(28, d.r || 40);
          // Blød falloff (ikke hård cirkel → firkant-grid)
          const u = dist / (rr * 4.2);
          if (u > 1.15) continue;
          const fall = Math.max(0, 1 - u);
          const fall2 = fall * fall;

          if (d.type === 'farm') {
            dirtBias += fall2 * 0.85;
            // indre ring mere mark
            if (dist < rr * 2.8) dirtBias += fall * 0.25;
          } else if (d.type === 'factory') {
            dirtBias += fall2 * 0.7;
          } else if (d.type === 'harbor') {
            dirtBias += fall2 * 0.55;
          } else if (d.type === 'town' || d.type === 'capital') {
            // kun let “by-jord” tæt på – ikke stor brun boks
            dirtBias += fall2 * 0.38;
          }
          // skov-ring uden for byen
          if (dist > rr * 2.4 && dist < rr * 5.5) {
            forestBias += (1 - Math.abs(dist / rr - 3.8) / 2.2) * 0.2;
          }
        }

        // Støj + bias → sandsynlighed
        const roll = rng();
        if (dirtBias > 0.12 && roll < dirtBias * 0.72 + n2 * 0.12) {
          t = pick(DIRT, rng);
        } else if (forestBias > 0.1 && roll < forestBias * 0.55 + (1 - n1) * 0.08) {
          t = FOREST;
        } else if (roll < 0.04 + n3 * 0.03) {
          t = pick(DIRT, rng);
        } else if (roll < 0.09) {
          t = FOREST;
        }
      }
      grid[y * cols + x] = t;
    }
  }

  // Smooth: isolerede dirt/forest-pixels → græs (mindre “tern”)
  const next = new Uint8Array(grid);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const v = grid[i];
      if (v === WATER) continue;
      let same = 0;
      let grassN = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const n = grid[(y + dy) * cols + (x + dx)];
        if (familyOf(n) === familyOf(v)) same++;
        if (GRASS.includes(n)) grassN++;
      }
      if (same <= 1 && v !== FOREST && DIRT.includes(v)) {
        next[i] = pick(GRASS, rng);
      } else if (same === 0 && v === FOREST && grassN >= 5) {
        next[i] = pick(GRASS, rng);
      } else if (DIRT.includes(v) && same >= 5 && rng() < 0.15) {
        // variation inden for dirt-patch
        next[i] = pick(DIRT, rng);
      }
    }
  }

  return { cols, rows, tileSize, grid: next };
}

const SOLIDS = {
  grass: '#a3c978',
  grass2: '#96bd6c',
  grass3: '#b0d086',
  dirt: '#c6b48c',
  dirt2: '#d2be96',
  dirt3: '#b9a87e',
  forest: '#5c8c4c',
  water: '#a3c978'
};

/**
 * Tegn tiles med blødere kanter og mindre synlig grid.
 */
export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap) return;
  const { cols, rows, tileSize, grid } = tileMap;
  const ts = tileSize;
  // Overdraw skjuler sømme
  const bleed = Math.max(1.5, ts * 0.04);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Base-lag: alle tiles
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let key = TILE_KEYS[grid[y * cols + x]] || 'grass';
      if (key === 'water') {
        key = TILE_KEYS[GRASS[(x + y * 2) % GRASS.length]] || 'grass';
      }
      const px = x * ts;
      const py = y * ts;
      const img = tileImgs?.[key];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px - bleed * 0.35, py - bleed * 0.35, ts + bleed, ts + bleed);
      } else {
        ctx.fillStyle = SOLIDS[key] || SOLIDS.grass;
        ctx.fillRect(px, py, ts + 1, ts + 1);
      }
    }
  }

  // 2) Blød overgang: dirt/forest-kanter mod græs (fjerner hårde firkanter)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = grid[y * cols + x];
      if (v === WATER || GRASS.includes(v)) continue;
      const fam = familyOf(v);
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (familyOf(grid[ny * cols + nx]) !== fam) {
          edge = true;
          break;
        }
      }
      if (!edge) continue;
      const cx = (x + 0.5) * ts;
      const cy = (y + 0.5) * ts;
      const g = ctx.createRadialGradient(cx, cy, ts * 0.15, cx, cy, ts * 0.72);
      if (fam === 'd') {
        g.addColorStop(0, 'rgba(198, 180, 140, 0)');
        g.addColorStop(0.55, 'rgba(168, 190, 120, 0.08)');
        g.addColorStop(1, 'rgba(155, 185, 110, 0.22)');
      } else {
        g.addColorStop(0, 'rgba(90, 140, 75, 0)');
        g.addColorStop(1, 'rgba(140, 175, 100, 0.18)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3) Mikro-variation (billige prikker) – bryder flade flader
  ctx.globalAlpha = 0.07;
  for (let y = 0; y < rows; y += 2) {
    for (let x = 0; x < cols; x += 2) {
      const v = grid[y * cols + x];
      if (v === WATER) continue;
      const n = noise2(x, y, 99);
      if (n < 0.55) continue;
      const px = x * ts + n * ts * 0.6;
      const py = y * ts + (1 - n) * ts * 0.5;
      ctx.fillStyle = GRASS.includes(v) ? '#6a9a48' : DIRT.includes(v) ? '#9a8860' : '#3d6b35';
      ctx.beginPath();
      ctx.arc(px, py, ts * 0.08 * n, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 4) Varm samlende wash (mindre “patchwork”)
  const g = ctx.createLinearGradient(0, 0, 0, rows * ts);
  g.addColorStop(0, 'rgba(255, 252, 240, 0.07)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(55, 42, 28, 0.07)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cols * ts, rows * ts);

  // Let radial “sol” ovenpå – blødgør midten
  const sun = ctx.createRadialGradient(
    cols * ts * 0.35, rows * ts * 0.25, 0,
    cols * ts * 0.45, rows * ts * 0.45, Math.max(cols, rows) * ts * 0.55
  );
  sun.addColorStop(0, 'rgba(255, 250, 230, 0.06)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, cols * ts, rows * ts);

  ctx.restore();
}
