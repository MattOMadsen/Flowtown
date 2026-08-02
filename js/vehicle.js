export class Vehicle {
  constructor(x, y, targetDistrict, roads) {
    this.x = x;
    this.y = y;
    this.target = targetDistrict;
    this.roads = roads;

    this.speed = 55 + Math.random() * 35;
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
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  pickBestRoad() {
    if (this.roads.length === 0) {
      this.currentRoad = null;
      return;
    }

    // Find the closest point on any road and start from there
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

    if (bestRoad && bestDist < 160) {
      this.currentRoad = bestRoad;
      this.progress = bestT;
      const p = bestRoad.getPointAt(bestT);
      this.x = p.x;
      this.y = p.y;
      this.angle = bestRoad.getAngleAt(bestT);
    } else {
      this.currentRoad = null;
    }
  }

  update(dt, roads, allVehicles) {
    this.life += dt;
    this.roads = roads;

    if (!this.currentRoad || this.currentRoad.points.length < 2) {
      this.pickBestRoad();
      if (!this.currentRoad) return;
    }

    // Density slowdown
    let nearby = 0;
    for (const other of allVehicles) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (dx * dx + dy * dy < 40 * 40) nearby++;
    }
    const densityFactor = Math.max(0.2, 1 - nearby * 0.15);
    this.speed = this.baseSpeed * densityFactor;

    const roadLen = this.currentRoad.length;
    if (roadLen < 1) {
      this.arrived = true;
      return;
    }

    // Move forward along road
    this.progress += (this.speed * dt) / roadLen;

    if (this.progress >= 1) {
      const end = this.currentRoad.points[this.currentRoad.points.length - 1];
      this.x = end.x;
      this.y = end.y;

      // Check arrival
      const tdx = this.target.x - this.x;
      const tdy = this.target.y - this.y;
      if (tdx * tdx + tdy * tdy < (this.target.r + 30) ** 2) {
        this.arrived = true;
        return;
      }

      // Try to continue onto a nearby road (prefer one that points toward target)
      let next = null;
      let bestScore = -Infinity;

      for (const r of roads) {
        if (r === this.currentRoad) continue;
        const start = r.points[0];
        const dx = start.x - end.x;
        const dy = start.y - end.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 90) continue;

        // Prefer roads whose start is closer and whose overall direction heads toward target
        const mid = r.getPointAt(0.5);
        const toTarget = Math.atan2(this.target.y - mid.y, this.target.x - mid.x);
        const roadAngle = r.getAngleAt(0.3);
        let angleDiff = Math.abs(toTarget - roadAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const directionScore = 1 - (angleDiff / Math.PI);

        const score = directionScore * 100 - dist;
        if (score > bestScore) {
          bestScore = score;
          next = r;
        }
      }

      if (next) {
        this.currentRoad = next;
        this.progress = 0;
      } else {
        // No good continuation – try to re-snap to any nearby road
        this.pickBestRoad();
        if (!this.currentRoad) {
          // Last resort: mark arrived if somewhat close, else die later by life
          if (tdx * tdx + tdy * tdy < 200 * 200) {
            this.arrived = true;
          }
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

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(1 * dpr, 2 * dpr, s * 1.3, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (compatible path instead of roundRect)
    ctx.fillStyle = this.color;
    ctx.beginPath();
    const w = s * 2.3;
    const h = s * 1.15;
    const r = 2.5 * dpr;
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

    // Windshield
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-s * 0.2, -s * 0.4, s * 0.85, s * 0.8);

    ctx.restore();
  }
}
