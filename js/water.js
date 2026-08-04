/**
 * Water bodies + bridge collision (D1+).
 * Coasts near harbors, optional lakes; roads need bridge mode to cross.
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
 * @returns {Array<{kind:'ellipse', cx, cy, rx, ry, role:string}>}
 */
export function buildWaterBodies(worldW, worldH, districts = [], seed = 42) {
  const w = worldW;
  const h = worldH;
  const rng = mulberry32((seed | 0) + 404);
  const bodies = [];
  const minSide = Math.min(w, h);

  // Coast / bay near each harbor
  for (const d of districts) {
    if (d.type !== 'harbor') continue;
    const towardLeft = d.x < w * 0.5;
    const towardTop = d.y < h * 0.5;
    // Main bay
    bodies.push({
      kind: 'ellipse',
      cx: towardLeft ? d.x - d.r * 2.1 : d.x + d.r * 2.1,
      cy: d.y + d.r * 0.15,
      rx: d.r * 4.6,
      ry: d.r * 3.4,
      role: 'bay'
    });
    // Outer sea blob toward map edge
    bodies.push({
      kind: 'ellipse',
      cx: towardLeft ? Math.min(d.x, w * 0.08) : Math.max(d.x, w * 0.92),
      cy: d.y + (towardTop ? -d.r : d.r) * 0.4,
      rx: d.r * 5.5,
      ry: d.r * 4.2,
      role: 'sea'
    });
  }

  // One scenic lake away from capital (if room)
  const capital = districts.find(d => d.type === 'capital');
  if (districts.length >= 5) {
    let lx = w * (0.35 + rng() * 0.3);
    let ly = h * (0.3 + rng() * 0.35);
    if (capital) {
      lx = capital.x + (rng() > 0.5 ? 1 : -1) * minSide * 0.22;
      ly = capital.y + (rng() > 0.5 ? 1 : -1) * minSide * 0.18;
    }
    bodies.push({
      kind: 'ellipse',
      cx: Math.max(minSide * 0.12, Math.min(w - minSide * 0.12, lx)),
      cy: Math.max(minSide * 0.12, Math.min(h - minSide * 0.12, ly)),
      rx: minSide * (0.07 + rng() * 0.04),
      ry: minSide * (0.05 + rng() * 0.03),
      role: 'lake'
    });
  }

  return bodies;
}

export function pointInEllipse(x, y, b) {
  const dx = (x - b.cx) / (b.rx || 1);
  const dy = (y - b.cy) / (b.ry || 1);
  return dx * dx + dy * dy <= 1;
}

export function pointInWater(x, y, bodies) {
  if (!bodies || !bodies.length) return false;
  for (const b of bodies) {
    if (b.kind === 'ellipse' && pointInEllipse(x, y, b)) return true;
  }
  return false;
}

/** Sample stroke: fraction of length over water */
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

export function drawWaterBodies(ctx, bodies, dpr) {
  if (!bodies?.length) return;
  for (const b of bodies) {
    if (b.kind !== 'ellipse') continue;
    const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.max(b.rx, b.ry));
    if (b.role === 'lake') {
      g.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
      g.addColorStop(0.55, 'rgba(14, 165, 233, 0.32)');
      g.addColorStop(1, 'rgba(14, 165, 233, 0)');
    } else {
      g.addColorStop(0, 'rgba(14, 165, 233, 0.58)');
      g.addColorStop(0.5, 'rgba(2, 132, 199, 0.4)');
      g.addColorStop(1, 'rgba(3, 105, 161, 0.05)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoreline
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2.2 * dpr;
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy, b.rx * 0.92, b.ry * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Wave hints
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.3 * dpr;
    for (let i = 0; i < 3; i++) {
      const yy = b.cy - b.ry * 0.35 + i * b.ry * 0.28;
      ctx.beginPath();
      ctx.moveTo(b.cx - b.rx * 0.55, yy);
      ctx.quadraticCurveTo(b.cx, yy + 5 * dpr, b.cx + b.rx * 0.55, yy);
      ctx.stroke();
    }
  }
}
