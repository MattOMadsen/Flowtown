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
 * Sømløs tegning – bløde lag, ingen gitter.
 */
export function drawTileMap(ctx, tileMap, tileImgs) {
  if (!tileMap || tileMap.kind === 'hex') {
    // hex deprecated – seamless only
  }
  if (!tileMap) return;

  const w = tileMap.worldW || 2000;
  const h = tileMap.worldH || 1500;
  const grass = tileImgs?.grass || tileImgs?.grass2;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Base meadow – moderne soft green
  const base = ctx.createLinearGradient(0, 0, w * 0.15, h);
  base.addColorStop(0, '#c5dfa8');
  base.addColorStop(0.4, '#b8d69a');
  base.addColorStop(0.75, '#c8d9a4');
  base.addColorStop(1, '#d2d0a8');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 2) Soft grass texture wash (stor scale, lav alpha – ingen cells)
  if (grass && grass.complete && grass.naturalWidth > 0) {
    ctx.globalAlpha = 0.22;
    const tw = Math.max(180, Math.min(280, w * 0.12));
    for (let y = -tw * 0.2; y < h + tw; y += tw * 0.85) {
      for (let x = -tw * 0.2; x < w + tw; x += tw * 0.85) {
        const ox = ((x * 0.01) % 1) * 12;
        ctx.drawImage(grass, x + ox, y, tw * 1.05, tw * 1.05);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 3) Soft color noise (meget subtil)
  const seed = tileMap.seed || 1;
  for (let i = 0; i < 28; i++) {
    const nx = noise2(i * 3, 7, seed);
    const ny = noise2(i * 5, 11, seed + 2);
    const x = nx * w;
    const y = ny * h;
    const r = Math.min(w, h) * (0.06 + noise2(i, 2, seed) * 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = noise2(i, 9, seed) > 0.5;
    g.addColorStop(0, warm ? 'rgba(200, 190, 120, 0.07)' : 'rgba(100, 150, 80, 0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4) Dirt patches (bløde ellipser)
  for (const p of tileMap.dirtPatches || []) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(p.rx, p.ry));
    g.addColorStop(0, `rgba(196, 175, 130, ${p.alpha * 1.1})`);
    g.addColorStop(0.55, `rgba(180, 160, 115, ${p.alpha * 0.55})`);
    g.addColorStop(1, 'rgba(180, 160, 115, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5) Diskrete stier
  for (const pts of tileMap.paths || []) {
    if (!pts || pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(150, 125, 85, 0.14)';
    ctx.lineWidth = Math.min(w, h) * 0.008;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(210, 190, 150, 0.12)';
    ctx.lineWidth = Math.min(w, h) * 0.004;
    ctx.stroke();
  }

  // 6) Skov – bløde canopy-klumper
  for (const f of tileMap.forestBlobs || []) {
    drawForestBlob(ctx, f);
  }

  // 7) Soft light
  const sun = ctx.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.45, h * 0.4, Math.max(w, h) * 0.6);
  sun.addColorStop(0, 'rgba(255, 252, 240, 0.1)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

function drawForestBlob(ctx, f) {
  const { x, y, r, seed = 1 } = f;
  // soft ground shadow under trees
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 4, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 55, 30, 0.1)';
  ctx.fill();

  const n = 5 + (seed % 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + noise2(i, seed, 3) * 0.8;
    const d = r * (0.15 + noise2(i, seed + 1, 5) * 0.55);
    const cx = x + Math.cos(a) * d;
    const cy = y + Math.sin(a) * d * 0.75;
    const tr = r * (0.28 + noise2(i, seed + 2, 7) * 0.28);
    const g = ctx.createRadialGradient(cx - tr * 0.2, cy - tr * 0.25, tr * 0.1, cx, cy, tr);
    g.addColorStop(0, 'rgba(120, 165, 90, 0.45)');
    g.addColorStop(0.5, 'rgba(70, 120, 60, 0.4)');
    g.addColorStop(1, 'rgba(45, 85, 40, 0.05)');
    ctx.beginPath();
    ctx.arc(cx, cy, tr, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  // center canopy
  const g0 = ctx.createRadialGradient(x - r * 0.1, y - r * 0.15, 0, x, y, r * 0.55);
  g0.addColorStop(0, 'rgba(95, 145, 75, 0.4)');
  g0.addColorStop(1, 'rgba(50, 90, 45, 0.05)');
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = g0;
  ctx.fill();
}
