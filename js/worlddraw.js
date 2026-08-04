/**
 * World terrain – only the playable map rect (no infinite empty land).
 */

import { drawWaterBodies } from './water.js';
import { getPlaceSprite } from './assets.js';

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw terrain clipped to playable world bounds only.
 */
export function drawWorldTerrain(ctx, worldW, worldH, dpr, districts = [], seed = 42, waterBodies = null) {
  const w = worldW;
  const h = worldH;
  const rng = mulberry32((seed | 0) + 991);

  // Soft board / paper edge under map
  ctx.fillStyle = 'rgba(28, 25, 23, 0.12)';
  ctx.beginPath();
  roundRectPath(ctx, -6 * dpr, -6 * dpr, w + 12 * dpr, h + 12 * dpr, 18 * dpr);
  ctx.fill();

  // Map surface
  const base = ctx.createLinearGradient(0, 0, w * 0.2, h);
  base.addColorStop(0, '#cfe5b8');
  base.addColorStop(0.4, '#e2ecc4');
  base.addColorStop(0.75, '#ebe2c8');
  base.addColorStop(1, '#d9ceb4');
  ctx.fillStyle = base;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.fill();

  // Clip all terrain to map
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.clip();

  // Biomes
  for (let i = 0; i < 12; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.1 + rng() * 0.16) * Math.min(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (rng() < 0.5) {
      g.addColorStop(0, 'rgba(100, 160, 85, 0.22)');
      g.addColorStop(1, 'rgba(100, 160, 85, 0)');
    } else {
      g.addColorStop(0, 'rgba(150, 140, 95, 0.14)');
      g.addColorStop(1, 'rgba(150, 140, 95, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forest clusters
  for (let i = 0; i < 8; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    for (let j = 0; j < 5; j++) {
      const ox = (rng() - 0.5) * 70 * dpr;
      const oy = (rng() - 0.5) * 70 * dpr;
      const r = (14 + rng() * 26) * dpr;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${45 + (rng() * 40) | 0}, ${95 + (rng() * 50) | 0}, ${55 + (rng() * 30) | 0}, 0.28)`;
      ctx.fill();
    }
  }

  if (waterBodies?.length) drawWaterBodies(ctx, waterBodies, dpr);

  for (const d of districts) {
    if (d.type === 'farm') drawFarmFields(ctx, d, dpr, rng);
  }

  // Soft grid only inside map
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.04)';
  ctx.lineWidth = 1;
  const step = 48 * dpr;
  for (let x = step; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = step; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.restore();

  // Map border
  ctx.strokeStyle = 'rgba(68, 64, 60, 0.35)';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 1 * dpr, 1 * dpr, w - 2 * dpr, h - 2 * dpr, 14 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 4 * dpr, 4 * dpr, w - 8 * dpr, h - 8 * dpr, 12 * dpr);
  ctx.stroke();
}

function drawFarmFields(ctx, d, dpr, rng) {
  const rows = 5;
  const fw = d.r * 2.6;
  const fh = d.r * 2.0;
  ctx.save();
  ctx.translate(d.x + d.r * 0.85, d.y + d.r * 0.4);
  ctx.rotate(-0.1);
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(154, 200, 78, 0.28)' : 'rgba(210, 180, 85, 0.22)';
    ctx.fillRect(-fw / 2, -fh / 2 + (i / rows) * fh, fw, fh / rows - dpr);
  }
  ctx.restore();
}

/**
 * Place without ugly glow-bubbles: sprite or clean silhouette + label.
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, darkenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type);
  const size = d.r * 2.15;

  // Soft contact shadow only (no colored orb)
  ctx.beginPath();
  ctx.ellipse(d.x + 2 * dpr, d.y + size * 0.28, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28, 25, 23, 0.2)';
  ctx.fill();

  // Small asphalt pad for road connection (not a bubble)
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + size * 0.22, size * 0.22, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(55, 50, 48, 0.35)';
  ctx.fill();

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const iw = size;
    const ih = size;
    ctx.drawImage(sprite, d.x - iw / 2, d.y - ih * 0.62, iw, ih);
  } else {
    // Clean non-glow fallback disc (muted)
    ctx.beginPath();
    ctx.arc(d.x, d.y - size * 0.05, size * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    drawSilhouette(ctx, d, type);
  }

  // Hub pin (connection target)
  ctx.beginPath();
  ctx.arc(d.x, d.y + size * 0.18, 4.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.35)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  // Label card
  const icon = d.icon || '';
  const typeLabel = d.typeLabel || '';
  ctx.font = `bold ${Math.max(10, 11 * dpr)}px system-ui, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`.trim()).width;
  const padX = 8 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2 + 4 * dpr;
  const bh = 28 * dpr;
  const bx = d.x - bw / 2;
  const by = d.y + size * 0.32;

  ctx.fillStyle = 'rgba(28,25,23,0.12)';
  roundRect(ctx, bx + 1.5 * dpr, by + 2 * dpr, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, bx, by, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.fillStyle = d.color || '#a8a29e';
  roundRect(ctx, bx, by, 3.5 * dpr, bh, 2 * dpr);
  ctx.fill();

  ctx.fillStyle = '#1c1917';
  ctx.font = `bold ${Math.max(10, 11 * dpr)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x + 1 * dpr, by + 10 * dpr);
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(`${icon} ${typeLabel}`.trim(), d.x + 1 * dpr, by + 20 * dpr);
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

function roundRectPath(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
}
