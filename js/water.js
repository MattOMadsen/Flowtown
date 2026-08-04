/**
 * Water bodies + bridge collision.
 * Lakes/bays drawn as soft organic shapes (not hard ellipses).
 */

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @returns {Array<object>}
 */
export function buildWaterBodies(worldW, worldH, districts = [], seed = 42) {
  const w = worldW;
  const h = worldH;
  const rng = mulberry32((seed | 0) + 404);
  const bodies = [];
  const minSide = Math.min(w, h);

  for (const d of districts) {
    if (d.type !== 'harbor') continue;
    const towardLeft = d.x < w * 0.5;
    const towardTop = d.y < h * 0.5;
    // Bug: for tæt/for stor bugt slugte havne-hub → kunne ikke starte vej.
    // Skub vand længere væk og hold en land-ring omkring byen.
    const bayCx = towardLeft
      ? Math.max(d.r * 2.2, d.x - d.r * 3.6)
      : Math.min(w - d.r * 2.2, d.x + d.r * 3.6);
    const bayCy = d.y + (towardTop ? -d.r * 0.2 : d.r * 0.2);
    bodies.push({
      kind: 'blob',
      role: 'bay',
      cx: bayCx,
      cy: bayCy,
      rx: d.r * 3.9,
      ry: d.r * 3.0,
      rot: (towardLeft ? -0.2 : 0.2) + (rng() - 0.5) * 0.12,
      lobes: 7 + Math.floor(rng() * 2),
      seed: (seed + d.x * 3) | 0
    });
    // Soft open water toward map edge (still one organic body)
    bodies.push({
      kind: 'blob',
      role: 'sea',
      cx: towardLeft ? Math.max(minSide * 0.06, bayCx - d.r * 2.2) : Math.min(w - minSide * 0.06, bayCx + d.r * 2.2),
      cy: bayCy + (towardTop ? -d.r * 0.45 : d.r * 0.45),
      rx: d.r * 5.0,
      ry: d.r * 3.8,
      rot: (towardLeft ? 0.1 : -0.1),
      lobes: 8,
      seed: (seed + 99 + d.y * 2) | 0
    });
  }

  // Scenic lakes (organic, not random ugly ovals on places)
  const capital = districts.find(d => d.type === 'capital');
  if (districts.length >= 4) {
    const places = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      let lx = w * (0.28 + rng() * 0.44);
      let ly = h * (0.28 + rng() * 0.44);
      if (capital && attempt < 6) {
        const ang = rng() * Math.PI * 2;
        lx = capital.x + Math.cos(ang) * minSide * (0.22 + rng() * 0.12);
        ly = capital.y + Math.sin(ang) * minSide * (0.18 + rng() * 0.1);
      }
      lx = Math.max(minSide * 0.14, Math.min(w - minSide * 0.14, lx));
      ly = Math.max(minSide * 0.14, Math.min(h - minSide * 0.14, ly));
      // Keep clear of place hubs
      let ok = true;
      for (const d of districts) {
        if (Math.hypot(d.x - lx, d.y - ly) < d.r * 3.2) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      places.push({ lx, ly });
      if (places.length >= (districts.length >= 7 ? 2 : 1)) break;
    }
    for (const p of places) {
      bodies.push({
        kind: 'blob',
        role: 'lake',
        cx: p.lx,
        cy: p.ly,
        rx: minSide * (0.055 + rng() * 0.035),
        ry: minSide * (0.042 + rng() * 0.028),
        rot: rng() * Math.PI,
        lobes: 7 + Math.floor(rng() * 3),
        seed: (seed + p.lx * 10) | 0
      });
    }
  }

  return bodies;
}

/** Build organic polygon points for a water blob */
export function blobPoints(b) {
  const lobes = b.lobes || 6;
  const rng = mulberry32((b.seed || 1) | 0);
  const pts = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // multi-frequency wobble
    const wobble =
      0.82 +
      0.1 * Math.sin(a * lobes + rng() * 2) +
      0.06 * Math.sin(a * (lobes + 2) * 0.7) +
      0.04 * Math.cos(a * 2.3);
    const x0 = Math.cos(a) * b.rx * wobble;
    const y0 = Math.sin(a) * b.ry * wobble;
    const c = Math.cos(b.rot || 0);
    const s = Math.sin(b.rot || 0);
    pts.push({
      x: b.cx + x0 * c - y0 * s,
      y: b.cy + x0 * s + y0 * c
    });
  }
  return pts;
}

export function pointInEllipse(x, y, b) {
  // Approximate with rotated ellipse for collision (slightly expanded)
  const c = Math.cos(-(b.rot || 0));
  const s = Math.sin(-(b.rot || 0));
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  const rx = (b.rx || 1) * 1.05;
  const ry = (b.ry || 1) * 1.05;
  return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Array} bodies
 * @param {Array|null} [districts] – hub/kyst-ring tæller ikke som vand (kan bygge fra havn)
 */
export function pointInWater(x, y, bodies, districts = null) {
  if (!bodies || !bodies.length) return false;
  // Land-ring omkring byer (især havn) – bugt må ikke æde hub’en
  if (districts?.length) {
    for (const d of districts) {
      const r = d.r || 40;
      if (Math.hypot(x - d.x, y - d.y) < r * 1.4) return false;
    }
  }
  for (const b of bodies) {
    if ((b.kind === 'ellipse' || b.kind === 'blob') && pointInEllipse(x, y, b)) return true;
  }
  return false;
}

export function strokeWaterFraction(points, bodies, districts = null) {
  if (!points || points.length < 2 || !bodies?.length) return 0;
  let waterLen = 0;
  let total = 0;
  const steps = 24;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1) continue;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dl = seg / steps;
      total += dl;
      if (pointInWater(x, y, bodies, districts)) waterLen += dl;
    }
  }
  return total > 0 ? waterLen / total : 0;
}

function pathBlob(ctx, b) {
  const pts = blobPoints(b);
  if (pts.length < 3) return;
  // Smooth closed curve through midpoints
  const n = pts.length;
  const mid = (i) => {
    const a = pts[i % n];
    const c = pts[(i + 1) % n];
    return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  };
  const m0 = mid(n - 1);
  ctx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(i);
    ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
  }
  ctx.closePath();
}

/**
 * Pretty lakes/bays: fully opaque organic fill so square tiles never show through.
 */
export function drawWaterBodies(ctx, bodies, dpr) {
  if (!bodies?.length) return;

  for (const b of bodies) {
    const isLake = b.role === 'lake';
    const maxR = Math.max(b.rx, b.ry);

    // Soft sand halo
    ctx.beginPath();
    pathBlob(ctx, { ...b, rx: b.rx * 1.16, ry: b.ry * 1.16 });
    ctx.fillStyle = isLake ? 'rgba(230, 218, 185, 0.85)' : 'rgba(220, 205, 170, 0.8)';
    ctx.fill();

    // Beach
    ctx.beginPath();
    pathBlob(ctx, { ...b, rx: b.rx * 1.07, ry: b.ry * 1.07 });
    ctx.fillStyle = isLake ? '#efe4c8' : '#e5d8b8';
    ctx.fill();

    // Water – lysere, mere “glass 2026”
    const g = ctx.createRadialGradient(
      b.cx - b.rx * 0.2,
      b.cy - b.ry * 0.25,
      maxR * 0.05,
      b.cx,
      b.cy,
      maxR * 1.02
    );
    if (isLake) {
      g.addColorStop(0, '#c8f0ff');
      g.addColorStop(0.3, '#8fddff');
      g.addColorStop(0.6, '#4ec4f5');
      g.addColorStop(0.88, '#1a9fd4');
      g.addColorStop(1, '#0b6f9e');
    } else {
      g.addColorStop(0, '#9fe4ff');
      g.addColorStop(0.35, '#5bc8f5');
      g.addColorStop(0.65, '#28aee0');
      g.addColorStop(0.9, '#0f88c0');
      g.addColorStop(1, '#0a5a88');
    }
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.fillStyle = g;
    ctx.fill();

    // Thin modern rim
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.strokeStyle = 'rgba(10, 80, 120, 0.22)';
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();

    // Specular glass sheen
    ctx.save();
    ctx.beginPath();
    pathBlob(ctx, {
      ...b,
      rx: b.rx * 0.62,
      ry: b.ry * 0.38,
      cy: b.cy - b.ry * 0.18,
      cx: b.cx - b.rx * 0.08
    });
    const sheen = ctx.createLinearGradient(
      b.cx - b.rx * 0.4, b.cy - b.ry * 0.35,
      b.cx + b.rx * 0.2, b.cy + b.ry * 0.1
    );
    sheen.addColorStop(0, 'rgba(255,255,255,0.38)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.restore();

    // Sparkle dots
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + (b.seed || 0) * 0.01;
      const rr = 0.25 + (i % 3) * 0.12;
      const sx = b.cx + Math.cos(ang) * b.rx * rr;
      const sy = b.cy + Math.sin(ang) * b.ry * rr * 0.7 - b.ry * 0.08;
      const sr = (1.1 + (i % 2)) * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shore line
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2.4 * dpr;
    ctx.stroke();
    ctx.beginPath();
    pathBlob(ctx, { ...b, rx: b.rx * 0.97, ry: b.ry * 0.97 });
    ctx.strokeStyle = 'rgba(12, 74, 110, 0.28)';
    ctx.lineWidth = 1.3 * dpr;
    ctx.stroke();

    // Soft wave arcs (more)
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1.35 * dpr;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const t = 0.18 + i * 0.12;
      const yy = b.cy - b.ry * 0.28 + i * b.ry * 0.13;
      const span = b.rx * (0.32 + t * 0.28);
      ctx.beginPath();
      ctx.moveTo(b.cx - span, yy);
      ctx.quadraticCurveTo(
        b.cx + span * 0.1,
        yy + 5 * dpr * (i % 2 === 0 ? 1 : -1),
        b.cx + span,
        yy
      );
      ctx.stroke();
    }

    // Lake reeds (subtle)
    if (isLake) {
      const rng = mulberry32((b.seed || 1) + 3);
      ctx.strokeStyle = 'rgba(74, 120, 60, 0.45)';
      ctx.lineWidth = 1.4 * dpr;
      for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2;
        const edge = 0.92 + rng() * 0.08;
        const c = Math.cos(b.rot || 0);
        const s = Math.sin(b.rot || 0);
        const lx = Math.cos(a) * b.rx * edge;
        const ly = Math.sin(a) * b.ry * edge;
        const x = b.cx + lx * c - ly * s;
        const y = b.cy + lx * s + ly * c;
        const h = (6 + rng() * 10) * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (rng() - 0.5) * 4 * dpr, y - h * 0.5, x + (rng() - 0.5) * 3 * dpr, y - h);
        ctx.stroke();
      }
    }
  }
}
