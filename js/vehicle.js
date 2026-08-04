/** Player / bot vehicles: passenger cars and cargo trucks */

import { getClass, cargoCapacity as fleetCargoCap } from './fleet.js';
import { getVehicleSprite } from './assets.js';

const CAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6', '#06b6d4'];
const TRUCK_COLORS = ['#b45309', '#92400e', '#a16207', '#78350f'];
const FAST_COLORS = ['#e11d48', '#f43f5e', '#fb7185'];
const HEAVY_COLORS = ['#57534e', '#44403c', '#78716c'];

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
    startReverse = false,
    fleetOwned = false,
    homeName = null,
    classId = null,
    upgradeRank = 0,
    id = null
  }) {
    this.id = id || `v_${Math.random().toString(36).slice(2, 9)}`;
    this.x = x;
    this.y = y;
    this.target = targetDistrict;
    this.roads = roads;
    this.job = job;
    this.owner = owner;
    this.ownerColor = ownerColor;
    this.origin = job ? job.from : null;
    /** Player-owned persistent vehicle (not despawned after delivery) */
    this.fleetOwned = !!fleetOwned;
    this.homeName = homeName || null;
    this.parkName = this.homeName;
    this.classId = classId || (kind === 'truck' ? 'truck_std' : 'car_std');
    this.upgradeRank = Math.max(0, upgradeRank | 0);

    const cls = getClass(this.classId);
    this.kind = cls.kind || kind;

    if (this.kind === 'truck') {
      this._rawBaseSpeed = 48 + Math.random() * 22;
      this._rawSize = 8.5 + Math.random() * 2;
      const palette = this.classId === 'truck_heavy' ? HEAVY_COLORS : TRUCK_COLORS;
      this.color = ownerColor || palette[Math.floor(Math.random() * palette.length)];
    } else {
      this._rawBaseSpeed = 70 + Math.random() * 35;
      this._rawSize = 6 + Math.random() * 2.5;
      const palette = this.classId === 'car_fast' ? FAST_COLORS : CAR_COLORS;
      this.color = ownerColor || palette[Math.floor(Math.random() * palette.length)];
    }
    this.applyClassStats();
    this.cargo = cargo ?? this.getCargoCapacity();

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

  applyClassStats() {
    const cls = getClass(this.classId);
    const rankBoost = 1 + this.upgradeRank * 0.03; // mild speed from upgrades
    this.baseSpeed = (this._rawBaseSpeed || 60) * (cls.speedMul || 1) * rankBoost;
    this.size = (this._rawSize || 7) * (cls.sizeMul || 1) * (1 + this.upgradeRank * 0.04);
    this.speed = this.baseSpeed;
  }

  getCargoCapacity() {
    return fleetCargoCap(this.classId, this.upgradeRank);
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
    // Envejs: retning er låst
    if (road?.oneWay === 1) return false;
    if (road?.oneWay === -1) return true;
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
        let goForward = distFwd <= distRev;
        // Envejs begrænser retning
        if (r.oneWay === 1) goForward = true;
        else if (r.oneWay === -1) goForward = false;
        else if (r.allowsDirection && !r.allowsDirection(!goForward)) {
          goForward = !goForward;
          if (r.allowsDirection && !r.allowsDirection(!goForward)) continue;
        }
        if (r.allowsDirection && !r.allowsDirection(!goForward)) continue;

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

        const dens = r.effectiveDensity != null ? r.effectiveDensity : (r.density || 0);
        const densityPenalty = dens * 6;
        const ownerBonus = r.owner === this.owner ? 20 : 0;
        const endpointBonus = (c.t < 0.08 || c.t > 0.92) ? 25 : 0;
        // Rødt lys: undgå vejen midlertidigt
        const lightPenalty = r.isLightRed?.() ? 80 : 0;

        const score =
          directionScore * 160 +
          approach * 0.35 -
          d * 1.5 -
          densityPenalty +
          ownerBonus +
          endpointBonus -
          lightPenalty;

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

  /** Park idle at a district (fleet-owned after delivery) */
  parkIdle(district, roads) {
    this.job = null;
    this.arrived = false;
    this.stuck = false;
    this.idleTime = 0;
    this.life = 0;
    this._triedReverse = false;
    this.origin = null;
    this.cargo = this.getCargoCapacity();
    if (district) {
      this.target = district;
      this.parkName = district.name;
      this.x = district.x;
      this.y = district.y;
    }
    this.roads = roads || this.roads;
    this.pickBestRoad();
    // If no road, sit at district center
    if (!this.currentRoad && district) {
      this.x = district.x + (Math.random() - 0.5) * district.r * 0.4;
      this.y = district.y + (Math.random() - 0.5) * district.r * 0.4;
    }
  }

  assignJob(job, toDistrict, fromDistrict, roads, spawn) {
    this.job = job;
    this.origin = fromDistrict || job?.from || null;
    this.target = toDistrict || job?.to || this.target;
    this.arrived = false;
    this.stuck = false;
    this.idleTime = 0;
    this.life = 0;
    this._triedReverse = false;
    this.cargo = this.getCargoCapacity();
    this.roads = roads || this.roads;
    if (spawn?.road) {
      this.attachToRoad(spawn.road, spawn.t, !!spawn.reverse, false);
    } else if (fromDistrict) {
      this.x = fromDistrict.x;
      this.y = fromDistrict.y;
      this.pickBestRoad();
    }
  }

  update(dt, roads, allVehicles) {
    this.life += dt;
    this.roads = roads;

    // Fleet idle: sit still until assigned a job
    if (this.fleetOwned && !this.job) {
      this.idleTime = 0;
      this.stuck = false;
      this.arrived = false;
      return;
    }

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
    // 2-spor: mindre opbremsning ved tæt trafik
    const laneEase = this.currentRoad?.lanes >= 2 ? 0.55 : 1;
    const weatherMul = this._weatherMul != null ? this._weatherMul : 1;
    this.speed = this.baseSpeed * weatherMul * Math.max(0.14, 1 - nearby * 0.13 * laneEase);
    // Envejs: korrektér ulovlig retning
    if (this.currentRoad.oneWay === 1 && this.reverse) this.reverse = false;
    if (this.currentRoad.oneWay === -1 && !this.reverse) this.reverse = true;
    // Trafiklys: stop nær midten ved rødt
    if (this.currentRoad.hasLight && this.currentRoad.isLightRed?.()) {
      const t = this.progress;
      const approaching =
        (!this.reverse && t > 0.35 && t < 0.52) ||
        (this.reverse && t < 0.65 && t > 0.48);
      if (approaching || (t > 0.45 && t < 0.55)) {
        this.speed *= 0.04;
        this.idleTime += dt * 0.35;
      }
    }
    if (nearby >= (this.currentRoad?.lanes >= 2 ? 6 : 4)) this.idleTime += dt;
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
        // U-turn on same road (kun hvis tovejs tillader det)
        const canUturn = !this.currentRoad.oneWay ||
          this.currentRoad.allowsDirection?.(!this.reverse);
        if (!this._triedReverse && canUturn) {
          this._triedReverse = true;
          const newReverse = !this.reverse;
          if (this.currentRoad.allowsDirection && !this.currentRoad.allowsDirection(newReverse)) {
            this._triedReverse = false;
          } else {
            const t = clampTravelT(this.progress);
            this.attachToRoad(this.currentRoad, t, newReverse, true);
            this._turnTimer = 0.12;
          }
        } else if (!this._triedReverse) {
          this._triedReverse = true; // skip illegal U-turn once
          this.pickBestRoad();
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
    const isFast = this.classId === 'car_fast';
    const isHeavy = this.classId === 'truck_heavy';
    const isBus = this.classId === 'bus';
    const isVan = this.classId === 'van';
    const rank = this.upgradeRank || 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(1.5 * dpr, 2.5 * dpr, s * (isBus || isHeavy ? 1.7 : 1.45), s * (isHeavy || isBus ? 0.95 : 0.8), 0, 0, Math.PI * 2);
    ctx.fill();

    const sprite = getVehicleSprite(this.classId, this.kind);
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const sc = (isBus ? 3.05 : isHeavy ? 2.85 : isVan ? 2.65 : isFast ? 2.4 : 2.55) * s;
      ctx.drawImage(sprite, -sc / 2, -sc / 2, sc, sc);
    } else if (this.kind === 'truck') {
      this.drawTruck(ctx, s, dpr, isHeavy);
    } else {
      this.drawCar(ctx, s, dpr, isFast);
    }

    // Upgrade rank pips (fleet) – small bars above body
    if (this.fleetOwned && rank > 0) {
      ctx.save();
      ctx.rotate(-this.angle);
      const pipW = 3.2 * dpr;
      const gap = 1.4 * dpr;
      const totalW = rank * pipW + (rank - 1) * gap;
      let px = -totalW / 2;
      const py = -s * 1.55;
      for (let i = 0; i < rank; i++) {
        ctx.fillStyle = i < rank ? '#a78bfa' : 'rgba(0,0,0,0.1)';
        ctx.fillRect(px, py, pipW, 2.2 * dpr);
        px += pipW + gap;
      }
      ctx.restore();
    }

    // Class accent ring
    if (this.fleetOwned && (isFast || isHeavy || isBus || isVan)) {
      ctx.strokeStyle = isBus
        ? 'rgba(13, 148, 136, 0.9)'
        : isVan
          ? 'rgba(59, 130, 246, 0.85)'
          : isFast
            ? 'rgba(244, 63, 94, 0.85)'
            : 'rgba(68, 64, 60, 0.8)';
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      ctx.arc(0, 0, s * (isBus || isHeavy ? 1.75 : 1.5), 0, Math.PI * 2);
      ctx.stroke();
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

    // Cargo / class icon hint
    ctx.save();
    ctx.rotate(-this.angle);
    ctx.font = `${Math.max(8, 9 * dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    if (isHeavy) ctx.fillText('🚛', 0, -s * 1.85);
    else if (this.kind === 'truck') ctx.fillText('📦', 0, -s * 1.6);
    else if (isFast) ctx.fillText('⚡', 0, -s * 1.55);
    ctx.restore();

    ctx.restore();
  }

  drawCar(ctx, s, dpr, isFast = false) {
    const w = s * (isFast ? 2.65 : 2.5);
    const h = s * (isFast ? 1.1 : 1.25);
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

    // Fast: racing stripe
    if (isFast) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-w * 0.42, -h * 0.12, w * 0.75, h * 0.24);
    }

    // Roof / window band
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillRect(-s * 0.2, -s * 0.38, s * 1.0, s * 0.76);

    // Headlights (brighter on fast)
    ctx.fillStyle = isFast ? 'rgba(254, 240, 138, 1)' : 'rgba(254, 243, 199, 0.9)';
    ctx.fillRect(w / 2 - 2.5 * dpr, -h * 0.28, 2.2 * dpr, h * 0.2);
    ctx.fillRect(w / 2 - 2.5 * dpr, h * 0.08, 2.2 * dpr, h * 0.2);

    // Wheels
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-w * 0.32, -h * 0.62, s * 0.45, s * 0.28);
    ctx.fillRect(-w * 0.32, h * 0.34, s * 0.45, s * 0.28);
    ctx.fillRect(w * 0.08, -h * 0.62, s * 0.45, s * 0.28);
    ctx.fillRect(w * 0.08, h * 0.34, s * 0.45, s * 0.28);
  }

  drawTruck(ctx, s, dpr, isHeavy = false) {
    const cabW = s * (isHeavy ? 1.05 : 1.15);
    const bodyW = s * (isHeavy ? 2.7 : 2.35);
    const h = s * (isHeavy ? 1.55 : 1.4);

    // Trailer
    ctx.fillStyle = this.color;
    ctx.fillRect(-bodyW * 0.58, -h * 0.5, bodyW, h);
    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(-bodyW * 0.58, -h * 0.5, bodyW, h);

    // Heavy: extra cargo ribs
    ctx.strokeStyle = isHeavy ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = (isHeavy ? 1.6 : 1.3) * dpr;
    ctx.beginPath();
    const ribs = isHeavy ? [-0.42, -0.22, -0.02, 0.15] : [-0.38, -0.08];
    for (const t of ribs) {
      ctx.moveTo(bodyW * t, -h * 0.35);
      ctx.lineTo(bodyW * t, h * 0.35);
    }
    ctx.stroke();

    // Cab
    ctx.fillStyle = this.darken(this.color, 0.82);
    ctx.fillRect(bodyW * 0.32, -h * 0.42, cabW, h * 0.84);
    // Window
    ctx.fillStyle = 'rgba(186, 230, 253, 0.7)';
    ctx.fillRect(bodyW * 0.4, -h * 0.28, cabW * 0.55, h * 0.45);
    // Wheels
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-bodyW * 0.45, -h * 0.62, s * 0.5, s * 0.3);
    ctx.fillRect(-bodyW * 0.45, h * 0.32, s * 0.5, s * 0.3);
    ctx.fillRect(bodyW * 0.15, -h * 0.62, s * 0.5, s * 0.3);
    ctx.fillRect(bodyW * 0.15, h * 0.32, s * 0.5, s * 0.3);
    if (isHeavy) {
      ctx.fillRect(-bodyW * 0.15, -h * 0.62, s * 0.5, s * 0.3);
      ctx.fillRect(-bodyW * 0.15, h * 0.32, s * 0.5, s * 0.3);
    }
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
