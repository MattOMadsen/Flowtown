/**
 * Sømløst terræn – ingen hex/firkant-grid.
 * Moderne soft meadow med dirt-patches, skov og diskrete stier.
 */

import { pointInWater } from './water.js';

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise2(x, y, seed) {
  let n = Math.imul((x | 0) + seed * 374761393, 668265263)
    ^ Math.imul((y | 0) + seed * 668265263, 374761393);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * Byg data til sømløs tegning (ingen celle-grid).
 * @returns {object}
 */
export function buildTileMap(worldW, worldH, dpr, districts = [], waterBodies = [], seed = 42) {
  const rng = mulberry32((seed | 0) + 777);
  const s = (seed | 0) + 19;
  const minSide = Math.min(worldW, worldH);

  // Dirt patches (bløde ellipser)
  const dirtPatches = [];
  for (const d of districts) {
    const rr = Math.max(28, d.r || 40);
    let strength = 0.35;
    if (d.type === 'farm') strength = 0.75;
    else if (d.type === 'factory') strength = 0.55;
    else if (d.type === 'harbor') strength = 0.4;
    else if (d.type === 'town' || d.type === 'capital') strength = 0.25;
    if (strength < 0.2) continue;
    dirtPatches.push({
      x: d.x + (rng() - 0.5) * rr * 0.4,
      y: d.y + (rng() - 0.5) * rr * 0.4,
      rx: rr * (1.6 + rng() * 1.2) * (0.7 + strength),
      ry: rr * (1.2 + rng() * 0.9) * (0.7 + strength),
      rot: (rng() - 0.5) * 0.8,
      alpha: 0.12 + strength * 0.18
    });
    // ekstra lille patch ved farm
    if (d.type === 'farm' && rng() > 0.35) {
      const ang = rng() * Math.PI * 2;
      dirtPatches.push({
        x: d.x + Math.cos(ang) * rr * 2.2,
        y: d.y + Math.sin(ang) * rr * 1.8,
        rx: rr * (1.1 + rng()),
        ry: rr * (0.8 + rng() * 0.6),
        rot: rng() * Math.PI,
        alpha: 0.14
      });
    }
  }
  // 2–4 random dirt meadows
  for (let i = 0; i < 3; i++) {
    if (rng() > 0.7) continue;
    dirtPatches.push({
      x: worldW * (0.2 + rng() * 0.6),
      y: worldH * (0.2 + rng() * 0.6),
      rx: minSide * (0.04 + rng() * 0.05),
      ry: minSide * (0.03 + rng() * 0.04),
      rot: rng() * Math.PI,
      alpha: 0.08 + rng() * 0.06
    });
  }

  // Forest blobs
  const forestBlobs = [];
  const nForest = Math.max(2, Math.min(5, 1 + Math.floor(districts.length * 0.55)));
  for (let attempt = 0; attempt < nForest * 8 && forestBlobs.length < nForest; attempt++) {
    const x = worldW * (0.12 + rng() * 0.76);
    const y = worldH * (0.12 + rng() * 0.76);
    if (pointInWater(x, y, waterBodies, districts)) continue;
    let near = false;
    for (const d of districts) {
      if (Math.hypot(d.x - x, d.y - y) < (d.r || 40) * 2.8) {
        near = true;
        break;
      }
    }
    if (near) continue;
    forestBlobs.push({
      x,
      y,
      r: minSide * (0.045 + rng() * 0.04),
      seed: (s + attempt * 17) | 0
    });
  }
  // ring skov ved byer
  for (const d of districts) {
    if (rng() > 0.55) continue;
    const ang = rng() * Math.PI * 2;
    const dist = (d.r || 40) * (3.5 + rng());
    const x = d.x + Math.cos(ang) * dist;
    const y = d.y + Math.sin(ang) * dist;
    if (x < 0 || y < 0 || x > worldW || y > worldH) continue;
    forestBlobs.push({
      x,
      y,
      r: minSide * (0.03 + rng() * 0.025),
      seed: (s + d.x) | 0
    });
  }

  // Stier – kun MST, blød polyline
  const paths = [];
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
          const dist = Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y);
          if (dist < bestD) {
            bestD = dist;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestJ < 0) break;
      linked.add(bestJ);
      if (bestD < minSide * 0.12) continue;
      const a = places[bestI];
      const b = places[bestJ];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const aR = (a.r || 40) * 1.2;
      const bR = (b.r || 40) * 1.2;
      paths.push(softPath(
        a.x + Math.cos(ang) * aR,
        a.y + Math.sin(ang) * aR,
        b.x - Math.cos(ang) * bR,
        b.y - Math.sin(ang) * bR,
        rng
      ));
    }
  }

  return {
    kind: 'seamless',
    worldW,
    worldH,
    seed: s,
    dirtPatches,
    forestBlobs,
    paths,
    /** bagudkompatibilitet */
    tileSize: 40 * (dpr || 1),
    hexSize: null,
    grid: null,
    forestCells: forestBlobs.map(f => ({ x: f.x, y: f.y }))
  };
}

function softPath(ax, ay, bx, by, rng) {
  const steps = Math.max(5, Math.ceil(Math.hypot(bx - ax, by - ay) / 80));
  const pts = [];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wob = Math.sin(t * Math.PI * 1.2) * len * 0.03;
    pts.push({
      x: ax + dx * t + px * wob,
      y: ay + dy * t + py * wob
    });
  }
  return pts;
}

/**
 * Sømløst premium-terræn 2026 – rene lag, ingen gitter.
 */
export function drawTileMap(ctx, tileMap, _tileImgs) {
  if (!tileMap) return;

  const w = tileMap.worldW || 2000;
  const h = tileMap.worldH || 1500;
  const seed = tileMap.seed || 1;

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  // 1) Frisk meadow (lys, modern)
  const base = ctx.createLinearGradient(0, 0, w * 0.15, h);
  base.addColorStop(0, '#d4ebbc');
  base.addColorStop(0.35, '#c5e3a8');
  base.addColorStop(0.7, '#cee6b0');
  base.addColorStop(1, '#d8e2b4');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 2) Store farve-felter (jord/eng variation)
  for (let i = 0; i < 14; i++) {
    const x = noise2(i * 3, 7, seed) * w;
    const y = noise2(i * 5, 11, seed + 2) * h;
    const r = Math.min(w, h) * (0.09 + noise2(i, 2, seed) * 0.11);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = noise2(i, 9, seed) > 0.5;
    g.addColorStop(0, warm ? 'rgba(210, 200, 140, 0.11)' : 'rgba(120, 170, 95, 0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3) Dirt
  for (const p of tileMap.dirtPatches || []) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(p.rx, p.ry));
    g.addColorStop(0, `rgba(210, 190, 145, ${Math.min(0.32, p.alpha * 1.2)})`);
    g.addColorStop(0.55, `rgba(190, 170, 125, ${p.alpha * 0.45})`);
    g.addColorStop(1, 'rgba(190, 170, 125, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4) Stier
  for (const pts of tileMap.paths || []) {
    if (!pts || pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(160, 135, 95, 0.14)';
    ctx.lineWidth = Math.min(w, h) * 0.0055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 5) Moderne træ-grupper
  for (const f of tileMap.forestBlobs || []) {
    drawForestBlob(ctx, f);
  }

  // 6) Soft daylight
  const sun = ctx.createRadialGradient(w * 0.25, h * 0.15, 0, w * 0.4, h * 0.35, Math.max(w, h) * 0.6);
  sun.addColorStop(0, 'rgba(255, 253, 245, 0.12)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

/**
 * Moderne top-down træ – lagdelt canopy + lille stamme-skygge.
 * Style: cozy 2020s mobile city-builder.
 */
export function drawModernTree(ctx, x, y, size, variant = 0) {
  const s = Math.max(8, size);
  // contact shadow
  ctx.beginPath();
  ctx.ellipse(x + s * 0.06, y + s * 0.42, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 55, 30, 0.16)';
  ctx.fill();

  // trunk (kort, top-down)
  ctx.fillStyle = '#8b6914';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.12, s * 0.1, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a67c1a';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.03, y + s * 0.08, s * 0.05, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // canopy layers (3 overlapping circles = “puffy” tree)
  const palette = [
    ['#3d8f4a', '#5cb86a', '#2f6b38'],
    ['#2f8f5b', '#4db87a', '#246b44'],
    ['#4a9a40', '#6fc45e', '#357530'],
    ['#3a7d4e', '#58a86a', '#2a5c3a']
  ][variant % 4];

  const lobes = [
    { ox: -s * 0.18, oy: -s * 0.08, r: s * 0.42 },
    { ox: s * 0.2, oy: -s * 0.05, r: s * 0.4 },
    { ox: 0, oy: -s * 0.28, r: s * 0.46 },
    { ox: 0.05 * s, oy: 0.02 * s, r: s * 0.36 }
  ];
  for (const L of lobes) {
    ctx.beginPath();
    ctx.arc(x + L.ox, y + L.oy, L.r, 0, Math.PI * 2);
    ctx.fillStyle = palette[0];
    ctx.fill();
  }
  // mid highlight lobes
  ctx.beginPath();
  ctx.arc(x - s * 0.08, y - s * 0.22, s * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = palette[1];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s * 0.12, y - s * 0.18, s * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  // soft outline
  ctx.beginPath();
  ctx.arc(x, y - s * 0.12, s * 0.48, 0, Math.PI * 2);
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Skov = gruppe af moderne træer */
function drawForestBlob(ctx, f) {
  const { x, y, r, seed = 1 } = f;
  const scale = Math.max(36, r * 0.62);
  const n = 5 + (seed % 4);
  const trees = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + noise2(i, seed, 3) * 0.9;
    const d = scale * (0.15 + noise2(i, seed + 1, 5) * 0.75);
    trees.push({
      cx: x + Math.cos(a) * d,
      cy: y + Math.sin(a) * d * 0.72,
      tr: scale * (0.38 + noise2(i, seed + 2, 7) * 0.28),
      v: (seed + i) % 4
    });
  }
  trees.sort((a, b) => a.cy - b.cy);
  for (const t of trees) {
    drawModernTree(ctx, t.cx, t.cy, t.tr, t.v);
  }
}
