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
    bodies.push({
      kind: 'blob',
      role: 'bay',
      cx: towardLeft ? d.x - d.r * 1.9 : d.x + d.r * 1.9,
      cy: d.y + d.r * 0.2,
      rx: d.r * 4.2,
      ry: d.r * 3.0,
      rot: (towardLeft ? -0.15 : 0.15) + (rng() - 0.5) * 0.2,
      lobes: 5 + Math.floor(rng() * 3),
      seed: (seed + d.x) | 0
    });
    bodies.push({
      kind: 'blob',
      role: 'sea',
      cx: towardLeft ? Math.min(d.x * 0.55, w * 0.12) : Math.max(d.x + (w - d.x) * 0.45, w * 0.88),
      cy: d.y + (towardTop ? -d.r * 0.3 : d.r * 0.3),
      rx: d.r * 5.0,
      ry: d.r * 3.8,
      rot: rng() * 0.4 - 0.2,
      lobes: 6,
      seed: (seed + 99 + d.y) | 0
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

export function pointInWater(x, y, bodies) {
  if (!bodies || !bodies.length) return false;
  for (const b of bodies) {
    if ((b.kind === 'ellipse' || b.kind === 'blob') && pointInEllipse(x, y, b)) return true;
  }
  return false;
}

export function strokeWaterFraction(points, bodies) {
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
      if (pointInWater(x, y, bodies)) waterLen += dl;
    }
  }
  return total > 0 ? waterLen / total : 0;
}

function pathBlob(ctx, b) {
  const pts = blobPoints(b);
  if (pts.length < 3) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
  }
  ctx.closePath();
}

/**
 * Pretty lakes/bays: shore, depth gradient, soft waves, light reeds on lakes.
 */
export function drawWaterBodies(ctx, bodies, dpr) {
  if (!bodies?.length) return;

  for (const b of bodies) {
    const isLake = b.role === 'lake';
    const maxR = Math.max(b.rx, b.ry);

    // Soft sand/shore underlay
    ctx.beginPath();
    pathBlob(ctx, {
      ...b,
      rx: b.rx * 1.12,
      ry: b.ry * 1.12
    });
    ctx.fillStyle = isLake
      ? 'rgba(214, 196, 150, 0.55)'
      : 'rgba(196, 180, 140, 0.4)';
    ctx.fill();

    // Depth gradient water
    const g = ctx.createRadialGradient(
      b.cx - b.rx * 0.15,
      b.cy - b.ry * 0.2,
      maxR * 0.05,
      b.cx,
      b.cy,
      maxR * 1.05
    );
    if (isLake) {
      g.addColorStop(0, 'rgba(125, 211, 252, 0.92)');
      g.addColorStop(0.35, 'rgba(56, 189, 248, 0.88)');
      g.addColorStop(0.75, 'rgba(14, 165, 233, 0.82)');
      g.addColorStop(1, 'rgba(3, 105, 161, 0.75)');
    } else {
      g.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
      g.addColorStop(0.45, 'rgba(14, 165, 233, 0.85)');
      g.addColorStop(0.85, 'rgba(2, 132, 199, 0.8)');
      g.addColorStop(1, 'rgba(3, 105, 161, 0.7)');
    }
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.fillStyle = g;
    ctx.fill();

    // Inner highlight (sky reflection)
    ctx.save();
    ctx.beginPath();
    pathBlob(ctx, {
      ...b,
      rx: b.rx * 0.55,
      ry: b.ry * 0.4,
      cy: b.cy - b.ry * 0.15
    });
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.restore();

    // Shore line
    ctx.beginPath();
    pathBlob(ctx, b);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    ctx.beginPath();
    pathBlob(ctx, {
      ...b,
      rx: b.rx * 0.97,
      ry: b.ry * 0.97
    });
    ctx.strokeStyle = 'rgba(12, 74, 110, 0.2)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();

    // Soft wave arcs
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const t = 0.25 + i * 0.15;
      const yy = b.cy - b.ry * 0.25 + i * b.ry * 0.16;
      const span = b.rx * (0.35 + t * 0.25);
      ctx.beginPath();
      ctx.moveTo(b.cx - span, yy);
      ctx.quadraticCurveTo(b.cx, yy + 4 * dpr * (i % 2 === 0 ? 1 : -1), b.cx + span, yy);
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
