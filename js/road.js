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
   * 2026 map-style: flad, ren asfalt (som Apple Maps / moderne city-builders).
   */
  getDrawStyle(dpr) {
    const motor = this.lanes >= 3;
    const bridge = this.isBridge;
    const dens = this.effectiveDensity;

    // Flade, lyse asfalt-toner (ikke mørke pølser)
    let asphalt = bridge ? '#8b9bb0' : motor ? '#7a808c' : '#8a909a';
    let edge = bridge ? 'rgba(45, 60, 80, 0.45)' : 'rgba(40, 48, 58, 0.38)';
    let lane = 'rgba(255,255,255,0.88)';
    let glow = 'rgba(255,255,255,0.14)';

    if (!bridge && dens >= 6) {
      asphalt = '#c45c6a';
      edge = 'rgba(100, 30, 40, 0.4)';
      lane = 'rgba(255,240,242,0.9)';
    } else if (!bridge && dens >= 3) {
      asphalt = '#c98a5a';
      edge = 'rgba(100, 55, 30, 0.35)';
      lane = 'rgba(255,248,240,0.9)';
    } else if (this.owner !== 'player' && this.ownerColor) {
      asphalt = this.mixHex(this.ownerColor, '#8a909a', 0.55);
      edge = 'rgba(40, 48, 58, 0.4)';
    }

    // Tynde veje – mere “kort” end “tykt rør”
    const wBody = (motor ? 14 : bridge ? 12 : 11) * dpr;
    const wEdge = wBody + 2.2 * dpr;
    return {
      motor,
      bridge,
      dens,
      edge,
      asphalt,
      lane,
      glow,
      wEdge,
      wBody,
      alpha: this.owner === 'player' ? 1 : 0.92
    };
  }

  /**
   * Ren vektor-vej 2026 – ingen knopper, ingen pile-støj, elegant midterstribe.
   * Trafiklys tegnes separat (drawTrafficLight) ved siden af vejen.
   */
  draw(ctx, dpr, opts = {}) {
    if (this.points.length < 2) return;

    const dual = !this.oneWay;
    const st = this.getDrawStyle(dpr);
    const { motor, bridge, dens, edge, asphalt, lane, glow, wEdge, wBody, alpha } = st;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;

    const stroke = (width, style, a = alpha, dash = null) => {
      ctx.beginPath();
      this.path(ctx);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.globalAlpha = a;
      if (dash) ctx.setLineDash(dash);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = alpha;
    };

    // 1) Ultra-soft ground contact (næsten usynlig)
    stroke(wBody + 4 * dpr, 'rgba(20, 28, 36, 0.1)');

    // 2) Hairline edge
    stroke(wEdge, edge);

    // 3) Flat asphalt body
    stroke(wBody, asphalt);

    // 4) Subtle top sheen (smal)
    stroke(wBody * 0.35, glow, alpha * 0.55);

    // 5) Bridge: cool tint + thin rail dashes on sides via second pass color
    if (bridge) {
      stroke(wBody * 0.92, 'rgba(200, 220, 240, 0.12)');
    }

    // 6) Center marking – kun én elegant stiplet linje
    if (dual) {
      ctx.lineCap = 'butt';
      stroke(
        motor ? 1.4 * dpr : 1.5 * dpr,
        lane,
        alpha * 0.95,
        motor ? [4 * dpr, 7 * dpr] : [8 * dpr, 8 * dpr]
      );
      ctx.lineCap = 'round';
    } else {
      ctx.lineCap = 'butt';
      stroke(
        1.5 * dpr,
        this.oneWay === -1 ? 'rgba(251, 146, 60, 0.85)' : 'rgba(96, 165, 250, 0.85)',
        alpha,
        [10 * dpr, 7 * dpr]
      );
      ctx.lineCap = 'round';
    }

    // 7) Moderne trafiklys – lille signalhoved VED siden af vejen (ikke midt i asfalten)
    if (this.hasLight) {
      this.drawTrafficLight(ctx, dpr, wBody);
    }

    ctx.restore();
  }

  /**
   * Kompakt LED-signal ved vejkanten – 2026 UI, ikke stor rød klat.
   */
  drawTrafficLight(ctx, dpr, wBody) {
    const t = this.lightT != null ? this.lightT : 0.5;
    const p = this.getPointAt(t);
    const ang = this.getAngleAt(t);
    // offset vinkelret ud til siden
    const nx = Math.cos(ang + Math.PI / 2);
    const ny = Math.sin(ang + Math.PI / 2);
    const off = wBody * 0.85 + 5 * dpr;
    const x = p.x + nx * off;
    const y = p.y + ny * off;

    const phase = this.lightPhase | 0; // 0 green, 1 yellow, 2 red
    const lamps = [
      { c: '#22c55e', on: phase === 0 },
      { c: '#eab308', on: phase === 1 },
      { c: '#ef4444', on: phase === 2 }
    ];

    const bw = 7 * dpr;
    const bh = 16 * dpr;
    const rr = 3 * dpr;

    ctx.save();
    // soft shadow
    ctx.fillStyle = 'rgba(15, 20, 30, 0.2)';
    ctx.beginPath();
    roundRectPath(ctx, x - bw / 2 + dpr, y - bh / 2 + dpr, bw, bh, rr);
    ctx.fill();

    // body (mørk pill)
    const body = ctx.createLinearGradient(x, y - bh / 2, x, y + bh / 2);
    body.addColorStop(0, '#2a2f38');
    body.addColorStop(1, '#1a1e26');
    ctx.fillStyle = body;
    ctx.beginPath();
    roundRectPath(ctx, x - bw / 2, y - bh / 2, bw, bh, rr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8 * dpr;
    ctx.stroke();

    // three LEDs
    const spacing = bh / 4;
    for (let i = 0; i < 3; i++) {
      const ly = y - spacing + i * spacing;
      const lamp = lamps[i];
      ctx.beginPath();
      ctx.arc(x, ly, 1.7 * dpr, 0, Math.PI * 2);
      if (lamp.on) {
        ctx.fillStyle = lamp.c;
        ctx.fill();
        // glow
        ctx.beginPath();
        ctx.arc(x, ly, 3.2 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = lamp.c;
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
      }
    }

    // thin pole toward road
    ctx.strokeStyle = 'rgba(50, 55, 65, 0.65)';
    ctx.lineWidth = 1.1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x - nx * (bw * 0.4), y - ny * (bw * 0.4));
    ctx.lineTo(p.x + nx * (wBody * 0.35), p.y + ny * (wBody * 0.35));
    ctx.stroke();

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

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
