/**
 * P3-2: Stærkere AI city planner – job-prioritet, snyl på flaskehalse,
 * motorvej-upgrade, aggressiv spawn, undgå dobbeltveje.
 */

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Curved polyline between two points with a soft freehand bend */
function curvedPath(from, to, dpr, bend = 0.22) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
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
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * mid.x + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * mid.y + t * t * to.y;
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
   * @param {number} [opts.aggression=1] 0.8–1.4 personlighed
   */
  constructor({ id, name, color, money = 400, game, aggression = 1 }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.money = money;
    this.score = 0;
    this.delivered = 0;
    this.game = game;
    this.enabled = true;
    this.aggression = aggression;

    this.buildTimer = 1.2 + Math.random() * 1.5;
    this.spawnTimer = 0.5 + Math.random() * 0.8;
    this.upgradeTimer = 4 + Math.random() * 3;
    this.thinkInterval = 0.35 + Math.random() * 0.25;
  }

  update(dt) {
    if (!this.enabled || !this.game.running || this.game.paused) return;

    // Bagud? tænk hurtigere
    const playerScore = this.game.playerScore || 0;
    const lag = Math.max(0, playerScore - this.score);
    const haste = 1 + Math.min(0.55, lag / 400) * this.aggression;

    this.buildTimer -= dt * haste;
    this.spawnTimer -= dt * haste;
    this.upgradeTimer -= dt;

    if (this.buildTimer <= 0) {
      this.tryBuildRoad();
      // Ekstra chance for 2. vej når rig
      if (this.money > 280 && Math.random() < 0.28 * this.aggression) {
        this.tryBuildRoad();
      }
      this.buildTimer = (1.6 + Math.random() * 2.4) / this.aggression;
    }

    if (this.spawnTimer <= 0) {
      this.trySpawnVehicle();
      // Rush hour: bots spawner mere
      const rush = this.game.rushActive ? 0.65 : 1;
      this.spawnTimer = (0.75 + Math.random() * 1.0) * rush / this.aggression;
    }

    if (this.upgradeTimer <= 0) {
      this.tryUpgradeRoad();
      this.upgradeTimer = 5.5 + Math.random() * 4;
    }
  }

  /** Prefer building roads that serve open jobs + cut player advantage */
  tryBuildRoad() {
    const g = this.game;
    const districts = g.districts;
    if (districts.length < 2) return;

    let bestPair = null;
    let bestScore = -Infinity;

    const playerJobsOn = (a, b) => {
      let n = 0;
      for (const v of g.vehicles) {
        if (v.owner !== 'player' || !v.job) continue;
        const f = v.job.from?.name;
        const t = v.job.to?.name;
        if ((f === a.name && t === b.name) || (f === b.name && t === a.name)) n++;
      }
      return n;
    };

    for (let i = 0; i < districts.length; i++) {
      for (let j = i + 1; j < districts.length; j++) {
        const a = districts[i];
        const b = districts[j];
        const connected = g.areDistrictsRoughlyConnected(a, b);
        // Allerede tæt forbundet med bot-vej? skip
        if (connected && this._botLinkExists(a, b)) continue;

        const jobWeight = g.jobs
          .filter(job => job.active && (
            (job.from.name === a.name && job.to.name === b.name) ||
            (job.from.name === b.name && job.to.name === a.name)
          ))
          .reduce((s, job) => {
            const rem = job.amount - job.delivered;
            const rewardHint = (job.reward || 40) / Math.max(1, job.amount);
            return s + rem * (1 + rewardHint * 0.04);
          }, 0);

        const d = dist(a, b);
        // Bro-cost ca. hvis vand (grov: dyrere over afstand)
        let cost = g.roadCostForLength(d);
        // Lidt rabat i AI-hovedet så de tør bygge
        cost = Math.round(cost * 0.92);
        if (cost > this.money) continue;

        // Vækst + industri: mere værdifuldt
        const growthBonus = ((a.growth | 0) + (b.growth | 0)) * 4;
        const typeBonus =
          (a.type === 'factory' || b.type === 'factory' ? 18 : 0) +
          (a.type === 'harbor' || b.type === 'harbor' ? 12 : 0) +
          (a.type === 'capital' || b.type === 'capital' ? 10 : 0);

        // Konkurrér om spillerens ruter
        const steal = playerJobsOn(a, b) * 14 * this.aggression;

        let score =
          jobWeight * 14 +
          (connected ? -18 : 48) +
          growthBonus +
          typeBonus +
          steal +
          Math.random() * 12;
        // Prefer medium distances (ikke for korte, ikke for dyre)
        score += Math.min(d / 70, 28) - Math.max(0, (d - 500) / 40);
        if (score > bestScore) {
          bestScore = score;
          bestPair = { a, b, cost, d };
        }
      }
    }

    if (!bestPair && this.money > 70) {
      // Forbind uforbundet sted med højest growth/type
      const ranked = [...districts].sort((x, y) => {
        const sx = (x.growth | 0) + (x.type === 'factory' ? 3 : 0);
        const sy = (y.growth | 0) + (y.type === 'factory' ? 3 : 0);
        return sy - sx;
      });
      for (const a of ranked) {
        let b = ranked[Math.floor(Math.random() * ranked.length)];
        while (b === a) b = ranked[Math.floor(Math.random() * ranked.length)];
        if (g.areDistrictsRoughlyConnected(a, b) && Math.random() < 0.6) continue;
        const d = dist(a, b);
        const cost = Math.round(g.roadCostForLength(d) * 0.92);
        if (cost <= this.money) {
          bestPair = { a, b, cost, d };
          break;
        }
      }
    }

    if (!bestPair) return;

    const points = curvedPath(
      this.edgePoint(bestPair.a, bestPair.b),
      this.edgePoint(bestPair.b, bestPair.a),
      g.dpr,
      0.16 + Math.random() * 0.12
    );

    const snapped = g.snapEndpoints(points.map(p => ({ ...p })));
    const built = g.addRoadForOwner(snapped, this.id, this.color, bestPair.cost, false);
    if (built) {
      this.money -= bestPair.cost;
    }
  }

  /** Er der allerede en bot-vej nær begge byer? */
  _botLinkExists(a, b) {
    const g = this.game;
    const near = (d, road) => {
      const c = road.closestPoint(d.x, d.y);
      return c.dist < d.r + 90;
    };
    for (const r of g.roads) {
      if (r.owner !== this.id) continue;
      if (near(a, r) && near(b, r)) return true;
    }
    return false;
  }

  /** Opgrader egen vej til motorvej hvis tæt trafik */
  tryUpgradeRoad() {
    const g = this.game;
    if (this.money < 50) return;
    let best = null;
    let bestDens = 2.5;
    for (const road of g.roads) {
      if (road.owner !== this.id) continue;
      if ((road.lanes | 0) >= 3) continue;
      const dens = road.effectiveDensity != null ? road.effectiveDensity : (road.density || 0);
      if (dens > bestDens) {
        bestDens = dens;
        best = road;
      }
    }
    if (!best) {
      // Random egen vej nogle gange
      const mine = g.roads.filter(r => r.owner === this.id && (r.lanes | 0) < 3);
      if (mine.length && Math.random() < 0.2) best = mine[Math.floor(Math.random() * mine.length)];
    }
    if (!best) return;
    const cost = Math.max(35, Math.floor(28 + best.length * 0.038));
    if (this.money < cost) return;
    this.money -= cost;
    best.lanes = 3;
    best.paidCost = (best.paidCost || 0) + cost;
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
    const myFleet = g.vehicles.filter(v => v.owner === this.id).length;
    const cap = 10 + Math.floor(3 * this.aggression);
    if (myFleet >= cap) return;
    if (g.roads.length === 0) return;

    const open = g.jobs.filter(j => j.active && j.delivered < j.amount);
    if (open.length === 0) return;

    const counts = {};
    const playerOn = {};
    for (const v of g.vehicles) {
      if (v.job) {
        if (v.owner === this.id) counts[v.job.id] = (counts[v.job.id] || 0) + 1;
        if (v.owner === 'player') playerOn[v.job.id] = (playerOn[v.job.id] || 0) + 1;
      }
    }

    let best = null;
    let bestScore = -Infinity;
    for (const job of open) {
      const remaining = job.amount - job.delivered;
      const onRoute = counts[job.id] || 0;
      const capJ = Math.min(4, Math.max(1, Math.ceil(remaining / 1.2)));
      if (onRoute >= capJ) continue;
      const from = g.districts.find(d => d.name === job.from.name) || job.from;
      const to = g.districts.find(d => d.name === job.to.name) || job.to;
      if (!g.findSpawnOnRoadNear(from, to, 200)) continue;

      // Prioritér jobs med vej vi ejer nær origin
      let ownRoad = 0;
      for (const r of g.roads) {
        if (r.owner !== this.id) continue;
        if (r.closestPoint(from.x, from.y).dist < from.r + 100) ownRoad = 25;
      }

      const rewardPer = (job.reward || 40) / Math.max(1, job.amount);
      const contest = (playerOn[job.id] || 0) * 8 * this.aggression;
      const score =
        remaining * 6 +
        rewardPer * 1.2 +
        ownRoad +
        contest -
        onRoute * 18 +
        (job.type === 'cargo' ? 6 : 0) +
        Math.random() * 5;
      if (score > bestScore) {
        bestScore = score;
        best = job;
      }
    }
    if (!best) return;

    // Spawn 1–2 biler hvis job er stort og penge ok
    g.spawnJobVehicle(best, this.id, this.color);
    if ((best.amount - best.delivered) >= 6 && myFleet + 1 < cap && Math.random() < 0.4 * this.aggression) {
      g.spawnJobVehicle(best, this.id, this.color);
    }
  }

  onDelivery(reward, units = 1) {
    // Lidt ekstra indkomst så bots holder tempo
    const bonus = Math.round(reward * 0.08 * this.aggression);
    this.money += reward + bonus;
    this.score += reward;
    this.delivered += units;
  }
}

export const BOT_PRESETS = [
  { id: 'bot-axel', name: 'Axel AI', color: '#e11d48', aggression: 1.15 },
  { id: 'bot-nova', name: 'Nova AI', color: '#7c3aed', aggression: 1.0 }
];
