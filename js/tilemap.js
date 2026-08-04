/**
 * Procedural tile-map over the playable board.
 * Seamless textures: grass, dirt, forest, water.
 */

import { pointInWater } from './water.js';

export const TILE_KEYS = ['grass', 'dirt', 'forest', 'water'];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
      let t = 0;

      if (pointInWater(cx, cy, waterBodies)) {
        t = 3;
      } else {
        const n = rng();
        if (n < 0.11) t = 2;
        else if (n < 0.16) t = 1;

        for (const d of districts) {
          const dist = Math.hypot(d.x - cx, d.y - cy);
          if (dist > d.r * 5.5) continue;
          if (d.type === 'farm' && dist < d.r * 3.6) t = 1;
          if (d.type === 'factory' && dist < d.r * 2.9) t = 1;
          if (d.type === 'harbor' && dist < d.r * 2.3) t = 1;
          if ((d.type === 'town' || d.type === 'capital') && dist < d.r * 2.5 && rng() < 0.45) t = 1;
          if (dist > d.r * 2.8 && dist < d.r * 5.2 && rng() < 0.22) t = 2;
        }
      }
      grid[y * cols + x] = t;
    }
  }

  // Remove lonely non-grass tiles
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (grid[i] === 0 || grid[i] === 3) continue;
      let same = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (grid[(y + dy) * cols + (x + dx)] === grid[i]) same++;
      }
      if (same === 0) grid[i] = 0;
    }
  }

  return { cols, rows, tileSize, grid };
}

/**
 * Draw tiles via drawImage (seamless textures).
 * @param {Record<string, HTMLImageElement|null>} tileImgs
 */
export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap) return;
  const { cols, rows, tileSize, grid } = tileMap;
  const solids = {
    grass: '#b7d18a',
    dirt: '#c4b48a',
    forest: '#6f9b5a',
    water: '#3ba3d0'
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = TILE_KEYS[grid[y * cols + x]] || 'grass';
      const px = x * tileSize;
      const py = y * tileSize;
      const img = tileImgs?.[key];
      if (img && img.complete && img.naturalWidth > 0) {
        // slight subpixel overlap kills hairline gaps
        ctx.drawImage(img, px, py, tileSize + 0.75, tileSize + 0.75);
      } else {
        ctx.fillStyle = solids[key];
        ctx.fillRect(px, py, tileSize + 0.75, tileSize + 0.75);
      }
    }
  }
}
