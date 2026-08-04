/**
 * World: richer tile board + place hubs (ART lift 2026-08).
 * Cozy stylized city-builder look.
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

  // Studio light – dæmpet så tiles ikke vaskes ud / grønner over
  const light = ctx.createRadialGradient(
    w * 0.18, h * 0.12, 0,
    w * 0.32, h * 0.38, Math.max(w, h) * 0.78
  );
  light.addColorStop(0, 'rgba(255,255,255,0.08)');
  light.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  light.addColorStop(1, 'rgba(40, 32, 24, 0.06)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  if (waterBodies?.length) {
    drawWaterBodies(ctx, waterBodies, dpr);
  }

  for (const d of districts) {
    if (d.type === 'farm') drawFarmFields(ctx, d, dpr);
  }

  // Ambient foliage (ekstra buske uden for skov-tiles)
  drawAmbientDecor(ctx, w, h, dpr, districts, seed, tileMap);

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

function drawAmbientDecor(ctx, w, h, dpr, districts, seed, tileMap = null) {
  let s = (seed | 0) + 991;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  // Små buske i græs (ikke oven i skov-canopy / byer)
  for (let i = 0; i < 56; i++) {
    const x = rng() * w;
    const y = rng() * h;
    let near = false;
    for (const d of districts) {
      if (Math.hypot(d.x - x, d.y - y) < d.r * 2.1) { near = true; break; }
    }
    if (near) continue;
    // undgå stier (dirt-bånd)
    if (tileMap?.paths?.length) {
      let onPath = false;
      for (const pts of tileMap.paths) {
        for (let j = 1; j < pts.length; j++) {
          const ax = pts[j - 1].x;
          const ay = pts[j - 1].y;
          const bx = pts[j].x;
          const by = pts[j].y;
          const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay))
            / Math.max(1, (bx - ax) ** 2 + (by - ay) ** 2)));
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          if (Math.hypot(x - px, y - py) < (tileMap.tileSize || 40) * 0.45) {
            onPath = true;
            break;
          }
        }
        if (onPath) break;
      }
      if (onPath) continue;
    }
    const r = (1.4 + rng() * 3.2) * dpr;
    ctx.globalAlpha = 0.1 + rng() * 0.16;
    ctx.fillStyle = rng() > 0.5 ? '#4f8a38' : '#639e48';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHexGuide(ctx, w, h, size, dpr) {
  // Meget diskret – må ikke “fylde” kortet
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 0.8 * dpr;
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
  // Bløde mark-striber – ikke store grønne firkanter over kortet
  const rows = 4;
  const fw = d.r * 2.1;
  const fh = d.r * 1.55;
  ctx.save();
  ctx.translate(d.x + d.r * 0.75, d.y + d.r * 0.4);
  ctx.rotate(-0.12);
  ctx.globalAlpha = 0.16;
  // afrundet clip så det ikke ligner en boks
  ctx.beginPath();
  const rr = 10 * dpr;
  const x0 = -fw / 2;
  const y0 = -fh / 2;
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x0 + fw, y0, x0 + fw, y0 + fh, rr);
  ctx.arcTo(x0 + fw, y0 + fh, x0, y0 + fh, rr);
  ctx.arcTo(x0, y0 + fh, x0, y0, rr);
  ctx.arcTo(x0, y0, x0 + fw, y0, rr);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8fbf4a' : '#c9a84a';
    ctx.fillRect(x0, y0 + (i / rows) * fh, fw, fh / rows);
  }
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
