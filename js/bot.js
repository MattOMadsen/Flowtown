/**
 * Simple AI city planner – builds roads between districts and
 * competes for delivery jobs with its own vehicles.
 */

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Curved polyline between two points with a soft freehand bend */
function curvedPath(from, to, dpr, bend = 0.22) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular offset for a cozy freehand curve
  const nx = -dy / len;
  const ny = dx / len;
  const side = Math.random() < 0.5 ? 1 : -1;
  const midAmt = len * bend * (0.7 + Math.random() * 0.6) * side;
  const mid = {
    x: (from.x + to.x) / 2 + nx * midAmt,
    y: (from.y + to.y) / 2 + ny * midAmt
  };

  const points = [];
  const steps = Math.max(8, Math.floor(len / (28 * dpr)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Quadratic bezier
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * mid.x + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * mid.y + t * t * to.y;
    // Slight noise for freehand feel
    const n = (Math.random() - 0.5) * 4 * dpr * (t > 0.05 && t < 0.95 ? 1 : 0);
    points.push({ x: x + n * nx, y: y + n * ny });
  }
  return points;
}

export class Bot {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} opts.name
   * @param {string} opts.color
   * @param {number} opts.money
   * @param {import('./game.js').Game} opts.game
   */
  constructor({ id, name, color, money = 400, game }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.money = money;
    this.score = 0;
    this.delivered = 0;
    this.game = game;
    this.enabled = true;

    this.buildTimer = 1.5 + Math.random() * 2;
    this.spawnTimer = 0.8 + Math.random();
    this.thinkInterval = 0.4 + Math.random() * 0.3;
  }

  update(dt) {
    if (!this.enabled || !this.game.running || this.game.paused) return;

    this.buildTimer -= dt;
    this.spawnTimer -= dt;

    if (this.buildTimer <= 0) {
      this.tryBuildRoad();
      this.buildTimer = 2.2 + Math.random() * 3.5;
    }

    if (this.spawnTimer <= 0) {
      this.trySpawnVehicle();
      this.spawnTimer = 1.1 + Math.random() * 1.4;
    }
  }

  /** Prefer building roads that serve open jobs */
  tryBuildRoad() {
    const g = this.game;
    const districts = g.districts;
    if (districts.length < 2) return;

    // Score district pairs by open job demand + lack of connection
    let bestPair = null;
    let bestScore = -Infinity;

    for (let i = 0; i < districts.length; i++) {
      for (let j = i + 1; j < districts.length; j++) {
        const a = districts[i];
        const b = districts[j];
        const connected = g.areDistrictsRoughlyConnected(a, b);
        const jobWeight = g.jobs
          .filter(job => job.active && (
            (job.from.name === a.name && job.to.name === b.name) ||
            (job.from.name === b.name && job.to.name === a.name)
          ))
          .reduce((s, job) => s + (job.amount - job.delivered), 0);

        const d = dist(a, b);
        const cost = g.roadCostForLength(d);
        if (cost > this.money) continue;

        let score = jobWeight * 12 + (connected ? -25 : 40) + Math.random() * 10;
        // Prefer medium distances
        score += Math.min(d / 80, 25);
        if (score > bestScore) {
          bestScore = score;
          bestPair = { a, b, cost, d };
        }
      }
    }

    // Sometimes just connect a random pair if nothing scored well
    if (!bestPair && this.money > 80) {
      const a = districts[Math.floor(Math.random() * districts.length)];
      let b = districts[Math.floor(Math.random() * districts.length)];
      while (b === a) b = districts[Math.floor(Math.random() * districts.length)];
      const d = dist(a, b);
      const cost = g.roadCostForLength(d);
      if (cost <= this.money) bestPair = { a, b, cost, d };
    }

    if (!bestPair) return;

    // Offset start/end slightly toward district edge so roads meet the hub
    const points = curvedPath(
      this.edgePoint(bestPair.a, bestPair.b),
      this.edgePoint(bestPair.b, bestPair.a),
      g.dpr,
      0.18 + Math.random() * 0.14
    );

    // Snap to existing network if close
    const snapped = g.snapEndpoints(points.map(p => ({ ...p })));
    const built = g.addRoadForOwner(snapped, this.id, this.color, bestPair.cost, false);
    if (built) {
      this.money -= bestPair.cost;
    }
  }

  edgePoint(from, toward) {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const r = from.r * 0.85;
    return {
      x: from.x + (dx / len) * r,
      y: from.y + (dy / len) * r
    };
  }

  trySpawnVehicle() {
    const g = this.game;
    if (g.vehicles.filter(v => v.owner === this.id).length >= 14) return;
    if (g.roads.length === 0) return;

    // A1: only job-backed traffic
    const open = g.jobs.filter(j => j.active && j.delivered < j.amount);
    if (open.length === 0) return;

    const counts = {};
    for (const v of g.vehicles) {
      if (v.owner === this.id && v.job) {
        counts[v.job.id] = (counts[v.job.id] || 0) + 1;
      }
    }

    // Prefer under-served jobs with a road at origin
    let best = null;
    let bestScore = -Infinity;
    for (const job of open) {
      const remaining = job.amount - job.delivered;
      const onRoute = counts[job.id] || 0;
      const cap = Math.min(3, Math.max(1, remaining));
      if (onRoute >= cap) continue;
      const from = g.districts.find(d => d.name === job.from.name) || job.from;
      const to = g.districts.find(d => d.name === job.to.name) || job.to;
      if (!g.findSpawnOnRoadNear(from, to, 180)) continue;
      const score = remaining - onRoute * 2 + Math.random();
      if (score > bestScore) {
        bestScore = score;
        best = job;
      }
    }
    if (!best) return;

    g.spawnJobVehicle(best, this.id, this.color);
  }

  onDelivery(reward, units = 1) {
    this.money += reward;
    this.score += reward;
    this.delivered += units;
  }
}

export const BOT_PRESETS = [
  { id: 'bot-axel', name: 'Axel AI', color: '#e11d48' },
  { id: 'bot-nova', name: 'Nova AI', color: '#7c3aed' }
];
