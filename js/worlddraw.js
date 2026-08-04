/**
 * Cozy world rendering – terrain, water, fields (map look, not just grey discs).
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
 * Full world backdrop: meadows, forest patches, water near harbors, farm fields.
 */
export function drawWorldTerrain(ctx, worldW, worldH, dpr, districts = [], seed = 42) {
  const w = worldW;
  const h = worldH;
  const rng = mulberry32((seed | 0) + 991);

  // Base land – soft vertical meadow
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#dfe9d4');
  base.addColorStop(0.35, '#e8e4d4');
  base.addColorStop(0.7, '#ddd6c6');
  base.addColorStop(1, '#d4ccba');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Large soft biomes
  const biomes = 14;
  for (let i = 0; i < biomes; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.12 + rng() * 0.18) * Math.min(w, h);
    const kind = rng();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (kind < 0.45) {
      g.addColorStop(0, 'rgba(120, 170, 100, 0.22)');
      g.addColorStop(1, 'rgba(120, 170, 100, 0)');
    } else if (kind < 0.75) {
      g.addColorStop(0, 'rgba(160, 145, 100, 0.14)');
      g.addColorStop(1, 'rgba(160, 145, 100, 0)');
    } else {
      g.addColorStop(0, 'rgba(90, 130, 85, 0.18)');
      g.addColorStop(1, 'rgba(90, 130, 85, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forest clumps (darker green circles clusters)
  for (let i = 0; i < 9; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const n = 4 + Math.floor(rng() * 5);
    for (let j = 0; j < n; j++) {
      const ox = (rng() - 0.5) * 80 * dpr;
      const oy = (rng() - 0.5) * 80 * dpr;
      const r = (18 + rng() * 28) * dpr;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${50 + rng() * 40 | 0}, ${90 + rng() * 50 | 0}, ${55 + rng() * 30 | 0}, 0.2)`;
      ctx.fill();
    }
  }

  // Water near harbors + optional coastal band
  for (const d of districts) {
    if (d.type !== 'harbor') continue;
    drawHarborWater(ctx, d, dpr, w, h);
  }

  // Farm fields near farms
  for (const d of districts) {
    if (d.type !== 'farm') continue;
    drawFarmFields(ctx, d, dpr, rng);
  }

  // Factory smog-soft patches (subtle)
  for (const d of districts) {
    if (d.type !== 'factory') continue;
    const g = ctx.createRadialGradient(d.x, d.y - d.r * 1.2, 0, d.x, d.y, d.r * 3.5);
    g.addColorStop(0, 'rgba(120, 100, 80, 0.08)');
    g.addColorStop(1, 'rgba(120, 100, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft map grid (lighter than before)
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.028)';
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

  // Soft vignette edges of world
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40, 35, 28, 0.07)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawHarborWater(ctx, d, dpr, worldW, worldH) {
  // Large water body toward map edge near harbor
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

  // Shore foam
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2.5 * dpr;
  ctx.beginPath();
  ctx.ellipse(wx, wy, rw * 0.72, rh * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Soft waves
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5 * dpr;
  for (let i = 0; i < 3; i++) {
    const yy = wy - rh * 0.25 + i * rh * 0.22;
    ctx.beginPath();
    ctx.moveTo(wx - rw * 0.5, yy);
    ctx.quadraticCurveTo(wx, yy + 6 * dpr, wx + rw * 0.5, yy);
    ctx.stroke();
  }
}

function drawFarmFields(ctx, d, dpr, rng) {
  const rows = 5;
  const w = d.r * 2.8;
  const h = d.r * 2.2;
  ctx.save();
  ctx.translate(d.x + d.r * 0.9, d.y + d.r * 0.3);
  ctx.rotate(-0.15 + (rng() - 0.5) * 0.2);
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(163, 201, 90, 0.28)' : 'rgba(201, 176, 90, 0.22)';
    ctx.fillRect(-w / 2, -h / 2 + t * h, w, h / rows - 1 * dpr);
  }
  // fence line
  ctx.strokeStyle = 'rgba(120, 90, 50, 0.2)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * Richer place hub drawing (base plate + silhouette + label card).
 */
export function drawPlaceHub(ctx, d, dpr, helpers) {
  const { lightenHex, darkenHex, drawSilhouette } = helpers;
  const type = d.type || 'town';

  // Soft ambient glow
  const glow = ctx.createRadialGradient(d.x, d.y, d.r * 0.15, d.x, d.y, d.r * 2.4);
  glow.addColorStop(0, (d.color || '#888') + '66');
  glow.addColorStop(0.55, (d.color || '#888') + '18');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 2.4, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Ground shadow ellipse
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.55, d.r * 1.05, d.r * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28, 25, 23, 0.16)';
  ctx.fill();

  // Base plate (slightly irregular disc)
  const disc = ctx.createRadialGradient(
    d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.1,
    d.x, d.y, d.r * 1.05
  );
  disc.addColorStop(0, lightenHex(d.color, 0.28));
  disc.addColorStop(0.55, d.color);
  disc.addColorStop(1, darkenHex(d.color, 0.78));
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2.8 * dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r * 0.9, 0, Math.PI * 2);
  ctx.strokeStyle = darkenHex(d.color, 0.65);
  ctx.lineWidth = 1.8 * dpr;
  ctx.stroke();

  // Hub port ring (connection point)
  ctx.beginPath();
  ctx.arc(d.x, d.y + d.r * 0.15, d.r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.25)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.stroke();

  drawSilhouette(ctx, d, type);

  // Label card under hub
  const icon = d.icon || '🏠';
  const typeLabel = d.typeLabel || '';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  const label = d.name;
  const tw = ctx.measureText(label).width;
  ctx.font = `${Math.max(8, 9 * dpr)}px system-ui, sans-serif`;
  const tw2 = ctx.measureText(`${icon} ${typeLabel}`).width;
  const padX = 8 * dpr;
  const bw = Math.max(tw, tw2) + padX * 2;
  const bh = 30 * dpr;
  const bx = d.x - bw / 2;
  const by = d.y + d.r * 0.78;

  // Card shadow
  ctx.fillStyle = 'rgba(28,25,23,0.12)';
  roundRect(ctx, bx + 1.5 * dpr, by + 2 * dpr, bw, bh, 8 * dpr);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, bx, by, bw, bh, 8 * dpr);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,25,23,0.1)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.font = `bold ${Math.max(10, 11.5 * dpr)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, d.x, by + 11 * dpr);
  ctx.font = `${Math.max(8, 9 * dpr)}px system-ui, sans-serif`;
  ctx.fillStyle = '#57534e';
  ctx.fillText(`${icon} ${typeLabel}`, d.x, by + 21.5 * dpr);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
