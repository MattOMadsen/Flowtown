/**
 * Cozy world rendering – terrain, water, fields, place hubs (VIS2).
 */

import { drawWaterBodies } from './water.js';

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Full world backdrop.
 * @param {object[]} [waterBodies] from water.js
 */
export function drawWorldTerrain(ctx, worldW, worldH, dpr, districts = [], seed = 42, waterBodies = null) {
  const w = worldW;
  const h = worldH;
  const rng = mulberry32((seed | 0) + 991);

  // Base land – richer meadow gradient
  const base = ctx.createLinearGradient(0, 0, w * 0.15, h);
  base.addColorStop(0, '#d4e5c8');
  base.addColorStop(0.28, '#e2ebc9');
  base.addColorStop(0.55, '#ebe3cf');
  base.addColorStop(0.8, '#e0d6c0');
  base.addColorStop(1, '#d2c8b2');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Large soft biomes
  for (let i = 0; i < 16; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.1 + rng() * 0.2) * Math.min(w, h);
    const kind = rng();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (kind < 0.4) {
      g.addColorStop(0, 'rgba(110, 165, 95, 0.26)');
      g.addColorStop(1, 'rgba(110, 165, 95, 0)');
    } else if (kind < 0.7) {
      g.addColorStop(0, 'rgba(168, 150, 100, 0.16)');
      g.addColorStop(1, 'rgba(168, 150, 100, 0)');
    } else {
      g.addColorStop(0, 'rgba(75, 120, 75, 0.2)');
      g.addColorStop(1, 'rgba(75, 120, 75, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forest clumps with trunk dots
  for (let i = 0; i < 11; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const n = 5 + Math.floor(rng() * 6);
    for (let j = 0; j < n; j++) {
      const ox = (rng() - 0.5) * 90 * dpr;
      const oy = (rng() - 0.5) * 90 * dpr;
      const r = (16 + rng() * 32) * dpr;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${40 + rng() * 35 | 0}, ${85 + rng() * 55 | 0}, ${48 + rng() * 35 | 0}, 0.26)`;
      ctx.fill();
      // canopy highlight
      ctx.beginPath();
      ctx.arc(cx + ox - r * 0.2, cy + oy - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
    }
  }

  // Water (coast, bays, lakes)
  if (waterBodies?.length) {
    drawWaterBodies(ctx, waterBodies, dpr);
  } else {
    // fallback harbor blobs
    for (const d of districts) {
      if (d.type !== 'harbor') continue;
      drawHarborWaterLegacy(ctx, d, dpr, w, h);
    }
  }

  // Farm fields
  for (const d of districts) {
    if (d.type !== 'farm') continue;
    drawFarmFields(ctx, d, dpr, rng);
  }

  // Factory haze
  for (const d of districts) {
    if (d.type !== 'factory') continue;
    const g = ctx.createRadialGradient(d.x, d.y - d.r * 1.2, 0, d.x, d.y, d.r * 3.5);
    g.addColorStop(0, 'rgba(120, 100, 80, 0.1)');
    g.addColorStop(1, 'rgba(120, 100, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle grid
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.025)';
  ctx.lineWidth = 1;
  const step = 64 * dpr;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Vignette
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40, 35, 28, 0.08)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawHarborWaterLegacy(ctx, d, dpr, worldW) {
  const towardLeft = d.x < worldW * 0.5;
  const wx = towardLeft ? d.x - d.r * 1.8 : d.x + d.r * 1.8;
  const wy = d.y + d.r * 0.2;
  const rw = d.r * 4.2;
  const rh = d.r * 3.2;
  const water = ctx.createRadialGradient(wx, wy, 0, wx, wy, rw * 1.2);
  water.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
  water.addColorStop(0.45, 'rgba(14, 165, 233, 0.38)');
  water.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.ellipse(wx, wy, rw, rh, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFarmFields(ctx, d, dpr, rng) {
  const rows = 6;
  const fw = d.r * 3.0;
  const fh = d.r * 2.4;
  ctx.save();
  ctx.translate(d.x + d.r * 0.95, d.y + d.r * 0.35);
  ctx.rotate(-0.12 + (rng() - 0.5) * 0.15);
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(154, 200, 78, 0.32)' : 'rgba(210, 180, 85, 0.26)';
    ctx.fillRect(-fw / 2, -fh / 2 + t * fh, fw, fh / rows - 1.2 * dpr);
  }
  // dirt path through fields
  ctx.strokeStyle = 'rgba(160, 130, 80, 0.25)';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  ctx.moveTo(-fw * 0.4, fh * 0.35);
  ctx.lineTo(fw * 0.35, -fh * 0.2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 90, 50, 0.22)';
  ctx.lineWidth = 1.4 * dpr;
  ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
  ctx.restore();
}

/**
 * VIS2 place hub – richer plate + detailed silhouette + label card.
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, darkenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';

  const glow = ctx.createRadialGradient(d.x, d.y, d.r * 0.12, d.x, d.y, d.r * 2.55);
  glow.addColorStop(0, (d.color || '#888') + '70');
  glow.addColorStop(0.5, (d.color || '#888') + '22');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 2.55, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(d.x + 2 * dpr, d.y + d.r * 0.58, d.r * 1.08, d.r * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28, 25, 23, 0.18)';
  ctx.fill();

  // Stone ring base
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 1.08, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(68, 64, 60, 0.2)';
  ctx.fill();

  const disc = ctx.createRadialGradient(
    d.x - d.r * 0.32, d.y - d.r * 0.38, d.r * 0.08,
    d.x, d.y, d.r * 1.02
  );
  disc.addColorStop(0, lightenHex(d.color, 0.32));
  disc.addColorStop(0.5, d.color);
  disc.addColorStop(1, darkenHex(d.color, 0.74));
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 0.88, 0, Math.PI * 2);
  ctx.strokeStyle = darkenHex(d.color, 0.62);
  ctx.lineWidth = 1.6 * dpr;
  ctx.stroke();

  // Connection hub (asphalt pad)
  ctx.beginPath();
  ctx.arc(d.x, d.y + d.r * 0.22, d.r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(55, 50, 48, 0.45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d.x, d.y + d.r * 0.22, d.r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.fill();

  drawSilhouette(ctx, d, type);

  // Label card
  const icon = d.icon || '🏠';
  const typeLabel = d.typeLabel || '';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 9 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`).width;
  const padX = 9 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2;
  const bh = 32 * dpr;
  const bx = d.x - bw / 2;
  const by = d.y + d.r * 0.82;

  ctx.fillStyle = 'rgba(28,25,23,0.14)';
  roundRect(ctx, bx + 2 * dpr, by + 2.5 * dpr, bw, bh, 9 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, bx, by, bw, bh, 9 * dpr);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.12)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();
  // accent bar by type color
  ctx.fillStyle = d.color || '#a8a29e';
  ctx.globalAlpha = 0.85;
  roundRect(ctx, bx, by, 4 * dpr, bh, 2 * dpr);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#1c1917';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x + 1 * dpr, by + 11.5 * dpr);
  ctx.font = `${Math.max(8, 9 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(`${icon} ${typeLabel}`, d.x + 1 * dpr, by + 22.5 * dpr);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
