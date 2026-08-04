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
    paidCost = 0,
    /** 0 = tovejs, 1 = kun t:0→1, -1 = kun t:1→0 */
    oneWay = 0,
    /** Trafiklys på segmentet */
    hasLight = false,
    /** 0–1 position langs vejen (default midt) */
    lightT = 0.5,
    /** Gruppe-id for synkede kryds (samme tal = parret lys) */
    lightGroup = null,
    /** 0 = “A-fase”, 1 = modfase i firevejs-kryds */
    lightRole = 0
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
    this.oneWay = oneWay === -1 || oneWay === 1 ? oneWay : 0;
    this.hasLight = !!hasLight;
    this.lightT = Math.max(0.05, Math.min(0.95, lightT != null ? lightT : 0.5));
    this.lightGroup = lightGroup != null ? lightGroup : null;
    this.lightRole = lightRole === 1 ? 1 : 0;
    /** 0 green, 1 yellow, 2 red – set by game tick */
    this.lightPhase = 0;
    this._length = null;
  }

  /** Allowed travel: reverse=false means increasing t */
  allowsDirection(reverse) {
    if (!this.oneWay) return true;
    if (this.oneWay === 1) return !reverse;
    if (this.oneWay === -1) return !!reverse;
    return true;
  }

  isLightRed() {
    return this.hasLight && this.lightPhase === 2;
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

    // dual = tovejs markering; oneWay får enkelt pil-retning
    const dual = !this.oneWay;
    const motor = this.lanes >= 3;
    const bridge = this.isBridge;
    // Cozy palette: warm asphalt, soft edges
    let edge = bridge ? '#1e3a5f' : motor ? '#1c1917' : '#2a2623';
    let asphalt = bridge ? '#6b7c93' : motor ? '#3f3f46' : '#5c5a62';
    let asphaltHi = bridge ? '#a8b8cc' : motor ? '#a1a1aa' : '#7a7882';
    let shoulder = 'rgba(156, 142, 110, 0.42)';
    let lane = bridge ? '#e0f2fe' : motor ? '#fafafa' : '#eceae6';
    let alpha = this.owner === 'player' ? 1 : 0.88;

    const dens = this.effectiveDensity;
    if (!bridge && dens >= 6) {
      asphalt = '#9f1239';
      asphaltHi = '#e11d48';
      edge = '#4c0519';
      lane = '#fecdd3';
      shoulder = 'rgba(127, 29, 29, 0.35)';
    } else if (!bridge && dens >= 3) {
      asphalt = '#9a3412';
      asphaltHi = '#ea580c';
      edge = '#431407';
      lane = '#ffedd5';
      shoulder = 'rgba(154, 52, 18, 0.28)';
    } else if (this.owner !== 'player' && this.ownerColor) {
      asphalt = this.mixHex(this.ownerColor, '#5c5a62', 0.38);
      asphaltHi = this.mixHex(this.ownerColor, '#a8a29e', 0.48);
      edge = this.mixHex(this.ownerColor, '#1c1917', 0.22);
      lane = '#fef3c7';
    }

    const wEdge = (motor ? 34 : bridge ? 26 : 28) * dpr;
    const wBody = (motor ? 25 : bridge ? 17 : 21) * dpr;
    const wInner = (motor ? 16 : 13) * dpr;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;

    // Drop shadow (offset “floor”)
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = bridge ? 'rgba(14, 116, 144, 0.18)' : 'rgba(20, 16, 12, 0.28)';
    ctx.lineWidth = wEdge + 8 * dpr;
    ctx.stroke();

    // Soft gravel / grass shoulder
    if (!bridge) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = shoulder;
      ctx.lineWidth = wEdge + 10 * dpr;
      ctx.stroke();
      // outer curb ring
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(68, 64, 60, 0.22)';
      ctx.lineWidth = wEdge + 2 * dpr;
      ctx.stroke();
    }

    // Bridge pillars + deck accents
    if (bridge) {
      const len = this.length;
      const count = Math.max(2, Math.floor(len / (62 * dpr)));
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        const p = this.getPointAt(t);
        const ang = this.getAngleAt(t);
        const hw = 6 * dpr;
        // pillar
        ctx.fillStyle = 'rgba(51, 65, 85, 0.88)';
        ctx.fillRect(p.x - hw * 0.45, p.y + 2 * dpr, hw * 0.9, 17 * dpr);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.fillRect(p.x - hw * 0.35, p.y + 2 * dpr, hw * 0.7, 3.5 * dpr);
        // water reflection under pillar
        ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
        ctx.fillRect(p.x - hw * 0.5, p.y + 16 * dpr, hw, 8 * dpr);
        // railing posts left/right of deck
        const nx = Math.cos(ang + Math.PI / 2);
        const ny = Math.sin(ang + Math.PI / 2);
        const off = wBody * 0.42;
        for (const s of [-1, 1]) {
          const rx = p.x + nx * off * s;
          const ry = p.y + ny * off * s;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
          ctx.beginPath();
          ctx.arc(rx, ry, 2.2 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Edge curb
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = edge;
    ctx.lineWidth = wEdge;
    ctx.stroke();

    // Asphalt body
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphalt;
    ctx.lineWidth = wBody;
    ctx.stroke();

    // Asphalt texture (Kenney-derived)
    if (!bridge && dens < 4) {
      const pat = asphaltPattern(ctx, dpr);
      if (pat) {
        ctx.beginPath();
        this.path(ctx);
        ctx.strokeStyle = pat;
        ctx.lineWidth = wBody * 0.9;
        ctx.globalAlpha = alpha * (dens >= 3 ? 0.22 : 0.48);
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
    }

    // Specular highlight strip
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphaltHi;
    ctx.lineWidth = wInner;
    ctx.globalAlpha = alpha * 0.38;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Edge highlight (left-ish rim)
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = wBody * 0.35;
    ctx.globalAlpha = alpha * 0.55;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Bridge rail lines
    if (bridge) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([5 * dpr, 6 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Center marking
    if (dual) {
      // double line for motorway
      if (motor) {
        ctx.beginPath();
        this.path(ctx);
        ctx.strokeStyle = 'rgba(250, 250, 249, 0.55)';
        ctx.lineWidth = 5.5 * dpr;
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = lane;
      ctx.lineWidth = motor ? 2.2 * dpr : 3 * dpr;
      ctx.setLineDash(motor ? [4 * dpr, 10 * dpr] : [11 * dpr, 9 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
    } else {
      // Envejs: colored dashed center
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = this.oneWay === -1 ? 'rgba(251, 146, 60, 0.9)' : 'rgba(96, 165, 250, 0.92)';
      ctx.lineWidth = 2.6 * dpr;
      ctx.setLineDash([14 * dpr, 8 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'round';

    // Chevrons / direction arrows
    const len = this.length;
    const arrowCount = Math.max(1, Math.floor(len / (100 * dpr)));
    for (let i = 1; i <= arrowCount; i++) {
      const t = i / (arrowCount + 1);
      const p = this.getPointAt(t);
      const angle = this.getAngleAt(t);

      const drawArrow = (rot, fill) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        // soft shadow under arrow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.moveTo(7 * dpr, 1 * dpr);
        ctx.lineTo(-4.2 * dpr, -3.2 * dpr);
        ctx.lineTo(-4.2 * dpr, 4.2 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(6.8 * dpr, 0);
        ctx.lineTo(-4.5 * dpr, -3.9 * dpr);
        ctx.lineTo(-4.5 * dpr, 3.9 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const fill = dens >= 3 && !bridge
        ? 'rgba(254, 226, 226, 0.95)'
        : bridge
          ? 'rgba(224, 242, 254, 0.95)'
          : this.oneWay
            ? 'rgba(147, 197, 253, 0.95)'
            : 'rgba(254, 243, 199, 0.95)';
      if (dual) {
        const ang = angle + Math.PI / 2;
        const off = 4.8 * dpr;
        ctx.save();
        ctx.translate(Math.cos(ang) * off, Math.sin(ang) * off);
        drawArrow(angle, fill);
        ctx.restore();
        ctx.save();
        ctx.translate(-Math.cos(ang) * off, -Math.sin(ang) * off);
        drawArrow(angle + Math.PI, fill);
        ctx.restore();
      } else {
        drawArrow(this.oneWay === -1 ? angle + Math.PI : angle, fill);
      }
    }

    // Trafiklys (ved kryds eller midt)
    if (this.hasLight) {
      const lp = this.getPointAt(this.lightT != null ? this.lightT : 0.5);
      const phase = this.lightPhase | 0;
      const colors = ['#22c55e', '#eab308', '#ef4444'];
      const col = colors[Math.max(0, Math.min(2, phase))] || colors[0];
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, 7 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(28,25,23,0.75)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
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
