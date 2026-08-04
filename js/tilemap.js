/**
 * Hex tile-map – græs, skov, diskrete stier (ikke firkant-grid).
 * Pointy-top hex, axial-ish offset rows.
 */

import { pointInWater } from './water.js';

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

function noise2(x, y, seed) {
  let n = Math.imul(x + seed * 374761393, 668265263)
    ^ Math.imul(y + seed * 668265263, 374761393);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 10000) / 10000;
}

/** Pointy-top hex layout */
export function hexMetrics(hexSize) {
  const r = hexSize;
  const w = Math.sqrt(3) * r;
  const h = 2 * r;
  const vert = h * 0.75;
  return { r, w, h, vert };
}

export function hexCenter(col, row, hexSize) {
  const { w, vert } = hexMetrics(hexSize);
  const x = col * w + (row % 2 ? w * 0.5 : 0);
  const y = row * vert;
  return { x, y };
}

/** Approximate world → hex col/row */
export function worldToHex(x, y, hexSize) {
  const { w, vert } = hexMetrics(hexSize);
  const row = Math.round(y / vert);
  const col = Math.round((x - (row % 2 ? w * 0.5 : 0)) / w);
  return { col, row };
}

function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function setCell(grid, cols, rows, col, row, v) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const i = row * cols + col;
  if (grid[i] === WATER) return;
  grid[i] = v;
}

/**
 * Diskret dirt-sti langs nabo-hexes (lidt wobble, ingen tykke bånd).
 */
function carveHexPath(grid, cols, rows, hexSize, ax, ay, bx, by, rng) {
  const steps = Math.max(6, Math.ceil(Math.hypot(bx - ax, by - ay) / (hexSize * 0.9)));
  const worldPts = [];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Meget mild kurve – undgår “rodet spagetti”
    const wob = Math.sin(t * Math.PI * 1.4) * hexSize * 0.22;
    const wx = ax + dx * t + px * wob;
    const wy = ay + dy * t + py * wob;
    worldPts.push({ x: wx, y: wy });
    const { col, row } = worldToHex(wx, wy, hexSize);
    setCell(grid, cols, rows, col, row, pick(DIRT, rng));
    // sjældent nabocell (tynd sti)
    if (rng() < 0.22) {
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      setCell(grid, cols, rows, col + n[0], row + n[1], pick(DIRT, rng));
    }
  }
  return worldPts;
}

function plantForestClusters(grid, cols, rows, hexSize, districts, waterBodies, rng, seed) {
  const nClusters = Math.max(2, Math.min(6, 1 + Math.floor(districts.length * 0.7)));
  const seeds = [];

  for (let attempt = 0; attempt < nClusters * 10 && seeds.length < nClusters; attempt++) {
    const col = Math.floor(rng() * cols);
    const row = Math.floor(rng() * rows);
    const c = hexCenter(col, row, hexSize);
    if (pointInWater(c.x, c.y, waterBodies, districts)) continue;
    let ok = true;
    for (const d of districts) {
      if (Math.hypot(d.x - c.x, d.y - c.y) < (d.r || 40) * 2.6) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const s of seeds) {
      if (Math.hypot(s.col - col, s.row - row) < 3.5) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    seeds.push({ col, row, r: 1.6 + rng() * 2.4 });
  }

  for (const d of districts) {
    if (rng() > 0.5) continue;
    const ang = rng() * Math.PI * 2;
    const dist = (d.r || 40) * (3.4 + rng() * 1.2);
    const c = worldToHex(
      d.x + Math.cos(ang) * dist,
      d.y + Math.sin(ang) * dist,
      hexSize
    );
    if (c.col > 1 && c.row > 1 && c.col < cols - 2 && c.row < rows - 2) {
      seeds.push({ col: c.col, row: c.row, r: 1.4 + rng() * 1.8 });
    }
  }

  for (const seedCell of seeds) {
    const R = seedCell.r;
    const rMax = Math.ceil(R + 1.5);
    for (let orow = -rMax; orow <= rMax; orow++) {
      for (let ocol = -rMax; ocol <= rMax; ocol++) {
        const d = Math.hypot(ocol, orow);
        if (d > R) continue;
        const fall = 1 - d / R;
        const n = noise2(seedCell.col + ocol, seedCell.row + orow, seed + 3);
        if (n > fall * 0.92 + 0.1) continue;
        const col = seedCell.col + ocol;
        const row = seedCell.row + orow;
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const i = row * cols + col;
        if (grid[i] === WATER) continue;
        if (DIRT.includes(grid[i]) && n > 0.4) continue;
        if (rng() < 0.15 + fall * 0.7) grid[i] = FOREST;
      }
    }
  }
}

/**
 * @returns {{ cols, rows, hexSize, tileSize, grid, paths, forestCells, kind:'hex' }}
 */
export function buildTileMap(worldW, worldH, dpr, districts = [], waterBodies = [], seed = 42) {
  // hexSize ≈ center-to-vertex (lidt større end gamle square-tiles for ro)
  const hexSize = Math.max(28, Math.round(34 * (dpr || 1)));
  const { w, vert } = hexMetrics(hexSize);
  const cols = Math.max(4, Math.ceil(worldW / w) + 2);
  const rows = Math.max(4, Math.ceil(worldH / vert) + 2);
  const grid = new Uint8Array(cols * rows);
  const rng = mulberry32((seed | 0) + 777);
  const s = (seed | 0) + 19;
  const paths = [];

  // 1) Base græs
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = hexCenter(col, row, hexSize);
      const n1 = noise2(col, row, s);
      const n3 = noise2(Math.floor(col / 3), Math.floor(row / 3), s + 11);
      let t = GRASS[Math.floor((n1 * 2.7 + n3 * 1.3) * GRASS.length) % GRASS.length];
      if (pointInWater(c.x, c.y, waterBodies, districts)) t = WATER;
      grid[row * cols + col] = t;
    }
  }

  // 2) Dirt ved farm/factory (blød)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row * cols + col] === WATER) continue;
      const c = hexCenter(col, row, hexSize);
      let dirtBias = 0;
      for (const d of districts) {
        const dist = Math.hypot(d.x - c.x, d.y - c.y);
        const rr = Math.max(28, d.r || 40);
        const u = dist / (rr * 3.4);
        if (u > 1) continue;
        const fall2 = (1 - u) * (1 - u);
        if (d.type === 'farm') dirtBias += fall2 * 0.88;
        else if (d.type === 'factory') dirtBias += fall2 * 0.6;
        else if (d.type === 'harbor') dirtBias += fall2 * 0.35;
        else if (d.type === 'town' || d.type === 'capital') dirtBias += fall2 * 0.18;
      }
      const n2 = noise2(col * 2 + 3, row * 2 - 1, s + 7);
      if (dirtBias > 0.18 && rng() < dirtBias * 0.68 + n2 * 0.08) {
        grid[row * cols + col] = pick(DIRT, rng);
      }
    }
  }

  // 3) Skov
  plantForestClusters(grid, cols, rows, hexSize, districts, waterBodies, rng, s);

  // 4) Få, rene stier mellem nærmeste byer (MST) – ingen ekstra “vandresti”
  const places = districts.slice();
  if (places.length >= 2) {
    const linked = new Set([0]);
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
      // Skip meget korte links (rodet ved tætte byer)
      if (bestD < hexSize * 4) continue;
      const a = places[bestI];
      const b = places[bestJ];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const aR = (a.r || 40) * 1.15;
      const bR = (b.r || 40) * 1.15;
      const pts = carveHexPath(
        grid, cols, rows, hexSize,
        a.x + Math.cos(ang) * aR,
        a.y + Math.sin(ang) * aR,
        b.x - Math.cos(ang) * bR,
        b.y - Math.sin(ang) * bR,
        rng
      );
      if (pts.length > 2) paths.push(pts);
    }
  }

  // 5) Smooth
  const next = new Uint8Array(grid);
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const i = row * cols + col;
      const v = grid[i];
      if (v === WATER) continue;
      let same = 0;
      let grassN = 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const n = grid[(row + dr) * cols + (col + dc)];
        if (familyOf(n) === familyOf(v)) same++;
        if (GRASS.includes(n)) grassN++;
      }
      if (same === 0 && DIRT.includes(v)) next[i] = pick(GRASS, rng);
      else if (same === 0 && v === FOREST && grassN >= 4) next[i] = pick(GRASS, rng);
    }
  }

  const forestCells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (next[row * cols + col] === FOREST) {
        const c = hexCenter(col, row, hexSize);
        forestCells.push(c);
      }
    }
  }

  return {
    kind: 'hex',
    cols,
    rows,
    hexSize,
    /** alias for ældre kode der forventer tileSize */
    tileSize: hexSize,
    grid: next,
    paths,
    forestCells
  };
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
 * Tegn hex-tiles + diskrete stier + skov-canopy.
 */
export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap) return;
  const { cols, rows, hexSize, grid, paths = [], forestCells = [] } = tileMap;
  const R = hexSize || tileMap.tileSize || 34;
  const drawR = R * 1.02; // lille overlap skjuler sømme

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Hex-fliser
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let key = TILE_KEYS[grid[row * cols + col]] || 'grass';
      if (key === 'water') {
        key = TILE_KEYS[GRASS[(col + row * 2) % GRASS.length]] || 'grass';
      }
      const c = hexCenter(col, row, R);
      const img = tileImgs?.[key];

      ctx.save();
      hexPath(ctx, c.x, c.y, drawR);
      ctx.clip();
      if (img && img.complete && img.naturalWidth > 0) {
        const side = drawR * 2.05;
        ctx.drawImage(img, c.x - side / 2, c.y - side / 2, side, side);
      } else {
        ctx.fillStyle = SOLIDS[key] || SOLIDS.grass;
        ctx.fill();
      }
      ctx.restore();

      // Meget diskret hex-kant (kun når det er dirt/forest for dybde)
      const fam = familyOf(grid[row * cols + col]);
      if (fam === 'd' || fam === 'f') {
        hexPath(ctx, c.x, c.y, drawR * 0.98);
        ctx.strokeStyle = fam === 'd'
          ? 'rgba(90, 70, 40, 0.08)'
          : 'rgba(30, 60, 25, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // 2) Stier – tynde, bløde (ikke tykke sand-bånd)
  for (const pts of paths) {
    if (!pts || pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(160, 130, 90, 0.22)';
    ctx.lineWidth = R * 0.55;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(210, 185, 140, 0.2)';
    ctx.lineWidth = R * 0.28;
    ctx.stroke();
  }

  // 3) Skov-canopy
  drawForestCanopy(ctx, forestCells, R);

  // 4) Let samlende wash
  const g = ctx.createLinearGradient(0, 0, 0, rows * R * 1.5);
  g.addColorStop(0, 'rgba(255, 252, 240, 0.05)');
  g.addColorStop(1, 'rgba(55, 42, 28, 0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cols * R * 2, rows * R * 1.6);

  ctx.restore();
}

function drawForestCanopy(ctx, forestCells, R) {
  if (!forestCells?.length) return;
  ctx.save();
  const step = forestCells.length > 180 ? 2 : 1;
  for (let i = 0; i < forestCells.length; i += step) {
    const c = forestCells[i];
    const n = noise2((c.x / R) | 0, (c.y / R) | 0, 44);
    const n2 = noise2(((c.x / R) | 0) + 3, ((c.y / R) | 0) - 2, 51);
    const r = R * (0.28 + n * 0.32);
    const ox = (n - 0.5) * R * 0.2;
    const oy = (n2 - 0.5) * R * 0.18;

    ctx.beginPath();
    ctx.ellipse(c.x + ox + 1, c.y + oy + 1.5, r * 1.0, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(25, 40, 18, 0.14)';
    ctx.fill();

    const g = ctx.createRadialGradient(
      c.x + ox - r * 0.2, c.y + oy - r * 0.25, r * 0.08,
      c.x + ox, c.y + oy, r
    );
    g.addColorStop(0, 'rgba(105, 155, 72, 0.52)');
    g.addColorStop(0.55, 'rgba(65, 115, 52, 0.48)');
    g.addColorStop(1, 'rgba(40, 85, 38, 0.1)');
    ctx.beginPath();
    ctx.arc(c.x + ox, c.y + oy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    if (n > 0.42) {
      ctx.beginPath();
      ctx.arc(c.x + ox + r * 0.32, c.y + oy - r * 0.12, r * (0.5 + n2 * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(50, 100, 45, 0.32)';
      ctx.fill();
    }
  }
  ctx.restore();
}
