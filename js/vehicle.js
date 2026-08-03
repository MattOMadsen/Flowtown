/** Player / bot vehicles: passenger cars and cargo trucks */

const CAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6', '#06b6d4'];
const TRUCK_COLORS = ['#b45309', '#92400e', '#a16207', '#78350f'];

export class Vehicle {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {object} opts.targetDistrict
   * @param {object[]} opts.roads
   * @param {'car'|'truck'} [opts.kind]
   * @param {object|null} [opts.job]
   * @param {string} [opts.owner] 'player' | bot id
   * @param {string|null} [opts.ownerColor]
   * @param {number} [opts.cargo] units carried
   */
  constructor({
    x, y, targetDistrict, roads,
    kind = 'car',
    job = null,
    owner = 'player',
    ownerColor = null,
    cargo = 1
  }) {
    this.x = x;
    this.y = y;
    this.target = targetDistrict;
    this.roads = roads;
    this.kind = kind;
    this.job = job;
    this.owner = owner;
    this.ownerColor = ownerColor;
    this.cargo = cargo;
    this.origin = job ? job.from : null;

    if (kind === 'truck') {
      this.baseSpeed = 48 + Math.random() * 22;
      this.size = 8.5 + Math.random() * 2;
      this.color = ownerColor || TRUCK_COLORS[Math.floor(Math.random() * TRUCK_COLORS.length)];
    } else {
      this.baseSpeed = 70 + Math.random() * 35;
      this.size = 6 + Math.random() * 2.5;
      this.color = ownerColor || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    }
    this.speed = this.baseSpeed;

    this.angle = 0;
    this.progress = 0;
    this.currentRoad = null;
    this.arrived = false;
    this.stuck = false;
    this.life = 0;
    this.idleTime = 0;

    this.pickBestRoad();
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

    if (bestRoad && bestDist < 200) {
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
    const maxDist = 120;

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
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDist) continue;

        let t = c.t;
        if (t > 0.85) t = 0.02;

        const mid = r.getPointAt(Math.min(0.6, t + 0.3));
        const toTarget = Math.atan2(this.target.y - mid.y, this.target.x - mid.x);
        const roadAngle = r.getAngleAt(t + 0.05);
        let angleDiff = Math.abs(toTarget - roadAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const directionScore = 1 - (angleDiff / Math.PI);

        const startBonus = (1 - t) * 30;
        // Slight preference for own roads if owner set on road
        const ownerBonus = r.owner === this.owner ? 18 : 0;
        const score = directionScore * 140 - d * 1.4 + startBonus + ownerBonus;

        if (score > bestScore) {
          bestScore = score;
          best = { road: r, t: Math.max(0.01, t), dist: d };
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
      if (!this.currentRoad) {
        this.idleTime += dt;
        return;
      }
    }

    let nearby = 0;
    for (const other of allVehicles) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      if (dx * dx + dy * dy < 44 * 44) nearby++;
    }
    this.speed = this.baseSpeed * Math.max(0.14, 1 - nearby * 0.13);
    if (nearby >= 4) this.idleTime += dt;
    else this.idleTime = Math.max(0, this.idleTime - dt * 0.5);
    this.stuck = this.idleTime > 8;

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
      const arriveR = (this.target.r + 48) ** 2;
      if (tdx * tdx + tdy * tdy < arriveR) {
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
        if (!this.currentRoad && (tdx * tdx + tdy * tdy < 280 * 280)) {
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

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5 * dpr, 2.5 * dpr, s * 1.45, s * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === 'truck') {
      this.drawTruck(ctx, s, dpr);
    } else {
      this.drawCar(ctx, s, dpr);
    }

    // Owner ring for bots
    if (this.owner !== 'player' && this.ownerColor) {
      ctx.strokeStyle = this.ownerColor;
      ctx.lineWidth = 1.6 * dpr;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Cargo icon hint
    if (this.kind === 'truck') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `${Math.max(8, 9 * dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.rotate(-this.angle);
      ctx.fillText('📦', 0, -s * 1.6);
    }

    ctx.restore();
  }

  drawCar(ctx, s, dpr) {
    const w = s * 2.5;
    const h = s * 1.25;
    const r = 3 * dpr;

    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
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

    // Roof / window band
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillRect(-s * 0.2, -s * 0.38, s * 1.0, s * 0.76);

    // Headlights
    ctx.fillStyle = 'rgba(254, 243, 199, 0.9)';
    ctx.fillRect(w / 2 - 2.5 * dpr, -h * 0.28, 2.2 * dpr, h * 0.2);
    ctx.fillRect(w / 2 - 2.5 * dpr, h * 0.08, 2.2 * dpr, h * 0.2);

    // Wheels
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-w * 0.32, -h * 0.62, s * 0.45, s * 0.28);
    ctx.fillRect(-w * 0.32, h * 0.34, s * 0.45, s * 0.28);
    ctx.fillRect(w * 0.08, -h * 0.62, s * 0.45, s * 0.28);
    ctx.fillRect(w * 0.08, h * 0.34, s * 0.45, s * 0.28);
  }

  drawTruck(ctx, s, dpr) {
    const cabW = s * 1.15;
    const bodyW = s * 2.35;
    const h = s * 1.4;

    // Trailer
    ctx.fillStyle = this.color;
    ctx.fillRect(-bodyW * 0.58, -h * 0.5, bodyW, h);
    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(-bodyW * 0.58, -h * 0.5, bodyW, h);

    // Cab
    ctx.fillStyle = this.darken(this.color, 0.82);
    ctx.fillRect(bodyW * 0.32, -h * 0.42, cabW, h * 0.84);
    // Window
    ctx.fillStyle = 'rgba(186, 230, 253, 0.7)';
    ctx.fillRect(bodyW * 0.4, -h * 0.28, cabW * 0.55, h * 0.45);
    // Cargo stripes
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.3 * dpr;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.38, -h * 0.35);
    ctx.lineTo(-bodyW * 0.38, h * 0.35);
    ctx.moveTo(-bodyW * 0.08, -h * 0.35);
    ctx.lineTo(-bodyW * 0.08, h * 0.35);
    ctx.stroke();
    // Wheels
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-bodyW * 0.45, -h * 0.62, s * 0.5, s * 0.3);
    ctx.fillRect(-bodyW * 0.45, h * 0.32, s * 0.5, s * 0.3);
    ctx.fillRect(bodyW * 0.15, -h * 0.62, s * 0.5, s * 0.3);
    ctx.fillRect(bodyW * 0.15, h * 0.32, s * 0.5, s * 0.3);
  }

  darken(hex, factor) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = Math.round(parseInt(m[1], 16) * factor);
    const g = Math.round(parseInt(m[2], 16) * factor);
    const b = Math.round(parseInt(m[3], 16) * factor);
    return `rgb(${r},${g},${b})`;
  }
}
