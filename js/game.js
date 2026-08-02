import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { InputHandler } from './input.js';

const GOALS = [20, 40, 70, 110, 160, 220, 300];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.roads = [];
    this.vehicles = [];
    this.districts = [];
    this.particles = [];

    this.paused = false;
    this.running = false;
    this.lastTime = 0;

    this.currentStroke = null;
    this.mode = 'draw';
    this.input = new InputHandler(canvas, this);

    this.spawnTimer = 0;
    this.arrivedCount = 0;
    this.totalSpawned = 0;
    this.sessionBest = 0;
    this.allTimeBest = this.loadBest();
    this.goalIndex = 0;
    this.goalReachedFlash = 0;
    this.snapDistance = 70;

    this.initDistricts();
  }

  loadBest() {
    try {
      return parseInt(localStorage.getItem('flowtown-best') || '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  saveBest(value) {
    try {
      localStorage.setItem('flowtown-best', String(value));
    } catch {}
  }

  get currentGoal() {
    return GOALS[Math.min(this.goalIndex, GOALS.length - 1)];
  }

  initDistricts() {
    this.districtDefs = [
      { rx: 0.14, ry: 0.17, rr: 0.052, color: '#fbbf24', name: 'Nord' },
      { rx: 0.84, ry: 0.18, rr: 0.048, color: '#34d399', name: 'Øst' },
      { rx: 0.15, ry: 0.80, rr: 0.055, color: '#60a5fa', name: 'Vest' },
      { rx: 0.80, ry: 0.78, rr: 0.050, color: '#f472b6', name: 'Syd' },
      { rx: 0.48, ry: 0.47, rr: 0.046, color: '#a78bfa', name: 'Centrum' }
    ];
    this.updateDistrictPositions();
  }

  updateDistrictPositions() {
    const w = this.canvas.width || 1200;
    const h = this.canvas.height || 800;
    this.districts = this.districtDefs.map(d => ({
      x: d.rx * w,
      y: d.ry * h,
      r: d.rr * Math.min(w, h),
      color: d.color,
      name: d.name
    }));
  }

  start() {
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setMode(mode) {
    this.mode = mode;
  }

  onResize() {
    this.dpr = window.devicePixelRatio || 1;
    this.updateDistrictPositions();
  }

  screenToWorld(x, y) {
    return { x: x * this.dpr, y: y * this.dpr };
  }

  beginStroke(x, y) {
    if (this.mode === 'erase') {
      this.eraseNear(x, y);
      return;
    }
    const p = this.screenToWorld(x, y);
    this.currentStroke = [{ x: p.x, y: p.y }];
  }

  continueStroke(x, y) {
    if (this.mode === 'erase' || !this.currentStroke) return;
    const p = this.screenToWorld(x, y);
    const last = this.currentStroke[this.currentStroke.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy > 12) {
      this.currentStroke.push({ x: p.x, y: p.y });
    }
  }

  endStroke() {
    if (this.mode === 'erase' || !this.currentStroke || this.currentStroke.length < 2) {
      this.currentStroke = null;
      return;
    }

    let points = this.simplify(this.currentStroke, 9);
    if (points.length < 2) {
      this.currentStroke = null;
      return;
    }

    points = this.snapEndpoints(points);
    this.roads.push(new Road(points));
    this.currentStroke = null;
  }

  eraseNear(screenX, screenY) {
    const p = this.screenToWorld(screenX, screenY);
    let bestIdx = -1;
    let bestDist = 40 * this.dpr;

    for (let i = 0; i < this.roads.length; i++) {
      const closest = this.roads[i].closestPoint(p.x, p.y);
      if (closest.dist < bestDist) {
        bestDist = closest.dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      this.vehicles = this.vehicles.filter(v => v.currentRoad !== this.roads[bestIdx]);
      this.roads.splice(bestIdx, 1);
    }
  }

  snapEndpoints(points) {
    const snap = this.snapDistance * this.dpr;
    const start = points[0];
    const end = points[points.length - 1];

    let bestStart = null, bestEnd = null;
    let bestStartD = snap * snap, bestEndD = snap * snap;

    for (const road of this.roads) {
      for (let i = 0; i < road.points.length; i++) {
        const p = road.points[i];
        const isEnd = i === 0 || i === road.points.length - 1;
        const weight = isEnd ? 1.0 : 1.6;

        let d = ((start.x - p.x) ** 2 + (start.y - p.y) ** 2) * weight;
        if (d < bestStartD) { bestStartD = d; bestStart = p; }

        d = ((end.x - p.x) ** 2 + (end.y - p.y) ** 2) * weight;
        if (d < bestEndD) { bestEndD = d; bestEnd = p; }
      }
    }

    if (bestStart) points[0] = { x: bestStart.x, y: bestStart.y };
    if (bestEnd) points[points.length - 1] = { x: bestEnd.x, y: bestEnd.y };
    return points;
  }

  simplify(points, tolerance) {
    if (points.length <= 2) return points;
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const dx = curr.x - prev.x, dy = curr.y - prev.y;
      if (dx * dx + dy * dy > tolerance * tolerance) result.push(curr);
    }
    result.push(points[points.length - 1]);
    return result;
  }

  undo() {
    if (this.roads.length > 0) this.roads.pop();
  }

  clearRoads() {
    this.roads = [];
    this.vehicles = [];
    this.particles = [];
    this.arrivedCount = 0;
    this.totalSpawned = 0;
  }

  spawnVehicle() {
    if (this.districts.length < 2 || this.roads.length === 0) return;

    const from = this.districts[Math.floor(Math.random() * this.districts.length)];
    let to = this.districts[Math.floor(Math.random() * this.districts.length)];
    while (to === from) to = this.districts[Math.floor(Math.random() * this.districts.length)];

    const near = this.findNearestRoadPoint(from.x, from.y, 150);
    if (!near) return;

    this.vehicles.push(new Vehicle(from.x, from.y, to, this.roads));
    this.totalSpawned++;
  }

  findNearestRoadPoint(x, y, maxDist) {
    let best = null, bestDist = maxDist * maxDist;
    for (const road of this.roads) {
      for (const p of road.points) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestDist) { bestDist = d; best = { road, point: p }; }
      }
    }
    return best;
  }

  addArrivalParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90 - 30,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.0,
        color: color || '#10b981',
        size: 3 + Math.random() * 5
      });
    }
  }

  checkGoal() {
    if (this.arrivedCount >= this.currentGoal && this.goalIndex < GOALS.length) {
      this.goalIndex++;
      this.goalReachedFlash = 2.2;
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;
      for (let i = 0; i < 25; i++) {
        this.particles.push({
          x: cx, y: cy,
          vx: (Math.random() - 0.5) * 200,
          vy: (Math.random() - 0.5) * 200,
          life: 1.2 + Math.random() * 0.8,
          maxLife: 1.8,
          color: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)],
          size: 4 + Math.random() * 6
        });
      }
    }
  }

  updateRoadDensities() {
    for (const road of this.roads) road.density = 0;
    for (const v of this.vehicles) {
      if (v.currentRoad) v.currentRoad.density = (v.currentRoad.density || 0) + 1;
    }
  }

  update(dt) {
    if (this.paused || !this.running) return;

    if (this.goalReachedFlash > 0) this.goalReachedFlash -= dt;

    this.spawnTimer += dt;
    if (this.spawnTimer > 1.15 && this.vehicles.length < 50) {
      this.spawnVehicle();
      this.spawnTimer = 0;
    }

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt, this.roads, this.vehicles);
      if (v.arrived) {
        this.arrivedCount++;
        if (this.arrivedCount > this.sessionBest) this.sessionBest = this.arrivedCount;
        if (this.arrivedCount > this.allTimeBest) {
          this.allTimeBest = this.arrivedCount;
          this.saveBest(this.allTimeBest);
        }
        this.addArrivalParticles(v.x, v.y, v.color);
        this.checkGoal();
        this.vehicles.splice(i, 1);
      } else if (v.life > 85) {
        this.vehicles.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    this.updateRoadDensities();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,0,0,0.018)';
    ctx.lineWidth = 1;
    const step = 52 * this.dpr;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    for (const d of this.districts) {
      const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.7);
      grad.addColorStop(0, d.color + '60');
      grad.addColorStop(0.55, d.color + '25');
      grad.addColorStop(1, d.color + '00');
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.color + '75';
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 4 * this.dpr;
      ctx.stroke();

      ctx.fillStyle = '#2d2a26';
      ctx.font = `bold ${Math.max(12, 13 * this.dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name, d.x, d.y);
    }

    for (const road of this.roads) road.draw(ctx, this.dpr);

    // Draw connection markers (junctions)
    const connR = 7 * this.dpr;
    for (let i = 0; i < this.roads.length; i++) {
      const r1 = this.roads[i];
      const ends1 = [r1.points[0], r1.points[r1.points.length - 1]];
      for (let j = i + 1; j < this.roads.length; j++) {
        const r2 = this.roads[j];
        const ends2 = [r2.points[0], r2.points[r2.points.length - 1]];
        for (const a of ends1) {
          for (const b of ends2) {
            const dx = a.x - b.x, dy = a.y - b.y;
            if (dx * dx + dy * dy < (this.snapDistance * this.dpr * 1.1) ** 2) {
              ctx.beginPath();
              ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, connR, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(15, 118, 110, 0.45)';
              ctx.fill();
              ctx.strokeStyle = '#0f766e';
              ctx.lineWidth = 1.5 * this.dpr;
              ctx.stroke();
            }
          }
        }
      }
    }

    if (this.mode === 'draw' && this.currentStroke && this.currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 12 * this.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.8;
      ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
      for (let i = 1; i < this.currentStroke.length; i++) {
        ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const last = this.currentStroke[this.currentStroke.length - 1];
      for (const road of this.roads) {
        for (const p of [road.points[0], road.points[road.points.length - 1]]) {
          const dx = last.x - p.x, dy = last.y - p.y;
          if (dx * dx + dy * dy < (this.snapDistance * this.dpr) ** 2) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 11 * this.dpr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15, 118, 110, 0.4)';
            ctx.fill();
            ctx.strokeStyle = '#0f766e';
            ctx.lineWidth = 2.5 * this.dpr;
            ctx.stroke();
          }
        }
      }
    }

    for (const v of this.vehicles) v.draw(ctx, this.dpr);

    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * this.dpr * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.goalReachedFlash > 0) {
      const alpha = Math.min(1, this.goalReachedFlash / 0.6);
      ctx.fillStyle = `rgba(16, 185, 129, ${0.15 * alpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
      ctx.font = `bold ${Math.max(22, 28 * this.dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Mål nået! 🎉', w / 2, h / 2 - 20 * this.dpr);
      ctx.font = `${Math.max(14, 16 * this.dpr)}px system-ui`;
      ctx.fillText(`Næste mål: ${this.currentGoal}`, w / 2, h / 2 + 20 * this.dpr);
    }
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }
}
