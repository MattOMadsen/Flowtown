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

    this.currentStroke = null; // points while drawing
    this.input = new InputHandler(canvas, this);

    this.initDistricts();
    this.spawnTimer = 0;
  }

  initDistricts() {
    // Simple cozy districts – positions relative, will scale
    const w = 1200;
    const h = 800;
    this.districts = [
      { x: 180, y: 160, r: 55, color: '#fbbf24', name: 'Nord' },
      { x: 980, y: 180, r: 50, color: '#34d399', name: 'Øst' },
      { x: 200, y: 620, r: 60, color: '#60a5fa', name: 'Vest' },
      { x: 900, y: 580, r: 55, color: '#f472b6', name: 'Syd' },
      { x: 560, y: 380, r: 45, color: '#a78bfa', name: 'Centrum' }
    ];
  }

  start() {
    this.running = true;
    this.paused = false;
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePause() {
    this.paused = !this.paused;
  }

  onResize() {
    this.dpr = window.devicePixelRatio || 1;
  }

  // Convert screen coords to game coords (logical)
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
    if (dx * dx + dy * dy > 25) { // min distance
      this.currentStroke.push({ x: p.x, y: p.y });
    }
  }

  endStroke() {
    if (!this.currentStroke || this.currentStroke.length < 2) {
      this.currentStroke = null;
      return;
    }
    // Simplify a bit
    const simplified = this.simplify(this.currentStroke, 8);
    if (simplified.length >= 2) {
      this.roads.push(new Road(simplified));
    }
    this.currentStroke = null;
  }

  simplify(points, tolerance) {
    if (points.length <= 2) return points;
    // Simple distance-based thinning
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
  }

  spawnVehicle() {
    if (this.districts.length < 2) return;
    const from = this.districts[Math.floor(Math.random() * this.districts.length)];
    let to = this.districts[Math.floor(Math.random() * this.districts.length)];
    while (to === from) {
      to = this.districts[Math.floor(Math.random() * this.districts.length)];
    }

    // Try to find a road near the start district
    const startRoad = this.findNearestRoad(from.x, from.y, 120);
    if (!startRoad) return; // no road close enough yet

    const vehicle = new Vehicle(from.x, from.y, to, this.roads);
    this.vehicles.push(vehicle);
  }

  findNearestRoad(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const road of this.roads) {
      for (const p of road.points) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = road;
        }
      }
    }
    return best;
  }

  update(dt) {
    if (this.paused || !this.running) return;

    // Spawn cars periodically
    this.spawnTimer += dt;
    if (this.spawnTimer > 1.8 && this.vehicles.length < 35) {
      this.spawnVehicle();
      this.spawnTimer = 0;
    }

    // Update vehicles
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt, this.roads, this.vehicles);
      if (v.arrived || v.life > 90) {
        this.vehicles.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid / paper feel
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    const step = 40 * this.dpr;
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
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.color + '55';
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 3 * this.dpr;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#444';
      ctx.font = `${12 * this.dpr}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(d.name, d.x, d.y + 4 * this.dpr);
    }

    // Roads
    for (const road of this.roads) {
      road.draw(ctx, this.dpr);
    }

    // Current stroke
    if (this.currentStroke && this.currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 8 * this.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
      for (let i = 1; i < this.currentStroke.length; i++) {
        ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
      }
      ctx.stroke();
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
