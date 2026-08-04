/**
 * World: richer tile board + place hubs (ART lift 2026-08).
 * Cozy stylized city-builder look.
 */

import { drawWaterBodies } from './water.js';
import { getPlaceSprite, getImageContentBounds, getTileImages } from './assets.js';
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

  // Soft drop shadow under board
  ctx.fillStyle = 'rgba(15, 12, 10, 0.32)';
  ctx.beginPath();
  roundRectPath(ctx, -3 * dpr, 6 * dpr, w + 14 * dpr, h + 12 * dpr, 20 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(20, 18, 16, 0.12)';
  ctx.beginPath();
  roundRectPath(ctx, 2 * dpr, 3 * dpr, w + 6 * dpr, h + 6 * dpr, 16 * dpr);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.clip();

  // Sky-to-meadow wash (warmer, more depth)
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#cfe8b8');
  base.addColorStop(0.35, '#dcecc4');
  base.addColorStop(0.7, '#e4e0c0');
  base.addColorStop(1, '#d4c8a8');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  if (tileMap) {
    drawTileMap(ctx, tileMap, getTileImages());
  }

  // Studio light from top-left
  const light = ctx.createRadialGradient(
    w * 0.18, h * 0.12, 0,
    w * 0.32, h * 0.38, Math.max(w, h) * 0.78
  );
  light.addColorStop(0, 'rgba(255,255,255,0.16)');
  light.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  light.addColorStop(1, 'rgba(40, 32, 24, 0.1)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  if (waterBodies?.length) {
    drawWaterBodies(ctx, waterBodies, dpr);
  }

  for (const d of districts) {
    if (d.type === 'farm') drawFarmFields(ctx, d, dpr);
  }

  // Ambient foliage dots (cheap “life” without extra sprites)
  drawAmbientDecor(ctx, w, h, dpr, districts, seed);

  if (opts.showHex && opts.hexSize) {
    drawHexGuide(ctx, w, h, opts.hexSize, dpr);
  }

  // Soft vignette
  const vig = ctx.createRadialGradient(
    w * 0.5, h * 0.48, Math.min(w, h) * 0.22,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.7, 'rgba(30, 25, 18, 0.04)');
  vig.addColorStop(1, 'rgba(25, 20, 14, 0.16)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();

  // Beveled frame
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 2.5 * dpr, 2.5 * dpr, w - 5 * dpr, h - 5 * dpr, 13 * dpr);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40, 32, 26, 0.5)';
  ctx.lineWidth = 3.2 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, 14 * dpr);
  ctx.stroke();
  // Inner warm rim
  ctx.strokeStyle = 'rgba(180, 150, 100, 0.18)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.beginPath();
  roundRectPath(ctx, 5 * dpr, 5 * dpr, w - 10 * dpr, h - 10 * dpr, 11 * dpr);
  ctx.stroke();
}

function drawAmbientDecor(ctx, w, h, dpr, districts, seed) {
  let s = (seed | 0) + 991;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  for (let i = 0; i < 48; i++) {
    const x = rng() * w;
    const y = rng() * h;
    // skip near districts
    let near = false;
    for (const d of districts) {
      if (Math.hypot(d.x - x, d.y - y) < d.r * 2.2) { near = true; break; }
    }
    if (near) continue;
    const r = (1.2 + rng() * 2.4) * dpr;
    ctx.globalAlpha = 0.12 + rng() * 0.14;
    ctx.fillStyle = rng() > 0.55 ? '#5a8f3c' : '#6b9e48';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHexGuide(ctx, w, h, size, dpr) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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
  const fw = d.r * 2.6;
  const fh = d.r * 2.0;
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.translate(d.x + d.r * 0.85, d.y + d.r * 0.45);
  ctx.rotate(-0.1);
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8fbf4a' : '#c9a84a';
    ctx.fillRect(-fw / 2, -fh / 2 + (i / rows) * fh, fw, fh / rows - dpr);
  }
  ctx.restore();
}

/**
 * Place hub planted on ground (not floating).
 * Sprite bottom sits on groundY ≈ d.y; shadow tight under base.
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';
  const sprite = getPlaceSprite(type, d.spriteKey || null);
  // Størrelse vokser med hub, men bunden forbliver på jorden (ingen “lift”)
  const size = d.r * 2.2;
  const connected = d._connected;
  // Jordkontakt = hub-centrum (veje snapper hertil)
  const groundY = d.y + 2 * dpr;
  const gc = d.color || '#a8a29e';

  // Soft life ring under place (på jorden)
  ctx.beginPath();
  ctx.ellipse(d.x, groundY, size * 0.4, size * 0.14, 0, 0, Math.PI * 2);
  const glow = ctx.createRadialGradient(d.x, groundY, 0, d.x, groundY, size * 0.4);
  glow.addColorStop(0, hexAlpha(gc, 0.2));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fill();

  // Kontakt-skygge (tæt under bygning – “står på jorden”)
  ctx.beginPath();
  ctx.ellipse(d.x + 2 * dpr, groundY + 3 * dpr, size * 0.42, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 12, 10, 0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(d.x, groundY + 1 * dpr, size * 0.32, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 16, 12, 0.16)';
  ctx.fill();

  // Lille græs-/jordplade under base
  ctx.beginPath();
  ctx.ellipse(d.x, groundY, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  const plate = ctx.createRadialGradient(d.x, groundY - 2 * dpr, 0, d.x, groundY, size * 0.3);
  plate.addColorStop(0, 'rgba(90, 100, 70, 0.35)');
  plate.addColorStop(0.65, 'rgba(70, 65, 58, 0.18)');
  plate.addColorStop(1, 'rgba(70, 65, 58, 0)');
  ctx.fillStyle = plate;
  ctx.fill();

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const b = getImageContentBounds(sprite);
    if (b && b.w > 4 && b.h > 4) {
      // Tegn kun indhold; bund af content = groundY (plantet)
      const aspect = b.w / b.h;
      const drawH = size * 0.98;
      const drawW = drawH * aspect;
      const dx = d.x - drawW / 2;
      const dy = groundY - drawH;
      ctx.drawImage(
        sprite,
        b.left, b.top, b.w, b.h,
        dx, dy, drawW, drawH
      );
    } else {
      // Fallback uden crop: bund af billede på jorden
      ctx.drawImage(sprite, d.x - size / 2, groundY - size, size, size);
    }
  } else {
    ctx.beginPath();
    ctx.arc(d.x, groundY - size * 0.22, size * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = lightenHex(d.color || '#a8a29e', 0.08);
    ctx.fill();
    drawSilhouette(ctx, d, type);
  }

  // Hub pin (guld) – på jorden, under bygning
  ctx.beginPath();
  ctx.arc(d.x, groundY, 4.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.45)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d.x - 1 * dpr, groundY - 1.2 * dpr, 1.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // Connected ring
  if (connected) {
    ctx.beginPath();
    ctx.arc(d.x, groundY, 7.5 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }

  // Label card under jorden/base
  const icon = d.icon || '';
  const typeLabel = d.typeLabel || '';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`.trim()).width;
  const padX = 9 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2 + 4 * dpr;
  const bh = 30 * dpr;
  const bx = d.x - bw / 2;
  const by = groundY + 10 * dpr;

  ctx.fillStyle = 'rgba(15,12,10,0.2)';
  roundRect(ctx, bx + 2 * dpr, by + 3 * dpr, bw, bh, 9 * dpr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, bx, by, bw, bh, 9 * dpr);
  ctx.fill();
  // accent bar
  ctx.fillStyle = d.color || '#a8a29e';
  roundRect(ctx, bx, by, 3.8 * dpr, bh, 2 * dpr);
  ctx.fill();
  // top rim
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1 * dpr;
  roundRect(ctx, bx + 0.5 * dpr, by + 0.5 * dpr, bw - dpr, bh * 0.45, 8 * dpr);
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x + 1.5 * dpr, by + 11 * dpr);
  ctx.font = `${Math.max(8, 8.5 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(`${icon} ${typeLabel}`.trim(), d.x + 1.5 * dpr, by + 21.5 * dpr);
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
