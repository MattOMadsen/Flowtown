export class Road {
  constructor(points, { owner = 'player', ownerColor = null } = {}) {
    this.points = points;
    this.id = Math.random().toString(36).slice(2);
    this.density = 0;
    this.owner = owner;
    this.ownerColor = ownerColor;
    this._length = null;
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

  /** Closest point on polyline (segment-accurate, not only samples) */
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

    // Density → asphalt tone
    let edge = '#1c1917';
    let asphalt = '#57534e';
    let asphaltHi = '#78716c';
    let lane = '#fbbf24';
    let alpha = this.owner === 'player' ? 1 : 0.9;

    if (this.density >= 6) {
      asphalt = '#991b1b';
      asphaltHi = '#b91c1c';
      edge = '#450a0a';
      lane = '#fecaca';
    } else if (this.density >= 3) {
      asphalt = '#9a3412';
      asphaltHi = '#c2410c';
      edge = '#431407';
      lane = '#fed7aa';
    } else if (this.owner !== 'player' && this.ownerColor) {
      asphalt = this.mixHex(this.ownerColor, '#57534e', 0.35);
      asphaltHi = this.mixHex(this.ownerColor, '#a8a29e', 0.45);
      edge = this.mixHex(this.ownerColor, '#1c1917', 0.2);
      lane = '#fef3c7';
    }

    const wEdge = 20 * dpr;
    const wBody = 15 * dpr;
    const wInner = 11 * dpr;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;

    // Soft ground shadow
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = 'rgba(28, 25, 23, 0.18)';
    ctx.lineWidth = wEdge + 4 * dpr;
    ctx.stroke();

    // Dark curb / edge
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = edge;
    ctx.lineWidth = wEdge;
    ctx.stroke();

    // Main asphalt
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphalt;
    ctx.lineWidth = wBody;
    ctx.stroke();

    // Slight highlight stripe down the middle of asphalt
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = asphaltHi;
    ctx.lineWidth = wInner;
    ctx.globalAlpha = alpha * 0.35;
    ctx.stroke();
    ctx.globalAlpha = alpha;

    // Center dashed lane
    ctx.beginPath();
    this.path(ctx);
    ctx.strokeStyle = lane;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([8 * dpr, 10 * dpr]);
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    // Direction chevrons
    const len = this.length;
    const arrowCount = Math.max(1, Math.floor(len / (110 * dpr)));
    for (let i = 1; i <= arrowCount; i++) {
      const t = i / (arrowCount + 1);
      const p = this.getPointAt(t);
      const angle = this.getAngleAt(t);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillStyle = this.density >= 3 ? 'rgba(254, 226, 226, 0.9)' : 'rgba(254, 243, 199, 0.95)';
      ctx.beginPath();
      ctx.moveTo(6.5 * dpr, 0);
      ctx.lineTo(-4.5 * dpr, -3.8 * dpr);
      ctx.lineTo(-4.5 * dpr, 3.8 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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
