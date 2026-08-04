/**
 * World: sømløst moderne terræn + place hubs.
 */

import { drawWaterBodies } from './water.js';
import { getPlaceSprite, getTileImages } from './assets.js';
import { drawTileMap } from './tilemap.js';

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
  ctx.fillStyle = 'rgba(15, 18, 22, 0.22)';
  ctx.beginPath();
  roundRectPath(ctx, 2 * dpr, 6 * dpr, w + 8 * dpr, h + 8 * dpr, 18 * dpr);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 16 * dpr);
  ctx.clip();

  // Fallback base (tileMap tegner selv sømløst meadow)
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#c5dfa8');
  base.addColorStop(1, '#c8d4a0');
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

  // Ingen hex/firkant-guide – nogensinde
  // Soft vignette
  const vig = ctx.createRadialGradient(
    w * 0.5, h * 0.45, Math.min(w, h) * 0.25,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.7
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(20, 25, 30, 0.1)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();

  // Tynd moderne ramme
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 1.5 * dpr, 1.5 * dpr, w - 3 * dpr, h - 3 * dpr, 15 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30, 35, 40, 0.28)';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 16 * dpr);
  ctx.stroke();
}

function drawAmbientDecor(ctx, w, h, dpr, districts, seed, tileMap = null) {
  let s = (seed | 0) + 991;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  // Få, bløde buske – ikke prik-regn
  for (let i = 0; i < 22; i++) {
    const x = rng() * w;
    const y = rng() * h;
    let near = false;
    for (const d of districts) {
      if (Math.hypot(d.x - x, d.y - y) < d.r * 2.2) { near = true; break; }
    }
    if (near) continue;
    const r = (2 + rng() * 4) * dpr;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(90, 140, 70, 0.16)');
    g.addColorStop(1, 'rgba(90, 140, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFarmFields(ctx, d, dpr) {
  // Meget diskret mark-glød – ingen striber/kasser
  const x = d.x + d.r * 0.7;
  const y = d.y + d.r * 0.35;
  const rx = d.r * 1.6;
  const ry = d.r * 1.0;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(180, 170, 90, 0.1)');
  g.addColorStop(1, 'rgba(180, 170, 90, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Place hub planted on hex terrain (not floating diorama).
 * Sprites uden indbygget platform; blød kontakt-skygge + sink i jorden.
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type, d.spriteKey || null);
  // Lidt mindre end før – isometrisk hus på top-down hex
  const size = d.r * 1.72;
  const connected = d._connected;
  const groundY = d.y;
  const gc = d.color || '#a8a29e';

  // Kun blød skygge – ingen grøn plade oven på tiles
  ctx.beginPath();
  ctx.ellipse(d.x + 2 * dpr, groundY + 3 * dpr, size * 0.32, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 18, 14, 0.26)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(d.x, groundY + 1 * dpr, size * 0.24, size * 0.075, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 28, 22, 0.12)';
  ctx.fill();

  // Tynd farvering (stedfarve) – kun når forbundet
  if (connected) {
    ctx.beginPath();
    ctx.ellipse(d.x, groundY, size * 0.22, size * 0.07, 0, 0, Math.PI * 2);
    ctx.strokeStyle = hexAlpha(gc, 0.35);
    ctx.lineWidth = 1.3 * dpr;
    ctx.stroke();
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const nw = sprite.naturalWidth || size;
    const nh = sprite.naturalHeight || size;
    const aspect = nw / Math.max(1, nh);
    const drawH = size;
    const drawW = drawH * aspect;
    // Sink: husets “fødder” graver lidt ned i skyggen
    const sink = drawH * 0.1;
    const dx = d.x - drawW / 2;
    const dy = groundY - drawH + sink;
    ctx.drawImage(sprite, dx, dy, drawW, drawH);
  } else {
    ctx.beginPath();
    ctx.arc(d.x, groundY - size * 0.2, size * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.08);
    ctx.fill();
    drawSilhouette(ctx, d, type);
  }

  // Lille hub-prik ved jorden (foran hus)
  ctx.beginPath();
  ctx.arc(d.x, groundY + 0.5 * dpr, 3 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.35)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  if (connected) {
    ctx.beginPath();
    ctx.ellipse(d.x, groundY, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }

  // Label under hus
  const icon = d.icon || '';
  const typeLabel = d.typeLabel || '';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`.trim()).width;
  const padX = 9 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2 + 4 * dpr;
  const bh = 28 * dpr;
  const bx = d.x - bw / 2;
  const by = groundY + 11 * dpr;

  ctx.fillStyle = 'rgba(15,12,10,0.16)';
  roundRect(ctx, bx + 1.5 * dpr, by + 2 * dpr, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, bx, by, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.fillStyle = d.color || '#a8a29e';
  roundRect(ctx, bx, by, 3.5 * dpr, bh, 2 * dpr);
  ctx.fill();

  ctx.fillStyle = '#1c1917';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x + 1.5 * dpr, by + 10 * dpr);
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(`${icon} ${typeLabel}`.trim(), d.x + 1.5 * dpr, by + 20 * dpr);
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
