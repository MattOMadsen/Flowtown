/**
 * World: richer tile board + optional hex guide + place hubs.
 * Visual target: cozy stylized city-builder (not full 3D).
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

  // Drop shadow under board
  ctx.fillStyle = 'rgba(20, 18, 16, 0.22)';
  ctx.beginPath();
  roundRectPath(ctx, -4 * dpr, 4 * dpr, w + 12 * dpr, h + 10 * dpr, 18 * dpr);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.clip();

  // Soft sky-to-meadow wash under tiles
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#d5e8c4');
  base.addColorStop(0.55, '#e4ecc8');
  base.addColorStop(1, '#d8cdb4');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  if (tileMap) {
    drawTileMap(ctx, tileMap, getTileImages());
  }

  // Soft light from top-left (stylized “studio” light)
  const light = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.35, h * 0.4, Math.max(w, h) * 0.75);
  light.addColorStop(0, 'rgba(255,255,255,0.14)');
  light.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  light.addColorStop(1, 'rgba(40, 35, 28, 0.06)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  if (waterBodies?.length) {
    drawWaterBodies(ctx, waterBodies, dpr);
  }

  for (const d of districts) {
    if (d.type === 'farm') drawFarmFields(ctx, d, dpr);
  }

  // Hex guide (helps building) – only while drawing/bridge
  if (opts.showHex && opts.hexSize) {
    drawHexGuide(ctx, w, h, opts.hexSize, dpr);
  }

  // Soft inner vignette for depth
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(30, 25, 20, 0.1)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();

  // Beveled board frame
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 2 * dpr, 2 * dpr, w - 4 * dpr, h - 4 * dpr, 13 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40, 35, 30, 0.45)';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.stroke();
}

function drawHexGuide(ctx, w, h, size, dpr) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1 * dpr;
  const hexH = size * 2;
  const hexW = Math.sqrt(3) * size;
  const vert = hexH * 0.75;
  for (let row = -1; row * vert < h + hexH; row++) {
    for (let col = -1; col * hexW < w + hexW; col++) {
      const cx = col * hexW + (row % 2 ? hexW * 0.5 : 0);
      const cy = row * vert;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const x = cx + size * Math.cos(a);
        const y = cy + size * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFarmFields(ctx, d, dpr) {
  const rows = 5;
  const fw = d.r * 2.5;
  const fh = d.r * 1.9;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.translate(d.x + d.r * 0.85, d.y + d.r * 0.45);
  ctx.rotate(-0.1);
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8fbf4a' : '#c9a84a';
    ctx.fillRect(-fw / 2, -fh / 2 + (i / rows) * fh, fw, fh / rows - dpr);
  }
  ctx.restore();
}

/**
 * Place hub with stronger depth (closer to stylized diorama look).
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type, d.spriteKey || null);
  const size = d.r * 2.45; // slightly larger sprites – clearer art

  // Multi-layer contact shadow
  ctx.beginPath();
  ctx.ellipse(d.x + 3 * dpr, d.y + size * 0.3, size * 0.48, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 16, 12, 0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + size * 0.26, size * 0.36, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 16, 12, 0.12)';
  ctx.fill();

  // Ground plate (subtle, not a glow bubble)
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + size * 0.18, size * 0.34, size * 0.12, 0, 0, Math.PI * 2);
  const plate = ctx.createRadialGradient(d.x, d.y + size * 0.1, 0, d.x, d.y + size * 0.18, size * 0.34);
  plate.addColorStop(0, 'rgba(90, 85, 80, 0.35)');
  plate.addColorStop(1, 'rgba(90, 85, 80, 0.05)');
  ctx.fillStyle = plate;
  ctx.fill();

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, d.x - size / 2, d.y - size * 0.64, size, size);
  } else {
    ctx.beginPath();
    ctx.arc(d.x, d.y - size * 0.05, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.08);
    ctx.fill();
    drawSilhouette(ctx, d, type);
  }

  // Hub pin
  ctx.beginPath();
  ctx.arc(d.x, d.y + size * 0.18, 4.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.4)';
  ctx.lineWidth = 1.1 * dpr;
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
  const by = d.y + size * 0.34;

  ctx.fillStyle = 'rgba(20,16,12,0.16)';
  roundRect(ctx, bx + 1.5 * dpr, by + 2.5 * dpr, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
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
