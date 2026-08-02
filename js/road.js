export class Road {
  constructor(points) {
    this.points = points; // array of {x, y}
    this.id = Math.random().toString(36).slice(2);
  }

  // Approximate length
  get length() {
    let len = 0;
    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x;
      const dy = this.points[i].y - this.points[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  // Get point at normalized t [0..1]
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
        const localT = (target - traveled) / segLen;
        return {
          x: p0.x + dx * localT,
          y: p0.y + dy * localT
        };
      }
      traveled += segLen;
    }
    return this.points[this.points.length - 1];
  }

  // Direction (angle) at t
  getAngleAt(t) {
    const p1 = this.getPointAt(Math.max(0, t - 0.01));
    const p2 = this.getPointAt(Math.min(1, t + 0.01));
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  draw(ctx, dpr) {
    if (this.points.length < 2) return;

    // Road body
    ctx.beginPath();
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 14 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();

    // Center line (dashed)
    ctx.beginPath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([8 * dpr, 10 * dpr]);
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction arrows every ~80px
    const len = this.length;
    const arrowCount = Math.max(1, Math.floor(len / (90 * dpr)));
    for (let i = 1; i <= arrowCount; i++) {
      const t = i / (arrowCount + 1);
      const p = this.getPointAt(t);
      const angle = this.getAngleAt(t);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(6 * dpr, 0);
      ctx.lineTo(-4 * dpr, -4 * dpr);
      ctx.lineTo(-4 * dpr, 4 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
