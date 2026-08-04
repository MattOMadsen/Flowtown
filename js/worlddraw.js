/**
 * World: tile-map board + place hubs (no empty void-land, no glow bubbles).
 */

import { drawWaterBodies } from './water.js';
import { getPlaceSprite, getTileImages } from './assets.js';
import { drawTileMap } from './tilemap.js';

/**
 * @param {object|null} tileMap from buildTileMap
 */
export function drawWorldTerrain(ctx, worldW, worldH, dpr, districts = [], seed = 42, waterBodies = null, tileMap = null) {
  const w = worldW;
  const h = worldH;

  // Soft board shadow
  ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
  ctx.beginPath();
  roundRectPath(ctx, -6 * dpr, -6 * dpr, w + 12 * dpr, h + 12 * dpr, 18 * dpr);
  ctx.fill();

  // Clip to playable board
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.clip();

  // Base fill if tiles not ready
  ctx.fillStyle = '#c5d9a0';
  ctx.fillRect(0, 0, w, h);

  // Tile layer
  if (tileMap) {
    drawTileMap(ctx, tileMap, getTileImages());
  }

  // Soft water highlight on top of water tiles (from geometry bodies)
  if (waterBodies?.length) {
    ctx.globalAlpha = 0.55;
    drawWaterBodies(ctx, waterBodies, dpr);
    ctx.globalAlpha = 1;
  }

  // Very light farm stripe overlay (detail)
  for (const d of districts) {
    if (d.type !== 'farm') continue;
    drawFarmFields(ctx, d, dpr);
  }

  ctx.restore();

  // Map border
  ctx.strokeStyle = 'rgba(68, 64, 60, 0.4)';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 1 * dpr, 1 * dpr, w - 2 * dpr, h - 2 * dpr, 14 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 4 * dpr, 4 * dpr, w - 8 * dpr, h - 8 * dpr, 12 * dpr);
  ctx.stroke();
}

function drawFarmFields(ctx, d, dpr) {
  const rows = 4;
  const fw = d.r * 2.4;
  const fh = d.r * 1.8;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.translate(d.x + d.r * 0.8, d.y + d.r * 0.45);
  ctx.rotate(-0.1);
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8fbf4a' : '#c9a84a';
    ctx.fillRect(-fw / 2, -fh / 2 + (i / rows) * fh, fw, fh / rows - dpr);
  }
  ctx.restore();
}

/**
 * Place hub: sprite + shadow + label (no colored bubble).
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type);
  const size = d.r * 2.2;

  ctx.beginPath();
  ctx.ellipse(d.x + 2 * dpr, d.y + size * 0.28, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28, 25, 23, 0.22)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(d.x, d.y + size * 0.22, size * 0.2, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(55, 50, 48, 0.4)';
  ctx.fill();

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const iw = size;
    const ih = size;
    ctx.drawImage(sprite, d.x - iw / 2, d.y - ih * 0.62, iw, ih);
  } else {
    ctx.beginPath();
    ctx.arc(d.x, d.y - size * 0.05, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.08);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    drawSilhouette(ctx, d, type);
  }

  ctx.beginPath();
  ctx.arc(d.x, d.y + size * 0.18, 4.2 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.35)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

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
