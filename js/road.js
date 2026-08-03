export class Road {
  constructor(points, { owner = 'player', ownerColor = null } = {}) {
    this.points = points;
    this.id = Math.random().toString(36).slice(2);
    this.density = 0;
    this.owner = owner;
    this.ownerColor = ownerColor;
  }

  get length() {
    let len = 0;
    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dy = this.points[i].y - this.points[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  getPointAt(t) {
    if (this.points.length < 2) return this.points[0] || { x: 0, y: 0 };
    const total = this.length;
    if (total === 0) return this.points[0];

    let target = t * total;
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
    const p1 = this.getPointAt(Math.max(0, t - 0.015));
    const p2 = this.getPointAt(Math.min(1, t + 0.015));
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  // Find closest point on this road to a world position
  closestPoint(x, y) {
    let best = null;
    let bestDist = Infinity;
    let bestT = 0;

    const samples = Math.max(8, Math.floor(this.length / 25));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = this.getPointAt(t);
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = p;
        bestT = t;
      }
    }
    return { point: best, t: bestT, dist: Math.sqrt(bestDist) };
  }

  draw(ctx, dpr) {
    if (this.points.length < 2) return;

    // Color based on density (jam feedback), tinted by owner if bot
    let bodyColor = '#4b5563';
    let centerColor = '#fbbf24';
    if (this.density >= 6) {
      bodyColor = '#b91c1c';
      centerColor = '#fca5a5';
    } else if (this.density >= 3) {
      bodyColor = '#c2410c';
      centerColor = '#fdba74';
    } else if (this.owner !== 'player' && this.ownerColor) {
      bodyColor = this.ownerColor;
      centerColor = '#fef3c7';
    }

    // Road body
    ctx.beginPath();
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 15 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = this.owner === 'player' ? 1 : 0.88;
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Center dashed line
    ctx.beginPath();
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = 2.2 * dpr;
    ctx.setLineDash([7 * dpr, 9 * dpr]);
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction arrows
    const len = this.length;
    const arrowCount = Math.max(1, Math.floor(len / (100 * dpr)));
    for (let i = 1; i <= arrowCount; i++) {
      const t = i / (arrowCount + 1);
      const p = this.getPointAt(t);
      const angle = this.getAngleAt(t);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillStyle = this.density >= 3 ? '#fee2e2' : '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(7 * dpr, 0);
      ctx.lineTo(-5 * dpr, -4.5 * dpr);
      ctx.lineTo(-5 * dpr, 4.5 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
