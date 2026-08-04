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

  /**
   * Farver/bredder til tegning (bruges også til kryds-pads).
   */
  getDrawStyle(dpr) {
    const motor = this.lanes >= 3;
    const bridge = this.isBridge;
    // Moderne, rene farver – mindre “tyk sort kant”
    let edge = bridge ? '#334155' : motor ? '#1e293b' : '#374151';
    let asphalt = bridge ? '#64748b' : motor ? '#4b5563' : '#6b7280';
    let asphaltHi = bridge ? '#94a3b8' : motor ? '#9ca3af' : '#9ca3af';
    let shoulder = 'rgba(120, 130, 100, 0.18)';
    let lane = 'rgba(255,255,255,0.75)';
    const dens = this.effectiveDensity;
    if (!bridge && dens >= 6) {
      asphalt = '#be123c';
      asphaltHi = '#fb7185';
      edge = '#881337';
      lane = 'rgba(255,228,230,0.85)';
      shoulder = 'rgba(127, 29, 29, 0.2)';
    } else if (!bridge && dens >= 3) {
      asphalt = '#c2410c';
      asphaltHi = '#fb923c';
      edge = '#7c2d12';
      lane = 'rgba(255,237,213,0.85)';
      shoulder = 'rgba(154, 52, 18, 0.16)';
    } else if (this.owner !== 'player' && this.ownerColor) {
      asphalt = this.mixHex(this.ownerColor, '#6b7280', 0.42);
      asphaltHi = this.mixHex(this.ownerColor, '#a1a1aa', 0.5);
      edge = this.mixHex(this.ownerColor, '#1f2937', 0.28);
    }
    // Slanke, moderne veje
    const wEdge = (motor ? 22 : bridge ? 18 : 17) * dpr;
    const wBody = (motor ? 16 : bridge ? 13 : 12.5) * dpr;
    const wInner = (motor ? 9 : 7) * dpr;
    return {
      motor, bridge, dens, edge, asphalt, asphaltHi, shoulder, lane,
      wEdge, wBody, wInner,
      alpha: this.owner === 'player' ? 1 : 0.9
    };
  }

  /**
   * Moderne vejtegning – ingen runde knopper i enderne.
   * @param {{ joinStart?: boolean, joinEnd?: boolean }} [opts]
   */
  draw(ctx, dpr, opts = {}) {
    if (this.points.length < 2) return;

    const dual = !this.oneWay;
    const st = this.getDrawStyle(dpr);
    const {
      motor, bridge, dens, edge, asphalt, asphaltHi, shoulder, lane,
      wEdge, wBody, wInner, alpha
    } = st;

    ctx.save();
    // round cap giver bløde ender uden ekstra cirkel-knopper
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;

    const strokePath = (width, style, a = alpha) => {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.globalAlpha = a;
      ctx.stroke();
      ctx.globalAlpha = alpha;
    };

    // Blød skygge (ét lag)
    strokePath(wBody + 5 * dpr, 'rgba(15, 20, 25, 0.18)');

    // Diskret shoulder
    if (!bridge) {
      strokePath(wEdge + 3 * dpr, shoulder);
    }

    // Bridge: simple deck markers (ingen klodsede søjler)
    if (bridge) {
      strokePath(wEdge + 2 * dpr, 'rgba(30, 58, 90, 0.35)');
    }

    // Edge + body
    strokePath(wEdge, edge);
    strokePath(wBody, asphalt);

    // Meget subtil texture
    if (!bridge && dens < 4) {
      const pat = asphaltPattern(ctx, dpr);
      if (pat) strokePath(wBody * 0.85, pat, alpha * 0.2);
    }

    // Soft highlight
    strokePath(wInner, asphaltHi, alpha * 0.28);

    // Center line – clean dashed
    if (dual) {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = lane;
      ctx.lineWidth = motor ? 1.6 * dpr : 1.8 * dpr;
      ctx.setLineDash(motor ? [5 * dpr, 8 * dpr] : [10 * dpr, 9 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
    } else {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = this.oneWay === -1 ? 'rgba(251, 146, 60, 0.75)' : 'rgba(96, 165, 250, 0.8)';
      ctx.lineWidth = 1.8 * dpr;
      ctx.setLineDash([12 * dpr, 8 * dpr]);
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
    }

    // Færre, mindre pile (retning)
    const len = this.length;
    const arrowCount = Math.max(0, Math.floor(len / (140 * dpr)));
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
        ctx.moveTo(5 * dpr, 0);
        ctx.lineTo(-3.2 * dpr, -2.6 * dpr);
        ctx.lineTo(-3.2 * dpr, 2.6 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const fill = dens >= 3 && !bridge
        ? 'rgba(255,255,255,0.55)'
        : 'rgba(255,255,255,0.45)';
      if (dual) {
        const ang = angle + Math.PI / 2;
        const off = 3.2 * dpr;
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
