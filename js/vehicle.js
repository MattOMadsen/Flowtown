export class Vehicle {
  constructor(x, y, targetDistrict, roads) {
    this.x = x;
    this.y = y;
    this.target = targetDistrict;
    this.roads = roads;

    this.speed = 65 + Math.random() * 40;
    this.baseSpeed = this.speed;
    this.angle = 0;
    this.progress = 0;
    this.currentRoad = null;
    this.arrived = false;
    this.life = 0;
    this.color = this.randomColor();
    this.size = 6.5 + Math.random() * 3.5;

    this.pickBestRoad();
  }

  randomColor() {
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  pickBestRoad() {
    if (this.roads.length === 0) {
      this.currentRoad = null;
      return;
    }

    let bestRoad = null;
    let bestT = 0;
    let bestDist = Infinity;

    for (const road of this.roads) {
      const closest = road.closestPoint(this.x, this.y);
      if (closest.dist < bestDist) {
        bestDist = closest.dist;
        bestRoad = road;
        bestT = closest.t;
      }
    }

    if (bestRoad && bestDist < 180) {
      this.currentRoad = bestRoad;
      this.progress = Math.min(0.98, Math.max(0.01, bestT));
      const p = bestRoad.getPointAt(this.progress);
      this.x = p.x;
      this.y = p.y;
      this.angle = bestRoad.getAngleAt(this.progress);
    } else {
      this.currentRoad = null;
    }
  }

  findNextRoad(roads, fromX, fromY) {
    let best = null;
    let bestScore = -Infinity;
    const maxDist = 110;

    for (const r of roads) {
      if (r === this.currentRoad) continue;

      const candidates = [
        { t: 0.0, p: r.points[0] },
        { t: 1.0, p: r.points[r.points.length - 1] }
      ];
      candidates.push({ t: 0.25, p: r.getPointAt(0.25) });
      candidates.push({ t: 0.5, p: r.getPointAt(0.5) });
      candidates.push({ t: 0.75, p: r.getPointAt(0.75) });

      for (const c of candidates) {
        const dx = c.p.x - fromX;
        const dy = c.p.y - fromY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) continue;

        let t = c.t;
        if (t > 0.85) t = 0.02;

        const mid = r.getPointAt(Math.min(0.6, t + 0.3));
        const toTarget = Math.atan2(this.target.y - mid.y, this.target.x - mid.x);
        const roadAngle = r.getAngleAt(t + 0.05);
        let angleDiff = Math.abs(toTarget - roadAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const directionScore = 1 - (angleDiff / Math.PI);

        const startBonus = (1 - t) * 30;
        const score = directionScore * 140 - dist * 1.4 + startBonus;

        if (score > bestScore) {
          bestScore = score;
          best = { road: r, t: Math.max(0.01, t), dist };
        }
      }
    }

    return best;
  }

  update(dt, roads, allVehicles) {
    this.life += dt;
    this.roads = roads;

    if (!this.currentRoad || this.currentRoad.points.length < 2) {
      this.pickBestRoad();
      if (!this.currentRoad) return;
    }

    let nearby = 0;
    for (const other of allVehicles) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (dx * dx + dy * dy < 44 * 44) nearby++;
    }
    this.speed = this.baseSpeed * Math.max(0.16, 1 - nearby * 0.13);

    const roadLen = this.currentRoad.length;
    if (roadLen < 1) {
      this.arrived = true;
      return;
    }

    this.progress += (this.speed * dt) / roadLen;

    if (this.progress >= 1) {
      const end = this.currentRoad.points[this.currentRoad.points.length - 1];
      this.x = end.x;
      this.y = end.y;

      const tdx = this.target.x - this.x;
      const tdy = this.target.y - this.y;
      if (tdx * tdx + tdy * tdy < (this.target.r + 40) ** 2) {
        this.arrived = true;
        return;
      }

      const next = this.findNextRoad(roads, end.x, end.y);

      if (next) {
        this.currentRoad = next.road;
        this.progress = next.t;
        const p = this.currentRoad.getPointAt(this.progress);
        this.x = p.x;
        this.y = p.y;
        this.angle = this.currentRoad.getAngleAt(this.progress);
      } else {
        this.pickBestRoad();
        if (!this.currentRoad && (tdx * tdx + tdy * tdy < 250 * 250)) {
          this.arrived = true;
        }
      }
    } else {
      const p = this.currentRoad.getPointAt(this.progress);
      this.x = p.x;
      this.y = p.y;
      this.angle = this.currentRoad.getAngleAt(this.progress);
    }
  }

  draw(ctx, dpr) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const s = this.size * dpr;

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5 * dpr, 2.5 * dpr, s * 1.35, s * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.color;
    ctx.beginPath();
    const w = s * 2.4;
    const h = s * 1.2;
    const r = 2.8 * dpr;
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillRect(-s * 0.15, -s * 0.42, s * 0.9, s * 0.84);

    ctx.restore();
  }
}
