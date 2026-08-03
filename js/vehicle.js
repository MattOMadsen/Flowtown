/** Player / bot vehicles: passenger cars and cargo trucks */

const CAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6', '#06b6d4'];
const TRUCK_COLORS = ['#b45309', '#92400e', '#a16207', '#78350f'];

/** Keep progress away from exact endpoints (avoids snap/hak) */
function clampTravelT(t) {
  return Math.min(0.985, Math.max(0.015, t));
}

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
   * @param {object|null} [opts.startRoad] pre-attached road
   * @param {number|null} [opts.startT] progress on startRoad
   * @param {boolean} [opts.startReverse]
   */
  constructor({
    x, y, targetDistrict, roads,
    kind = 'car',
    job = null,
    owner = 'player',
    ownerColor = null,
    cargo = 1,
    startRoad = null,
    startT = null,
    startReverse = false
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
    this.progress = 0.5;
    this.currentRoad = null;
    this.arrived = false;
    this.stuck = false;
    this.life = 0;
    this.idleTime = 0;
    this.reverse = false;
    this._triedReverse = false;
    this._turnTimer = 0;

    // Smooth handoff when switching roads
    this._blend = 0;
    this._blendFromX = x;
    this._blendFromY = y;
    this._blendFromAngle = 0;

    if (startRoad && startRoad.points?.length >= 2) {
      this.attachToRoad(startRoad, startT ?? 0.5, !!startReverse, false);
    } else {
      this.pickBestRoad();
    }
  }

  /**
   * Snap onto a road at travel-t. Optionally start a short blend from current xy.
   */
  attachToRoad(road, t, reverse = false, blend = true) {
    if (!road || road.points.length < 2) return false;
    const prevX = this.x;
    const prevY = this.y;
    const prevAngle = this.angle;

    this.currentRoad = road;
    this.progress = clampTravelT(t);
    this.reverse = !!reverse;
    this._triedReverse = false;

    const p = road.getPointAt(this.progress);
    const ang = road.getAngleAt(this.progress);
    const face = this.reverse ? ang + Math.PI : ang;

    if (blend) {
      this._blendFromX = prevX;
      this._blendFromY = prevY;
      this._blendFromAngle = prevAngle;
      this._blend = 1;
    } else {
      this._blend = 0;
    }

    this.x = p.x;
    this.y = p.y;
    this.angle = face;
    return true;
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
      const t = clampTravelT(bestT);
      // Prefer direction that approaches target
      const reverse = this._preferReverse(bestRoad, t);
      this.attachToRoad(bestRoad, t, reverse, false);
    } else {
      this.currentRoad = null;
    }
  }

  /** True if reverse travel from t gets closer to target than forward */
  _preferReverse(road, t) {
    if (!this.target) return false;
    const tx = this.target.x;
    const ty = this.target.y;
    const lookFwd = road.getPointAt(Math.min(0.98, t + 0.12));
    const lookRev = road.getPointAt(Math.max(0.02, t - 0.12));
    const distFwd = Math.hypot(tx - lookFwd.x, ty - lookFwd.y);
    const distRev = Math.hypot(tx - lookRev.x, ty - lookRev.y);
    return distRev < distFwd;
  }

  /**
   * Pick next road segment near a junction.
   * Prefers: close join, travel direction toward target, reduced density, own roads.
   */
  findNextRoad(roads, fromX, fromY) {
    let best = null;
    let bestScore = -Infinity;
    const maxDist = 140;
    const tx = this.target?.x ?? fromX;
    const ty = this.target?.y ?? fromY;
    const distToTargetNow = Math.hypot(tx - fromX, ty - fromY);

    for (const r of roads) {
      if (r === this.currentRoad) continue;

      const candidates = [
        { t: 0.0, p: r.points[0] },
        { t: 1.0, p: r.points[r.points.length - 1] }
      ];
      const cMid = r.closestPoint(fromX, fromY);
      if (cMid.dist < maxDist) {
        candidates.push({ t: cMid.t, p: cMid.point });
      }
      for (const t of [0.25, 0.5, 0.75]) {
        candidates.push({ t, p: r.getPointAt(t) });
      }

      const seen = new Set();
      for (const c of candidates) {
        const key = `${c.t.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const dx = c.p.x - fromX;
        const dy = c.p.y - fromY;
        const d = Math.hypot(dx, dy);
        if (d > maxDist) continue;

        const tEnter = clampTravelT(c.t);
        const lookFwd = r.getPointAt(Math.min(0.98, tEnter + 0.12));
        const lookRev = r.getPointAt(Math.max(0.02, tEnter - 0.12));
        const distFwd = Math.hypot(tx - lookFwd.x, ty - lookFwd.y);
        const distRev = Math.hypot(tx - lookRev.x, ty - lookRev.y);
        const goForward = distFwd <= distRev;
        const look = goForward ? lookFwd : lookRev;
        const progressAfter = goForward
          ? Math.min(0.97, tEnter + 0.02)
          : Math.max(0.03, tEnter - 0.02);

        const distAfter = Math.hypot(tx - look.x, ty - look.y);
        const approach = distToTargetNow - distAfter;

        const toTarget = Math.atan2(ty - look.y, tx - look.x);
        const roadAngle = r.getAngleAt(tEnter);
        const travelAngle = goForward ? roadAngle : roadAngle + Math.PI;
        let angleDiff = Math.abs(toTarget - travelAngle);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
        const directionScore = 1 - (angleDiff / Math.PI);

        const densityPenalty = (r.density || 0) * 6;
        const ownerBonus = r.owner === this.owner ? 20 : 0;
        const endpointBonus = (c.t < 0.08 || c.t > 0.92) ? 25 : 0;

        const score =
          directionScore * 160 +
          approach * 0.35 -
          d * 1.5 -
          densityPenalty +
          ownerBonus +
          endpointBonus;

        if (score > bestScore) {
          bestScore = score;
          best = {
            road: r,
            t: progressAfter,
            dist: d,
            reverse: !goForward
          };
        }
      }
    }

    return best;
  }

  _lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  update(dt, roads, allVehicles) {
    this.life += dt;
    this.roads = roads;

    // Blend handoff (smooth road switch)
    if (this._blend > 0) {
      this._blend = Math.max(0, this._blend - dt / 0.1);
      const t = 1 - this._blend;
      // Ease-out
      const e = 1 - (1 - t) * (1 - t);
      if (this.currentRoad) {
        const p = this.currentRoad.getPointAt(this.progress);
        const ang = this.currentRoad.getAngleAt(this.progress);
        const face = this.reverse ? ang + Math.PI : ang;
        this.x = this._blendFromX + (p.x - this._blendFromX) * e;
        this.y = this._blendFromY + (p.y - this._blendFromY) * e;
        this.angle = this._lerpAngle(this._blendFromAngle, face, e);
      }
      // Still allow light progress during blend so we don't stall
      if (this._blend > 0.15) {
        this.idleTime = Math.max(0, this.idleTime - dt);
        return;
      }
    }

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

    if (this.reverse) {
      this.progress -= (this.speed * dt) / roadLen;
    } else {
      this.progress += (this.speed * dt) / roadLen;
    }

    // Leave-node zone near endpoints (not exact 0/1 mid-travel)
    const atEnd = !this.reverse && this.progress >= 0.985;
    const atStart = this.reverse && this.progress <= 0.015;

    if (atEnd || atStart) {
      const end = atEnd
        ? this.currentRoad.points[this.currentRoad.points.length - 1]
        : this.currentRoad.points[0];
      // Soft snap toward endpoint for junction search
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
        this.attachToRoad(next.road, next.t, !!next.reverse, true);
      } else {
        // U-turn on same road (animated via blend + reverse flip)
        if (!this._triedReverse) {
          this._triedReverse = true;
          const newReverse = !this.reverse;
          const t = clampTravelT(this.progress);
          this.attachToRoad(this.currentRoad, t, newReverse, true);
          this._turnTimer = 0.12;
        } else {
          this._triedReverse = false;
          // Last resort: re-pick nearby road toward target
          const prev = this.currentRoad;
          this.pickBestRoad();
          if (this.currentRoad === prev || !this.currentRoad) {
            // Still stuck near target? count as arrived soft
            if (tdx * tdx + tdy * tdy < 280 * 280) {
              this.arrived = true;
            }
          }
        }
      }
    } else {
      this.progress = clampTravelT(this.progress);
      const p = this.currentRoad.getPointAt(this.progress);
      this.x = p.x;
      this.y = p.y;
      const ang = this.currentRoad.getAngleAt(this.progress);
      this.angle = this.reverse ? ang + Math.PI : ang;
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
