import { getAsphaltImage } from './assets.js';

let _asphaltPattern = null;
let _asphaltPatternKey = null;

function asphaltPattern(ctx, dpr) {
  const img = getAsphaltImage?.();
  if (!img || !img.complete || !img.naturalWidth) return null;
  const key = `${img.naturalWidth}_${dpr}`;
  if (_asphaltPattern && _asphaltPatternKey === key) return _asphaltPattern;
  try {
    const c = document.createElement('canvas');
    const ts = Math.max(32, Math.round(48 * (dpr || 1)));
    c.width = ts;
    c.height = ts;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0, ts, ts);
    _asphaltPattern = ctx.createPattern(c, 'repeat');
    _asphaltPatternKey = key;
    return _asphaltPattern;
  } catch {
    return null;
  }
}

export class Road {
  constructor(points, {
    owner = 'player',
    ownerColor = null,
    lanes = 1,
    isBridge = false,
    paidCost = 0
  } = {}) {
    this.points = points;
    this.id = Math.random().toString(36).slice(2);
    this.density = 0;
    this.owner = owner;
    this.ownerColor = ownerColor;
    this.lanes = Math.max(1, Math.min(3, lanes | 0 || 2));
    this.isBridge = !!isBridge;
    /** Full $ paid for this segment (for fair refunds) */
    this.paidCost = Math.max(0, paidCost | 0);
    this._length = null;
  }

  /** Recalculate paidCost proportionally after length change */
  scalePaidCost(oldLen, newLen) {
    if (!oldLen || oldLen <= 0) return;
    this.paidCost = Math.max(0, Math.round(this.paidCost * (newLen / oldLen)));
    this.invalidateCache();
  }

  invalidateCache() {
    this._length = null;
  }

  get length() {
    if (this._length != null) return this._length;
    let len = 0;
    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dy = this.points[i].y - this.points[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    this._length = len;
    return len;
  }

  get effectiveDensity() {
    return (this.density || 0) / Math.max(1, this.lanes);
  }

  getPointAt(t) {
    if (this.points.length < 2) return this.points[0] || { x: 0, y: 0 };
    const total = this.length;
    if (total === 0) return this.points[0];

    let target = Math.max(0, Math.min(1, t)) * total;
    let traveled = 0;

    for (let i = 1; i < this.points.length; i++) {
      const p0 = this.points[i - 1];
      const p1 = this.points[i];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      if (traveled + segLen >= target) {
        const localT = (target - traveled) / (segLen || 1);
        return {
          x: p0.x + dx * localT,
          y: p0.y + dy * localT
        };
      }
      traveled += segLen;
    }
    return this.points[this.points.length - 1];
  }

  getAngleAt(t) {
    const p1 = this.getPointAt(Math.max(0, t - 0.012));
    const p2 = this.getPointAt(Math.min(1, t + 0.012));
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  closestPoint(x, y) {
    let best = this.points[0] || { x, y };
    let bestDist = Infinity;
    let bestT = 0;
    let traveled = 0;
    const total = this.length || 1;

    for (let i = 1; i < this.points.length; i++) {
      const p0 = this.points[i - 1];
      const p1 = this.points[i];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (y - p0.y) * dy) / (segLen * segLen)));
      const px = p0.x + dx * t;
      const py = p0.y + dy * t;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = { x: px, y: py };
        bestT = (traveled + t * segLen) / total;
      }
      traveled += segLen;
    }
    return { point: best, t: bestT, dist: Math.sqrt(bestDist) };
  }

  path(ctx) {
    if (this.points.length < 2) return;
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
  }

  draw(ctx, dpr) {
    if (this.points.length < 2) return;

    // Always two-way look; lanes 3 = motorway (wider)
    const dual = true;
    const motor = this.lanes >= 3;
    const bridge = this.isBridge;
    let edge = bridge ? '#1e3a5f' : motor ? '#1c1917' : '#292524';
    let asphalt = bridge ? '#64748b' : motor ? '#3f3f46' : '#52525b';
    let asphaltHi = bridge ? '#94a3b8' : motor ? '#a1a1aa' : '#71717a';
    let lane = bridge ? '#e0f2fe' : motor ? '#fafafa' : '#e4e4e7';
    let alpha = this.owner === 'player' ? 1 : 0.9;

    const dens = this.effectiveDensity;
    if (!bridge && dens >= 6) {
      asphalt = '#991b1b';
      asphaltHi = '#b91c1c';
      edge = '#450a0a';
      lane = '#fecaca';
    } else if (!bridge && dens >= 3) {
      asphalt = '#9a3412';
      asphaltHi = '#c2410c';
      edge = '#431407';
      lane = '#fed7aa';
    } else if (this.owner !== 'player' && this.ownerColor) {
      asphalt = this.mixHex(this.ownerColor, '#52525b', 0.35);
      asphaltHi = this.mixHex(this.ownerColor, '#a8a29e', 0.45);
      edge = this.mixHex(this.ownerColor, '#1c1917', 0.2);
      lane = '#fef3c7';
    }

    const wEdge = (motor ? 32 : bridge ? 24 : 26) * dpr;
    const wBody = (motor ? 24 : bridge ? 16 : 20) * dpr;
    const wInner = (motor ? 17 : 14) * dpr;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;

    // VIS2: soft gravel shoulder
    if (!bridge) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(168, 152, 120, 0.35)';
      ctx.lineWidth = wEdge + 7 * dpr;
      ctx.stroke();
    }

    // Bridge pillars
    if (bridge) {
      const len = this.length;
      const count = Math.max(2, Math.floor(len / (70 * dpr)));
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const p = this.getPointAt(t);
        const ang = this.getAngleAt(t) + Math.PI / 2;
        const hw = 5 * dpr;
        ctx.fillStyle = 'rgba(51, 65, 85, 0.75)';
        ctx.fillRect(p.x - hw * 0.45, p.y, hw * 0.9, 14 * dpr);
        // water reflection stub
        ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
        ctx.fillRect(p.x - hw * 0.35, p.y + 12 * dpr, hw * 0.7, 6 * dpr);
      }
    }

    // Soft ground shadow
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = bridge ? 'rgba(14, 116, 144, 0.22)' : 'rgba(28, 25, 23, 0.2)';
    ctx.lineWidth = wEdge + 4 * dpr;
    ctx.stroke();

    // Edge
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = edge;
    ctx.lineWidth = wEdge;
    ctx.stroke();

    // Asphalt / deck (base color)
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphalt;
    ctx.lineWidth = wBody;
    ctx.stroke();

    // Asphalt texture overlay (grain) – not on heavy congestion red
    if (!bridge && dens < 3) {
      const pat = asphaltPattern(ctx, dpr);
      if (pat) {
        ctx.beginPath();
        this.path(ctx);
        ctx.strokeStyle = pat;
        ctx.lineWidth = wBody * 0.92;
        ctx.globalAlpha = alpha * 0.42;
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
    }

    // Highlight
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphaltHi;
    ctx.lineWidth = wInner;
    ctx.globalAlpha = alpha * 0.32;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Bridge rail lines
    if (bridge) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.7)';
      ctx.lineWidth = 1.4 * dpr;
      ctx.setLineDash([4 * dpr, 6 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Center marking
    if (dual) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = lane;
      ctx.lineWidth = 3.2 * dpr;
      ctx.setLineDash([10 * dpr, 8 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
    } else {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = lane;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([8 * dpr, 10 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'round';

    // Chevrons
    const len = this.length;
    const arrowCount = Math.max(1, Math.floor(len / (110 * dpr)));
    for (let i = 1; i <= arrowCount; i++) {
      const t = i / (arrowCount + 1);
      const p = this.getPointAt(t);
      const angle = this.getAngleAt(t);

      const drawArrow = (rot, fill) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(6.5 * dpr, 0);
        ctx.lineTo(-4.5 * dpr, -3.8 * dpr);
        ctx.lineTo(-4.5 * dpr, 3.8 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const fill = dens >= 3 && !bridge
        ? 'rgba(254, 226, 226, 0.9)'
        : bridge
          ? 'rgba(224, 242, 254, 0.95)'
          : 'rgba(254, 243, 199, 0.95)';
      if (dual) {
        const ang = angle + Math.PI / 2;
        const off = 4.5 * dpr;
        ctx.save();
        ctx.translate(Math.cos(ang) * off, Math.sin(ang) * off);
        drawArrow(angle, fill);
        ctx.restore();
        ctx.save();
        ctx.translate(-Math.cos(ang) * off, -Math.sin(ang) * off);
        drawArrow(angle + Math.PI, fill);
        ctx.restore();
      } else {
        drawArrow(angle, fill);
      }
    }

    ctx.restore();
  }

  mixHex(a, b, t) {
    const pa = this.parseHex(a);
    const pb = this.parseHex(b);
    if (!pa || !pb) return a;
    const m = (x, y) => Math.round(x + (y - x) * t);
    return `rgb(${m(pa.r, pb.r)},${m(pa.g, pb.g)},${m(pa.b, pb.b)})`;
  }

  parseHex(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
}
