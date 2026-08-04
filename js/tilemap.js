/**
 * Procedural tile-map – græs, skov, stier (dirt) med bløde kanter.
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

function setCell(grid, cols, rows, x, y, v) {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  if (grid[i] === WATER) return;
  grid[i] = v;
}

/**
 * Tegn dirt-sti langs polyline i grid (med bredde + wobble).
 * @returns {Array<{x:number,y:number}>} world points til dekor-tegning
 */
function carvePath(grid, cols, rows, tileSize, ax, ay, bx, by, rng, width = 1) {
  const steps = Math.max(8, Math.ceil(Math.hypot(bx - ax, by - ay) / (tileSize * 0.45)));
  const worldPts = [];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // blød S-kurve + støj
    const wob = Math.sin(t * Math.PI * 2.2 + rng() * 0.5) * tileSize * 0.55
      + (rng() - 0.5) * tileSize * 0.35;
    const wx = ax + dx * t + px * wob;
    const wy = ay + dy * t + py * wob;
    worldPts.push({ x: wx, y: wy });
    const gx = Math.floor(wx / tileSize);
    const gy = Math.floor(wy / tileSize);
    for (let oy = -width; oy <= width; oy++) {
      for (let ox = -width; ox <= width; ox++) {
        if (ox * ox + oy * oy > (width + 0.2) * (width + 0.2)) continue;
        // kanter mere sporadiske
        if (Math.abs(ox) === width || Math.abs(oy) === width) {
          if (rng() > 0.55) continue;
        }
        setCell(grid, cols, rows, gx + ox, gy + oy, pick(DIRT, rng));
      }
    }
  }
  return worldPts;
}

/**
 * Placer skov-klumper (seed + expand).
 */
function plantForestClusters(grid, cols, rows, tileSize, districts, waterBodies, rng, seed) {
  const nClusters = Math.max(3, Math.min(8, 2 + Math.floor(districts.length * 0.9)));
  const seeds = [];

  // Prefer gaps between places
  for (let attempt = 0; attempt < nClusters * 8 && seeds.length < nClusters; attempt++) {
    const x = Math.floor(rng() * cols);
    const y = Math.floor(rng() * rows);
    const cx = (x + 0.5) * tileSize;
    const cy = (y + 0.5) * tileSize;
    if (pointInWater(cx, cy, waterBodies, districts)) continue;
    let tooClose = false;
    for (const d of districts) {
      if (Math.hypot(d.x - cx, d.y - cy) < (d.r || 40) * 2.4) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    for (const s of seeds) {
      if (Math.hypot(s.x - x, s.y - y) < 4) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    seeds.push({ x, y, r: 2.2 + rng() * 3.5 });
  }

  // ring-skov mellem byer
  for (const d of districts) {
    if (rng() > 0.55) continue;
    const ang = rng() * Math.PI * 2;
    const dist = (d.r || 40) * (3.2 + rng() * 1.4);
    const cx = d.x + Math.cos(ang) * dist;
    const cy = d.y + Math.sin(ang) * dist;
    const x = Math.floor(cx / tileSize);
    const y = Math.floor(cy / tileSize);
    if (x > 1 && y > 1 && x < cols - 2 && y < rows - 2) {
      seeds.push({ x, y, r: 1.8 + rng() * 2.2 });
    }
  }

  for (const seedCell of seeds) {
    const R = seedCell.r;
    const rMax = Math.ceil(R + 2);
    for (let oy = -rMax; oy <= rMax; oy++) {
      for (let ox = -rMax; ox <= rMax; ox++) {
        const d = Math.hypot(ox, oy);
        if (d > R) continue;
        const fall = 1 - d / R;
        const n = noise2(seedCell.x + ox, seedCell.y + oy, seed + 3);
        if (n > fall * 0.95 + 0.08) continue;
        const gx = seedCell.x + ox;
        const gy = seedCell.y + oy;
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
        const i = gy * cols + gx;
        if (grid[i] === WATER) continue;
        // stier (dirt) bevares
        if (DIRT.includes(grid[i]) && n > 0.35) continue;
        if (rng() < 0.12 + fall * 0.75) grid[i] = FOREST;
      }
    }
  }
}

/**
 * @returns {{ cols:number, rows:number, tileSize:number, grid:Uint8Array, paths:Array<Array<{x:number,y:number}>>, forestCells:Array<{x:number,y:number}> }}
 */
export function buildTileMap(worldW, worldH, dpr, districts = [], waterBodies = [], seed = 42) {
  const tileSize = Math.max(36, Math.round(42 * (dpr || 1)));
  const cols = Math.max(4, Math.ceil(worldW / tileSize) + 1);
  const rows = Math.max(4, Math.ceil(worldH / tileSize) + 1);
  const grid = new Uint8Array(cols * rows);
  const rng = mulberry32((seed | 0) + 777);
  const s = (seed | 0) + 19;
  const paths = [];

  // 1) Base græs
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n1 = noise2(x, y, s);
      const n3 = noise2(Math.floor(x / 3), Math.floor(y / 3), s + 11);
      let t = GRASS[Math.floor((n1 * 2.7 + n3 * 1.3) * GRASS.length) % GRASS.length];
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      if (pointInWater(cx, cy, waterBodies, districts)) t = WATER;
      grid[y * cols + x] = t;
    }
  }

  // 2) Mark/dirt tæt på farm/factory (blød)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x] === WATER) continue;
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      let dirtBias = 0;
      for (const d of districts) {
        const dist = Math.hypot(d.x - cx, d.y - cy);
        const rr = Math.max(28, d.r || 40);
        const u = dist / (rr * 3.6);
        if (u > 1) continue;
        const fall2 = (1 - u) * (1 - u);
        if (d.type === 'farm') dirtBias += fall2 * 0.9;
        else if (d.type === 'factory') dirtBias += fall2 * 0.65;
        else if (d.type === 'harbor') dirtBias += fall2 * 0.4;
        else if (d.type === 'town' || d.type === 'capital') dirtBias += fall2 * 0.22;
      }
      const n2 = noise2(x * 2 + 3, y * 2 - 1, s + 7);
      if (dirtBias > 0.15 && rng() < dirtBias * 0.7 + n2 * 0.1) {
        grid[y * cols + x] = pick(DIRT, rng);
      }
    }
  }

  // 3) Skov-klumper
  plantForestClusters(grid, cols, rows, tileSize, districts, waterBodies, rng, s);

  // 4) Stier mellem byer (dirt-korridorer) – ikke veje, bare landskab
  const places = districts.slice().sort((a, b) => a.x - b.x);
  if (places.length >= 2) {
    // forbind nærmeste naboer (simpelt MST-agtigt)
    const linked = new Set([0]);
    const order = [0];
    while (linked.size < places.length) {
      let bestI = -1;
      let bestJ = -1;
      let bestD = Infinity;
      for (const i of linked) {
        for (let j = 0; j < places.length; j++) {
          if (linked.has(j)) continue;
          const d = Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y);
          if (d < bestD) {
            bestD = d;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestJ < 0) break;
      linked.add(bestJ);
      order.push(bestJ);
      const a = places[bestI];
      const b = places[bestJ];
      // start/slut lidt uden for hub
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const aR = (a.r || 40) * 1.05;
      const bR = (b.r || 40) * 1.05;
      const pts = carvePath(
        grid, cols, rows, tileSize,
        a.x + Math.cos(ang) * aR,
        a.y + Math.sin(ang) * aR,
        b.x - Math.cos(ang) * bR,
        b.y - Math.sin(ang) * bR,
        rng,
        rng() > 0.65 ? 1 : 0
      );
      if (pts.length > 2) paths.push(pts);
    }

    // 1–2 ekstra “vandresti” der ikke er mellem byer
    for (let k = 0; k < 2; k++) {
      if (rng() > 0.7) continue;
      const ax = worldW * (0.15 + rng() * 0.3);
      const ay = worldH * (0.2 + rng() * 0.6);
      const bx = worldW * (0.55 + rng() * 0.3);
      const by = worldH * (0.2 + rng() * 0.6);
      const pts = carvePath(grid, cols, rows, tileSize, ax, ay, bx, by, rng, 0);
      if (pts.length > 2) paths.push(pts);
    }
  }

  // 5) Smooth isolerede dirt (behold stier der hænger sammen)
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
      if (same === 0 && DIRT.includes(v)) next[i] = pick(GRASS, rng);
      else if (same === 0 && v === FOREST && grassN >= 6) next[i] = pick(GRASS, rng);
      else if (DIRT.includes(v) && same >= 4 && rng() < 0.12) next[i] = pick(DIRT, rng);
    }
  }

  // Forest cell centres til canopy-draw
  const forestCells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (next[y * cols + x] === FOREST) {
        forestCells.push({
          x: (x + 0.5) * tileSize,
          y: (y + 0.5) * tileSize
        });
      }
    }
  }

  return { cols, rows, tileSize, grid: next, paths, forestCells };
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
 * Tegn tiles + bløde stier + skov-canopy hints.
 */
export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap) return;
  const { cols, rows, tileSize, grid, paths = [], forestCells = [] } = tileMap;
  const ts = tileSize;
  const bleed = Math.max(1.5, ts * 0.04);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Base tiles
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

  // 2) Blød overgang dirt/forest
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
        g.addColorStop(1, 'rgba(155, 185, 110, 0.2)');
      } else {
        g.addColorStop(0, 'rgba(70, 120, 60, 0)');
        g.addColorStop(1, 'rgba(100, 150, 80, 0.16)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3) Stier – bløde sandede bånd oven på dirt (læsbar “sti”)
  for (const pts of paths) {
    if (!pts || pts.length < 2) continue;
    // skygge
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(70, 55, 35, 0.14)';
    ctx.lineWidth = ts * 0.72;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    // hovedsti
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(196, 168, 118, 0.42)';
    ctx.lineWidth = ts * 0.48;
    ctx.stroke();
    // lys midterstribe
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(230, 210, 165, 0.28)';
    ctx.lineWidth = ts * 0.18;
    ctx.stroke();
  }

  // 4) Skov-canopy – træ-klumper på forest-tiles
  drawForestCanopy(ctx, forestCells, ts);

  // 5) Mikro-prikker
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < rows; y += 2) {
    for (let x = 0; x < cols; x += 2) {
      const v = grid[y * cols + x];
      if (v === WATER) continue;
      const n = noise2(x, y, 99);
      if (n < 0.55) continue;
      const px = x * ts + n * ts * 0.6;
      const py = y * ts + (1 - n) * ts * 0.5;
      ctx.fillStyle = GRASS.includes(v) ? '#6a9a48' : DIRT.includes(v) ? '#9a8860' : '#2f5a28';
      ctx.beginPath();
      ctx.arc(px, py, ts * 0.08 * n, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 6) Wash
  const g = ctx.createLinearGradient(0, 0, 0, rows * ts);
  g.addColorStop(0, 'rgba(255, 252, 240, 0.06)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.015)');
  g.addColorStop(1, 'rgba(55, 42, 28, 0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cols * ts, rows * ts);

  ctx.restore();
}

/** Simple tree blobs – cozy top-down canopy */
function drawForestCanopy(ctx, forestCells, ts) {
  if (!forestCells?.length) return;
  ctx.save();
  // subsample for performance
  const step = forestCells.length > 220 ? 2 : 1;
  for (let i = 0; i < forestCells.length; i += step) {
    const c = forestCells[i];
    const n = noise2((c.x / ts) | 0, (c.y / ts) | 0, 44);
    const n2 = noise2((c.x / ts) | 0 + 3, (c.y / ts) | 0 - 2, 51);
    const r = ts * (0.22 + n * 0.28);
    const ox = (n - 0.5) * ts * 0.25;
    const oy = (n2 - 0.5) * ts * 0.22;

    // soft shadow
    ctx.beginPath();
    ctx.ellipse(c.x + ox + 1.5, c.y + oy + 2, r * 1.05, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(25, 40, 18, 0.16)';
    ctx.fill();

    // outer canopy
    const g = ctx.createRadialGradient(
      c.x + ox - r * 0.25, c.y + oy - r * 0.3, r * 0.1,
      c.x + ox, c.y + oy, r
    );
    g.addColorStop(0, 'rgba(110, 160, 75, 0.55)');
    g.addColorStop(0.55, 'rgba(70, 120, 55, 0.5)');
    g.addColorStop(1, 'rgba(45, 90, 40, 0.12)');
    ctx.beginPath();
    ctx.arc(c.x + ox, c.y + oy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // second blob for density
    if (n > 0.4) {
      const r2 = r * (0.55 + n2 * 0.25);
      ctx.beginPath();
      ctx.arc(c.x + ox + r * 0.35, c.y + oy - r * 0.15, r2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(55, 105, 48, 0.35)';
      ctx.fill();
    }
  }
  ctx.restore();
}
