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
 * Sømløs tegning – ren gradient + ellipser. INGEN tile-bitmaps (de skaber firkanter).
 */
export function drawTileMap(ctx, tileMap, _tileImgs) {
  if (!tileMap) return;

  const w = tileMap.worldW || 2000;
  const h = tileMap.worldH || 1500;
  const seed = tileMap.seed || 1;

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  // 1) Ren meadow – ingen tekstur-fliser
  const base = ctx.createLinearGradient(0, 0, w * 0.2, h);
  base.addColorStop(0, '#c8e0aa');
  base.addColorStop(0.35, '#bdd99c');
  base.addColorStop(0.7, '#c6dba4');
  base.addColorStop(1, '#d0d4a8');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 2) Subtile farve-blobs (store, meget bløde – ingen gitter)
  for (let i = 0; i < 18; i++) {
    const x = noise2(i * 3, 7, seed) * w;
    const y = noise2(i * 5, 11, seed + 2) * h;
    const r = Math.min(w, h) * (0.08 + noise2(i, 2, seed) * 0.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = noise2(i, 9, seed) > 0.55;
    g.addColorStop(0, warm ? 'rgba(195, 185, 120, 0.09)' : 'rgba(110, 155, 85, 0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3) Dirt patches
  for (const p of tileMap.dirtPatches || []) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(p.rx, p.ry));
    g.addColorStop(0, `rgba(196, 175, 130, ${Math.min(0.28, p.alpha * 1.15)})`);
    g.addColorStop(0.6, `rgba(180, 160, 115, ${p.alpha * 0.4})`);
    g.addColorStop(1, 'rgba(180, 160, 115, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4) Stier – meget tynde
  for (const pts of tileMap.paths || []) {
    if (!pts || pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = 'rgba(145, 120, 80, 0.12)';
    ctx.lineWidth = Math.min(w, h) * 0.006;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 5) Skov – skarpe mini-træer (ikke grøn tåge)
  for (const f of tileMap.forestBlobs || []) {
    drawForestBlob(ctx, f);
  }

  // 6) Let lys
  const sun = ctx.createRadialGradient(w * 0.28, h * 0.18, 0, w * 0.4, h * 0.35, Math.max(w, h) * 0.55);
  sun.addColorStop(0, 'rgba(255, 252, 240, 0.08)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

/** Skarpe top-down træer – flere små cirkler med synlig kant, ikke sløret sky */
function drawForestBlob(ctx, f) {
  const { x, y, r, seed = 1 } = f;
  const scale = Math.max(28, r * 0.55);

  // diskret skygge under lunden
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 3, scale * 1.15, scale * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(35, 50, 25, 0.12)';
  ctx.fill();

  const n = 7 + (seed % 5);
  // bageste træer først
  const trees = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + noise2(i, seed, 3) * 1.1;
    const d = scale * (0.12 + noise2(i, seed + 1, 5) * 0.7);
    trees.push({
      cx: x + Math.cos(a) * d,
      cy: y + Math.sin(a) * d * 0.7,
      tr: scale * (0.22 + noise2(i, seed + 2, 7) * 0.2),
      shade: 0.35 + noise2(i, seed + 4, 9) * 0.35
    });
  }
  trees.sort((a, b) => a.cy - b.cy);

  for (const t of trees) {
    // solid canopy (ikke transparent gradient-udsmeltning)
    const fill = t.shade > 0.55 ? '#4d8a42' : t.shade > 0.4 ? '#5a9a4a' : '#6aad55';
    const edge = '#3a6b34';
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, t.tr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, t.tr * 0.08);
    ctx.stroke();
    // lille highlight
    ctx.beginPath();
    ctx.arc(t.cx - t.tr * 0.25, t.cy - t.tr * 0.28, t.tr * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
  }

  // midtertræ
  ctx.beginPath();
  ctx.arc(x, y - scale * 0.05, scale * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = '#4a8540';
  ctx.fill();
  ctx.strokeStyle = '#355f30';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}
