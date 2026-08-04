/**
 * World: sømløst moderne terræn + place hubs.
 */

import { drawWaterBodies } from './water.js';
import { getPlaceSprite, getTileImages } from './assets.js';
import { drawTileMap, drawModernTree } from './tilemap.js';

/**
 * @param {object|null} tileMap
 * @param {{ showHex?: boolean, hexSize?: number }} [opts]
 */
export function drawWorldTerrain(
  ctx, worldW, worldH, dpr, districts = [], seed = 42,
  waterBodies = null, tileMap = null, opts = {}
) {
  const w = worldW;
  const h = worldH;

  // Soft board shadow
  ctx.fillStyle = 'rgba(15, 20, 28, 0.18)';
  ctx.beginPath();
  roundRectPath(ctx, 3 * dpr, 8 * dpr, w + 6 * dpr, h + 6 * dpr, 20 * dpr);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 18 * dpr);
  ctx.clip();

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#d4ebbc');
  base.addColorStop(1, '#c8e0aa');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  if (tileMap) {
    drawTileMap(ctx, tileMap, getTileImages());
  }

  if (waterBodies?.length) {
    drawWaterBodies(ctx, waterBodies, dpr);
  }

  for (const d of districts) {
    if (d.type === 'farm') drawFarmFields(ctx, d, dpr);
  }

  drawAmbientDecor(ctx, w, h, dpr, districts, seed, tileMap);

  const vig = ctx.createRadialGradient(
    w * 0.5, h * 0.42, Math.min(w, h) * 0.28,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(25, 35, 45, 0.08)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();

  // Ultra-thin modern frame
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.25 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 1.25 * dpr, 1.25 * dpr, w - 2.5 * dpr, h - 2.5 * dpr, 17 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30, 40, 50, 0.2)';
  ctx.lineWidth = 1.75 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 18 * dpr);
  ctx.stroke();
}

function drawAmbientDecor(ctx, w, h, dpr, districts, seed, tileMap = null) {
  let s = (seed | 0) + 991;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  // Spredte pæne enkelt-træer (ikke slørede pletter)
  for (let i = 0; i < 16; i++) {
    const x = rng() * w;
    const y = rng() * h;
    let near = false;
    for (const d of districts) {
      if (Math.hypot(d.x - x, d.y - y) < d.r * 2.4) { near = true; break; }
    }
    if (near) continue;
    // undgå skov-klumper
    if (tileMap?.forestBlobs) {
      for (const f of tileMap.forestBlobs) {
        if (Math.hypot(f.x - x, f.y - y) < f.r * 1.4) { near = true; break; }
      }
    }
    if (near) continue;
    drawModernTree(ctx, x, y, (10 + rng() * 14) * dpr, i % 4);
  }
  ctx.restore();
}

function drawFarmFields(ctx, d, dpr) {
  const x = d.x + d.r * 0.75;
  const y = d.y + d.r * 0.4;
  const rx = d.r * 1.5;
  const ry = d.r * 0.95;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(200, 185, 100, 0.12)');
  g.addColorStop(1, 'rgba(200, 185, 100, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Moderne place hub – blød skygge + glass label.
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type, d.spriteKey || null);
  const size = d.r * 1.65;
  const connected = d._connected;
  const groundY = d.y;
  const gc = d.color || '#a8a29e';

  // Soft contact shadow
  ctx.beginPath();
  ctx.ellipse(d.x + 1.5 * dpr, groundY + 2.5 * dpr, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(25, 30, 40, 0.18)';
  ctx.fill();

  if (connected) {
    ctx.beginPath();
    ctx.ellipse(d.x, groundY, size * 0.26, size * 0.085, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const nw = sprite.naturalWidth || size;
    const nh = sprite.naturalHeight || size;
    const aspect = nw / Math.max(1, nh);
    const drawH = size;
    const drawW = drawH * aspect;
    const sink = drawH * 0.08;
    ctx.drawImage(sprite, d.x - drawW / 2, groundY - drawH + sink, drawW, drawH);
  } else {
    ctx.beginPath();
    ctx.arc(d.x, groundY - size * 0.2, size * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.08);
    ctx.fill();
    drawSilhouette(ctx, d, type);
  }

  // Glassmorphism label
  const icon = d.icon || '';
  const typeLabel = d.typeLabel || '';
  ctx.font = `600 ${Math.max(10, 11.5 * dpr)}px system-ui, -apple-system, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`.trim()).width;
  const padX = 10 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2 + 4 * dpr;
  const bh = 27 * dpr;
  const bx = d.x - bw / 2;
  const by = groundY + 10 * dpr;

  ctx.fillStyle = 'rgba(15, 20, 30, 0.1)';
  roundRect(ctx, bx + 1 * dpr, by + 1.5 * dpr, bw, bh, 10 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, bx, by, bw, bh, 10 * dpr);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1 * dpr;
  roundRect(ctx, bx + 0.5 * dpr, by + 0.5 * dpr, bw - dpr, bh - dpr, 9 * dpr);
  ctx.stroke();
  // accent
  ctx.fillStyle = gc;
  roundRect(ctx, bx + 3 * dpr, by + 5 * dpr, 3 * dpr, bh - 10 * dpr, 2 * dpr);
  ctx.fill();

  ctx.fillStyle = '#1c1917';
  ctx.font = `600 ${Math.max(10, 11.5 * dpr)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x + 2 * dpr, by + 9.5 * dpr);
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#78716c';
  ctx.fillText(`${icon} ${typeLabel}`.trim(), d.x + 2 * dpr, by + 19 * dpr);
}

function hexAlpha(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(160,160,160,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
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
