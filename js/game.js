import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { InputHandler } from './input.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.roads = [];
    this.vehicles = [];
    this.districts = [];

    this.paused = false;
    this.running = false;
    this.lastTime = 0;

    this.currentStroke = null;
    this.input = new InputHandler(canvas, this);

    this.spawnTimer = 0;
    this.arrivedCount = 0;
    this.totalSpawned = 0;

    this.initDistricts();
  }

  initDistricts() {
    // Relative positions (0-1) so they adapt to any screen
    this.districtDefs = [
      { rx: 0.15, ry: 0.18, rr: 0.055, color: '#fbbf24', name: 'Nord' },
      { rx: 0.82, ry: 0.20, rr: 0.050, color: '#34d399', name: 'Øst' },
      { rx: 0.16, ry: 0.78, rr: 0.060, color: '#60a5fa', name: 'Vest' },
      { rx: 0.78, ry: 0.75, rr: 0.055, color: '#f472b6', name: 'Syd' },
      { rx: 0.48, ry: 0.48, rr: 0.048, color: '#a78bfa', name: 'Centrum' }
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

  onResize() {
    this.dpr = window.devicePixelRatio || 1;
    this.updateDistrictPositions();
  }

  screenToWorld(x, y) {
    return {
      x: x * this.dpr,
      y: y * this.dpr
    };
  }

  beginStroke(x, y) {
    const p = this.screenToWorld(x, y);
    this.currentStroke = [{ x: p.x, y: p.y }];
  }

  continueStroke(x, y) {
    if (!this.currentStroke) return;
    const p = this.screenToWorld(x, y);
    const last = this.currentStroke[this.currentStroke.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy > 16) {
      this.currentStroke.push({ x: p.x, y: p.y });
    }
  }

  endStroke() {
    if (!this.currentStroke || this.currentStroke.length < 2) {
      this.currentStroke = null;
      return;
    }
    const simplified = this.simplify(this.currentStroke, 10);
    if (simplified.length >= 2) {
      this.roads.push(new Road(simplified));
    }
    this.currentStroke = null;
  }

  simplify(points, tolerance) {
    if (points.length <= 2) return points;
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx * dx + dy * dy > tolerance * tolerance) {
        result.push(curr);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  undo() {
    if (this.roads.length > 0) {
      this.roads.pop();
    }
  }

  clearRoads() {
    this.roads = [];
    this.vehicles = [];
    this.arrivedCount = 0;
    this.totalSpawned = 0;
  }

  spawnVehicle() {
    if (this.districts.length < 2 || this.roads.length === 0) return;

    const from = this.districts[Math.floor(Math.random() * this.districts.length)];
    let to = this.districts[Math.floor(Math.random() * this.districts.length)];
    while (to === from) {
      to = this.districts[Math.floor(Math.random() * this.districts.length)];
    }

    // Only spawn if there is a road reasonably close to the start district
    const near = this.findNearestRoadPoint(from.x, from.y, 140);
    if (!near) return;

    const vehicle = new Vehicle(from.x, from.y, to, this.roads);
    this.vehicles.push(vehicle);
    this.totalSpawned++;
  }

  findNearestRoadPoint(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const road of this.roads) {
      for (let i = 0; i < road.points.length; i++) {
        const p = road.points[i];
        const dx = p.x - x;
        const dy = p.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = { road, index: i, point: p };
        }
      }
    }
    return best;
  }

  // Calculate rough density per road for visual feedback
  updateRoadDensities() {
    for (const road of this.roads) {
      road.density = 0;
    }
    for (const v of this.vehicles) {
      if (v.currentRoad) {
        v.currentRoad.density = (v.currentRoad.density || 0) + 1;
      }
    }
  }

  update(dt) {
    if (this.paused || !this.running) return;

    this.spawnTimer += dt;
    if (this.spawnTimer > 1.4 && this.vehicles.length < 40) {
      this.spawnVehicle();
      this.spawnTimer = 0;
    }

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt, this.roads, this.vehicles);
      if (v.arrived) {
        this.arrivedCount++;
        this.vehicles.splice(i, 1);
      } else if (v.life > 70) {
        this.vehicles.splice(i, 1);
      }
    }

    this.updateRoadDensities();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Warm paper background
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(0,0,0,0.025)';
    ctx.lineWidth = 1;
    const step = 48 * this.dpr;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Districts
    for (const d of this.districts) {
      // Soft glow
      const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.4);
      grad.addColorStop(0, d.color + '40');
      grad.addColorStop(1, d.color + '00');
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.color + '66';
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 3.5 * this.dpr;
      ctx.stroke();

      ctx.fillStyle = '#333';
      ctx.font = `bold ${Math.max(11, 12 * this.dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name, d.x, d.y);
    }

    // Roads (with density coloring)
    for (const road of this.roads) {
      road.draw(ctx, this.dpr);
    }

    // Current stroke preview
    if (this.currentStroke && this.currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 10 * this.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.85;
      ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
      for (let i = 1; i < this.currentStroke.length; i++) {
        ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Vehicles
    for (const v of this.vehicles) {
      v.draw(ctx, this.dpr);
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
