export class Vehicle {
  constructor(x, y, targetDistrict, roads) {
    this.x = x;
    this.y = y;
    this.target = targetDistrict;
    this.roads = roads;

    this.speed = 40 + Math.random() * 30; // px per second (logical)
    this.baseSpeed = this.speed;
    this.angle = 0;
    this.progress = 0; // 0..1 along current road
    this.currentRoad = null;
    this.roadIndex = 0;
    this.arrived = false;
    this.life = 0;
    this.color = this.randomColor();
    this.size = 7 + Math.random() * 3;

    // Find a starting road near us
    this.pickRoad();
  }

  randomColor() {
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  pickRoad() {
    if (this.roads.length === 0) {
      this.currentRoad = null;
      return;
    }
    // Prefer roads close to current position
    let best = null;
    let bestDist = Infinity;
    for (const road of this.roads) {
      const start = road.points[0];
      const dx = start.x - this.x;
      const dy = start.y - this.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = road;
      }
    }
    this.currentRoad = best;
    this.progress = 0;
  }

  update(dt, roads, allVehicles) {
    this.life += dt;
    this.roads = roads;

    if (!this.currentRoad || this.currentRoad.points.length < 2) {
      this.pickRoad();
      if (!this.currentRoad) return;
    }

    // Simple density check – slow down if many cars nearby
    let nearby = 0;
    for (const other of allVehicles) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (dx * dx + dy * dy < 35 * 35) nearby++;
    }
    const densityFactor = Math.max(0.25, 1 - nearby * 0.18);
    this.speed = this.baseSpeed * densityFactor;

    // Move along road
    const roadLen = this.currentRoad.length;
    if (roadLen < 1) {
      this.arrived = true;
      return;
    }

    this.progress += (this.speed * dt) / roadLen;

    if (this.progress >= 1) {
      // Reached end of this road – try to find a connecting one near the end
      const end = this.currentRoad.points[this.currentRoad.points.length - 1];
      this.x = end.x;
      this.y = end.y;

      // Look for a new road starting near the end
      let next = null;
      let bestD = 80 * 80;
      for (const r of roads) {
        if (r === this.currentRoad) continue;
        const start = r.points[0];
        const dx = start.x - end.x;
        const dy = start.y - end.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          next = r;
        }
      }

      if (next) {
        this.currentRoad = next;
        this.progress = 0;
      } else {
        // No continuation – check if close to target
        const tdx = this.target.x - this.x;
        const tdy = this.target.y - this.y;
        if (tdx * tdx + tdy * tdy < 90 * 90) {
          this.arrived = true;
        } else {
          // Wander: pick any road
          this.pickRoad();
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

    // Car body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    const s = this.size * dpr;
    ctx.roundRect(-s * 1.2, -s * 0.6, s * 2.4, s * 1.2, 2 * dpr);
    ctx.fill();

    // Windshield
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-s * 0.3, -s * 0.45, s * 0.9, s * 0.9);

    ctx.restore();
  }
}
