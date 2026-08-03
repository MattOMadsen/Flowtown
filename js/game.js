import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { InputHandler } from './input.js';
import { generateJob, jobComplete, jobLabel } from './jobs.js';
import { Bot, BOT_PRESETS } from './bot.js';
import {
  loadMeta,
  addXp,
  levelProgress,
  claimFirstLink,
  XP_REWARDS
} from './meta.js';
import {
  fleetCap,
  buyPriceForClass,
  vehicleCanDoJob,
  getClass,
  upgradePrice,
  canUpgrade,
  resolveUnlockedClasses,
  applyUpgradeUnlocks,
  FLEET,
  VEHICLE_CLASSES,
  cargoCapacity
} from './fleet.js';
import { saveMeta } from './meta.js';

const START_MONEY = 500;
const MAX_JOBS = 5;
const ROAD_BASE_COST = 12;
const ROAD_COST_PER_PX = 0.045; // scaled by dpr later
const STUCK_PENALTY_INTERVAL = 4;
const STUCK_PENALTY = 3;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.roads = [];
    this.vehicles = [];
    this.districts = [];
    this.particles = [];
    this.jobs = [];
    this.floatTexts = [];

    this.paused = false;
    this.running = false;
    this.lastTime = 0;

    this.currentStroke = null;
    this.mode = 'draw';
    this.input = new InputHandler(canvas, this);

    this.spawnTimer = 0;
    this.assignTimer = 0;
    this.jobTimer = 0;
    this.stuckPenaltyTimer = 0;
    /** Open city sheet: district name or null */
    this.selectedDistrictName = null;

    // Economy & score
    this.money = START_MONEY;
    this.playerScore = 0;
    this.arrivedCount = 0;
    this.playerDelivered = 0;
    this.totalSpawned = 0;
    this.sessionBest = 0;
    this.allTimeBest = this.loadBest();
    this.pendingRoadCost = 0;
    this.toast = null;
    this.toastTimer = 0;

    // Meta: XP / level (persists across sessions)
    this.meta = loadMeta();
    applyUpgradeUnlocks(this.meta);
    saveMeta(this.meta);

    this.snapDistance = 85;

    // Camera (canvas-pixel space)
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.minZoom = 0.45;
    this.maxZoom = 2.8;

    // Bots
    this.botsEnabled = false;
    this.bots = BOT_PRESETS.map(p => new Bot({
      ...p,
      money: 420,
      game: this
    }));
    for (const b of this.bots) b.enabled = false;

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
    const prev = this.districts;
    this.districts = this.districtDefs.map((d, i) => {
      const base = {
        x: d.rx * w,
        y: d.ry * h,
        r: d.rr * Math.min(w, h),
        color: d.color,
        name: d.name,
        demandPeople: prev[i]?.demandPeople ?? 0,
        demandCargo: prev[i]?.demandCargo ?? 0
      };
      return base;
    });
    // Re-bind job district refs after resize
    for (const job of this.jobs) {
      job.from = this.districts.find(d => d.name === job.from.name) || job.from;
      job.to = this.districts.find(d => d.name === job.to.name) || job.to;
    }
  }

  start() {
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    // Seed a couple of starter jobs
    this.addJob();
    this.addJob();
    if (this.getPlayerFleet().length === 0) {
      this.showToast('Tryk på en by for at købe din første bil', 3.5);
    }
    if (!this._loopStarted) {
      this._loopStarted = true;
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  getPlayerFleet() {
    return this.vehicles.filter(v => v.owner === 'player' && v.fleetOwned);
  }

  getFleetCap() {
    return fleetCap(this.meta?.level || 1);
  }

  getFleetStats() {
    const fleet = this.getPlayerFleet();
    const idle = fleet.filter(v => !v.job).length;
    return {
      owned: fleet.length,
      cap: this.getFleetCap(),
      idle,
      busy: fleet.length - idle,
      cars: fleet.filter(v => v.kind === 'car').length,
      trucks: fleet.filter(v => v.kind === 'truck').length
    };
  }

  hitDistrict(screenX, screenY) {
    const w = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestD = Infinity;
    for (const d of this.districts) {
      const dist = Math.hypot(d.x - w.x, d.y - w.y);
      // Generous tap target for mobile
      if (dist <= d.r * 1.35 && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  openDistrictSheet(district) {
    if (!district || !this.running) return;
    this.selectedDistrictName = district.name;
  }

  closeDistrictSheet() {
    this.selectedDistrictName = null;
  }

  getSelectedDistrict() {
    if (!this.selectedDistrictName) return null;
    return this.districts.find(d => d.name === this.selectedDistrictName) || null;
  }

  getUnlockedClasses() {
    return resolveUnlockedClasses(this.meta);
  }

  /** Catalog for buy UI */
  getBuyCatalog() {
    const n = this.getPlayerFleet().length;
    const unlocked = new Set(this.getUnlockedClasses());
    const totalUp = this.meta.totalUpgrades || 0;
    return Object.values(VEHICLE_CLASSES).map(c => ({
      id: c.id,
      label: c.label,
      short: c.short,
      icon: c.icon,
      desc: c.desc,
      kind: c.kind,
      price: buyPriceForClass(c.id, n),
      unlocked: unlocked.has(c.id),
      unlockAt: c.unlockAt,
      progress: c.unlockAt > 0 ? Math.min(1, totalUp / c.unlockAt) : 1,
      remaining: Math.max(0, (c.unlockAt || 0) - totalUp)
    }));
  }

  getBuyPrices() {
    const n = this.getPlayerFleet().length;
    return {
      car: buyPriceForClass('car_std', n),
      truck: buyPriceForClass('truck_std', n)
    };
  }

  /**
   * Buy a vehicle stationed at a district.
   * @param {object|string} district
   * @param {string} classIdOrKind class id or legacy 'car'|'truck'
   */
  buyVehicleAt(district, classIdOrKind = 'car_std') {
    if (!this.running) return { ok: false, reason: 'not_running' };
    const d = typeof district === 'string'
      ? this.districts.find(x => x.name === district)
      : district;
    if (!d) return { ok: false, reason: 'no_district' };

    let classId = classIdOrKind;
    if (classIdOrKind === 'car') classId = 'car_std';
    if (classIdOrKind === 'truck') classId = 'truck_std';
    const cls = getClass(classId);

    const unlocked = this.getUnlockedClasses();
    if (!unlocked.includes(classId)) {
      this.showToast(`Låst – opgrader biler ${cls.unlockAt} gange i alt`);
      return { ok: false, reason: 'locked' };
    }

    const fleet = this.getPlayerFleet();
    const cap = this.getFleetCap();
    if (fleet.length >= cap) {
      this.showToast(`Flåde fuld (${fleet.length}/${cap}) – stig i level for flere slots`);
      return { ok: false, reason: 'cap' };
    }

    const price = buyPriceForClass(classId, fleet.length);
    if (this.money < price) {
      this.showToast(`Ikke råd (mangler $${price - Math.floor(this.money)})`);
      return { ok: false, reason: 'money' };
    }

    this.money -= price;
    const spawn = this.findSpawnOnRoadNear(d, null, 220);
    const v = new Vehicle({
      x: spawn ? spawn.x : d.x,
      y: spawn ? spawn.y : d.y,
      targetDistrict: d,
      roads: this.roads,
      kind: cls.kind,
      classId,
      upgradeRank: 0,
      job: null,
      owner: 'player',
      cargo: cargoCapacity(classId, 0),
      startRoad: spawn?.road || null,
      startT: spawn?.t ?? null,
      startReverse: false,
      fleetOwned: true,
      homeName: d.name
    });
    v.parkIdle(d, this.roads);
    this.vehicles.push(v);
    this.totalSpawned++;
    this.addFloatText(d.x, d.y - d.r, `−$${price}`, '#b91c1c');
    this.showToast(`${cls.icon} ${cls.label} købt i ${d.name}`);
    this.assignFleetJobs();
    return { ok: true, vehicle: v, price };
  }

  /**
   * U1: Upgrade +last on a fleet vehicle.
   */
  upgradeVehicle(vehicleId) {
    const v = this.getPlayerFleet().find(x => x.id === vehicleId);
    if (!v) return { ok: false, reason: 'not_found' };
    if (!canUpgrade(v.upgradeRank)) {
      this.showToast('Max opgraderet (rank 3)');
      return { ok: false, reason: 'max' };
    }
    const price = upgradePrice(v.upgradeRank, v.classId);
    if (this.money < price) {
      this.showToast(`Ikke råd (mangler $${price - Math.floor(this.money)})`);
      return { ok: false, reason: 'money' };
    }
    this.money -= price;
    v.upgradeRank += 1;
    v.applyClassStats();
    if (!v.job) v.cargo = v.getCargoCapacity();

    this.meta.totalUpgrades = (this.meta.totalUpgrades || 0) + 1;
    const newly = applyUpgradeUnlocks(this.meta);
    saveMeta(this.meta);

    const cap = v.getCargoCapacity();
    this.addFloatText(v.x, v.y - 12, `Last ${cap}`, '#7c3aed');
    this.showToast(`Opgraderet · last ${cap} · $${price}`);

    if (newly.length) {
      const names = newly.map(id => {
        const c = getClass(id);
        return `${c.icon} ${c.label}`;
      }).join(', ');
      this.showToast(`Ulåst: ${names}!`, 3.4);
    }
    return { ok: true, vehicle: v, price, newly };
  }

  /** Vehicles listed in upgrade tab (home city first) */
  getFleetForSheet(districtName) {
    const fleet = this.getPlayerFleet();
    const here = [];
    const other = [];
    for (const v of fleet) {
      const home = v.homeName || v.parkName;
      if (home === districtName) here.push(v);
      else other.push(v);
    }
    return [...here, ...other].slice(0, 8);
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setMode(mode) {
    this.mode = mode;
  }

  setBotsEnabled(on) {
    this.botsEnabled = !!on;
    for (const b of this.bots) {
      b.enabled = this.botsEnabled;
      if (!this.botsEnabled) {
        // Remove bot vehicles when turning off
        this.vehicles = this.vehicles.filter(v => v.owner === 'player');
      }
    }
    this.showToast(this.botsEnabled ? 'Modstandere: TIL' : 'Modstandere: FRA');
  }

  toggleBots() {
    this.setBotsEnabled(!this.botsEnabled);
    return this.botsEnabled;
  }

  onResize() {
    this.dpr = window.devicePixelRatio || 1;
    this.updateDistrictPositions();
  }

  /** CSS screen coords → world (canvas) coords */
  screenToWorld(x, y) {
    const sx = x * this.dpr;
    const sy = y * this.dpr;
    return {
      x: (sx - this.camera.x) / this.camera.zoom,
      y: (sy - this.camera.y) / this.camera.zoom
    };
  }

  clampZoom(z) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, z));
  }

  /** Zoom keeping CSS point (sx,sy) fixed in world space */
  setZoomAt(newZoom, sx, sy) {
    const z0 = this.camera.zoom || 1;
    const z1 = this.clampZoom(newZoom);
    if (Math.abs(z1 - z0) < 1e-6) return;
    const cw = this.canvas.clientWidth || window.innerWidth || 1;
    const ch = this.canvas.clientHeight || window.innerHeight || 1;
    const cx = (sx != null ? sx : cw / 2) * this.dpr;
    const cy = (sy != null ? sy : ch / 2) * this.dpr;
    const wx = (cx - this.camera.x) / z0;
    const wy = (cy - this.camera.y) / z0;
    this.camera.zoom = z1;
    this.camera.x = cx - wx * z1;
    this.camera.y = cy - wy * z1;
    this.requestDraw();
  }

  zoomBy(factor, sx, sy) {
    this.setZoomAt(this.camera.zoom * factor, sx, sy);
    this.requestDraw();
  }

  resetCamera() {
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.zoom = 1;
    this.requestDraw();
  }

  /**
   * Fit all districts (+ roads) into view with padding.
   */
  fitCamera(paddingCss = 56) {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y, r = 0) => {
      minX = Math.min(minX, x - r);
      minY = Math.min(minY, y - r);
      maxX = Math.max(maxX, x + r);
      maxY = Math.max(maxY, y + r);
    };
    for (const d of this.districts) expand(d.x, d.y, d.r * 1.4);
    for (const road of this.roads) {
      for (const p of road.points) expand(p.x, p.y, 10 * this.dpr);
    }
    if (!Number.isFinite(minX)) {
      this.resetCamera();
      return;
    }
    const bw = Math.max(40, maxX - minX);
    const bh = Math.max(40, maxY - minY);
    const pad = paddingCss * this.dpr;
    const zx = (w - pad * 2) / bw;
    const zy = (h - pad * 2) / bh;
    const z = this.clampZoom(Math.min(zx, zy, 1.35));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.camera.zoom = z;
    this.camera.x = w / 2 - cx * z;
    this.camera.y = h / 2 - cy * z;
    this.requestDraw();
  }

  getZoomPercent() {
    return Math.round(this.camera.zoom * 100);
  }

  /** Redraw even if game loop not running / between frames */
  requestDraw() {
    if (this._drawPending) return;
    this._drawPending = true;
    requestAnimationFrame(() => {
      this._drawPending = false;
      this.draw();
    });
  }

  roadCostForLength(lenCssPx) {
    // len may be in canvas (dpr) units — normalize roughly
    const len = lenCssPx / Math.max(1, this.dpr);
    return Math.max(15, Math.round(ROAD_BASE_COST + len * ROAD_COST_PER_PX * 22));
  }

  estimateStrokeCost(points) {
    if (!points || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return this.roadCostForLength(len);
  }

  showToast(msg, ms = 2.2) {
    this.toast = msg;
    this.toastTimer = ms;
  }

  beginStroke(x, y) {
    if (this.mode === 'erase') {
      this.eraseNear(x, y);
      return;
    }
    const p = this.screenToWorld(x, y);
    const snapped = this.findSnapPoint(p.x, p.y);
    this.currentStroke = [{ x: snapped.x, y: snapped.y }];
    this.pendingRoadCost = 0;
  }

  continueStroke(x, y) {
    if (this.mode === 'erase' || !this.currentStroke) return;
    const p = this.screenToWorld(x, y);
    const last = this.currentStroke[this.currentStroke.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy > 12) {
      this.currentStroke.push({ x: p.x, y: p.y });
      this.pendingRoadCost = this.estimateStrokeCost(this.currentStroke);
    }
  }

  endStroke() {
    if (this.mode === 'erase' || !this.currentStroke || this.currentStroke.length < 2) {
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      return;
    }

    let points = this.simplify(this.currentStroke, 9);
    if (points.length < 2) {
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      return;
    }

    points = this.snapEndpoints(points);
    const cost = this.estimateStrokeCost(points);

    if (this.money < cost) {
      this.showToast(`Ikke råd (mangler $${cost - this.money})`);
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      // Flash red particles at end
      const end = points[points.length - 1];
      this.addArrivalParticles(end.x, end.y, '#ef4444');
      return;
    }

    this.addRoadForOwner(points, 'player', null, cost, true);
    this.currentStroke = null;
    this.pendingRoadCost = 0;
  }

  /**
   * Shared road placement for player + bots.
   * @returns {boolean} success
   */
  addRoadForOwner(points, owner, ownerColor, cost, chargePlayer) {
    if (!points || points.length < 2) return false;
    if (chargePlayer) {
      if (this.money < cost) return false;
      this.money -= cost;
      this.addFloatText(points[Math.floor(points.length / 2)].x, points[Math.floor(points.length / 2)].y, `−$${cost}`, '#b91c1c');
    }
    this.roads.push(new Road(points, { owner, ownerColor }));
    if (owner === 'player') {
      this.checkFirstLinks();
    }
    return true;
  }

  /**
   * B1: grant XP once the first time two districts become roughly linked.
   */
  checkFirstLinks() {
    const n = this.districts.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.districts[i];
        const b = this.districts[j];
        if (!this.areDistrictsRoughlyConnected(a, b)) continue;
        if (!claimFirstLink(this.meta, a.name, b.name)) continue;
        this.grantXp(XP_REWARDS.firstLink, {
          floatAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          toast: `Forbundet: ${a.name}–${b.name} · +${XP_REWARDS.firstLink} XP`
        });
      }
    }
  }

  /**
   * Award XP to player meta; level-up toast + small $ bonus.
   * @param {number} amount
   * @param {{ floatAt?: {x:number,y:number}, toast?: string|null, silent?: boolean }} [opts]
   */
  grantXp(amount, opts = {}) {
    const result = addXp(this.meta, amount);
    if (result.amount <= 0) return result;

    if (opts.floatAt && !opts.silent) {
      this.addFloatText(opts.floatAt.x, opts.floatAt.y - 18, `+${result.amount} XP`, '#7c3aed');
    }

    if (result.leveled) {
      let moneyBonus = 0;
      for (let i = 0; i < result.levelsGained; i++) {
        const lvl = result.level - result.levelsGained + i + 1;
        moneyBonus += XP_REWARDS.levelMoneyBase + lvl * XP_REWARDS.levelMoneyPerLevel;
      }
      this.money += moneyBonus;
      this.showToast(
        `Level ${result.level}! 🎉 +$${moneyBonus}`,
        3.2
      );
    } else if (opts.toast) {
      this.showToast(opts.toast, 2.0);
    }
    return result;
  }

  getMetaProgress() {
    return levelProgress(this.meta);
  }

  findSnapPoint(x, y) {
    const snap = this.snapDistance * this.dpr;
    let best = { x, y };
    let bestD = snap * snap;

    // Snap to any point along existing roads (segment-accurate)
    for (const road of this.roads) {
      const c = road.closestPoint(x, y);
      const d = c.dist * c.dist;
      if (d < bestD) {
        bestD = d;
        best = { x: c.point.x, y: c.point.y };
      }
      // Prefer endpoints slightly for clean junctions
      for (const p of [road.points[0], road.points[road.points.length - 1]]) {
        const de = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (de < bestD * 0.85) {
          bestD = de;
          best = { x: p.x, y: p.y };
        }
      }
    }
    // Snap to district rim
    for (const d of this.districts) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < d.r + snap * 0.75) {
        const ang = Math.atan2(y - d.y, x - d.x);
        const edge = {
          x: d.x + Math.cos(ang) * d.r * 0.92,
          y: d.y + Math.sin(ang) * d.r * 0.92
        };
        const dd = (edge.x - x) ** 2 + (edge.y - y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = edge;
        }
      }
    }
    return best;
  }

  eraseNear(screenX, screenY) {
    const p = this.screenToWorld(screenX, screenY);
    let bestIdx = -1;
    let bestDist = 40 * this.dpr;

    for (let i = 0; i < this.roads.length; i++) {
      // Player can only erase own roads
      if (this.roads[i].owner !== 'player') continue;
      const closest = this.roads[i].closestPoint(p.x, p.y);
      if (closest.dist < bestDist) {
        bestDist = closest.dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const road = this.roads[bestIdx];
      // Partial refund
      const refund = Math.floor(this.roadCostForLength(road.length) * 0.35);
      this.money += refund;
      this.vehicles = this.vehicles.filter(v => v.currentRoad !== road);
      this.roads.splice(bestIdx, 1);
      if (refund > 0) this.showToast(`Refund +$${refund}`);
    }
  }

  snapEndpoints(points) {
    const snap = this.snapDistance * this.dpr;
    const start = points[0];
    const end = points[points.length - 1];

    let bestStart = null, bestEnd = null;
    let bestStartD = snap * snap, bestEndD = snap * snap;

    for (const road of this.roads) {
      const cs = road.closestPoint(start.x, start.y);
      if (cs.dist * cs.dist < bestStartD) {
        bestStartD = cs.dist * cs.dist;
        bestStart = cs.point;
      }
      const ce = road.closestPoint(end.x, end.y);
      if (ce.dist * ce.dist < bestEndD) {
        bestEndD = ce.dist * ce.dist;
        bestEnd = ce.point;
      }
      // Endpoints win ties for cleaner T-junctions
      for (const p of [road.points[0], road.points[road.points.length - 1]]) {
        let d = (start.x - p.x) ** 2 + (start.y - p.y) ** 2;
        if (d < bestStartD * 0.9) { bestStartD = d; bestStart = p; }
        d = (end.x - p.x) ** 2 + (end.y - p.y) ** 2;
        if (d < bestEndD * 0.9) { bestEndD = d; bestEnd = p; }
      }
    }

    for (const dist of this.districts) {
      for (const pt of [start, end]) {
        const d = Math.hypot(dist.x - pt.x, dist.y - pt.y);
        if (d < dist.r + snap * 0.65) {
          const ang = Math.atan2(pt.y - dist.y, pt.x - dist.x);
          const edge = {
            x: dist.x + Math.cos(ang) * dist.r * 0.92,
            y: dist.y + Math.sin(ang) * dist.r * 0.92
          };
          const dd = (edge.x - pt.x) ** 2 + (edge.y - pt.y) ** 2;
          if (pt === start && dd < bestStartD) {
            bestStartD = dd;
            bestStart = edge;
          }
          if (pt === end && dd < bestEndD) {
            bestEndD = dd;
            bestEnd = edge;
          }
        }
      }
    }

    if (bestStart) points[0] = { x: bestStart.x, y: bestStart.y };
    if (bestEnd) points[points.length - 1] = { x: bestEnd.x, y: bestEnd.y };
    return points;
  }

  /** Douglas-Peucker-ish distance simplify + light Chaikin smooth */
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
    return this.smoothPolyline(result);
  }

  /** One pass Chaikin corner-cutting (keeps endpoints) */
  smoothPolyline(points) {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (i > 0) {
        out.push({
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25
        });
      }
      if (i < points.length - 2) {
        out.push({
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75
        });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  undo() {
    for (let i = this.roads.length - 1; i >= 0; i--) {
      if (this.roads[i].owner === 'player') {
        const road = this.roads[i];
        const refund = Math.floor(this.roadCostForLength(road.length) * 0.5);
        this.money += refund;
        this.vehicles = this.vehicles.filter(v => v.currentRoad !== road);
        this.roads.splice(i, 1);
        this.showToast(`Undo · +$${refund}`);
        return;
      }
    }
  }

  clearRoads() {
    // Only clear player roads; refund partial
    let refund = 0;
    const keep = [];
    for (const r of this.roads) {
      if (r.owner === 'player') {
        refund += Math.floor(this.roadCostForLength(r.length) * 0.4);
      } else {
        keep.push(r);
      }
    }
    this.roads = keep;
    this.vehicles = this.vehicles.filter(v => v.owner !== 'player');
    this.money += refund;
    if (refund) this.showToast(`Rydet · +$${refund}`);
  }

  areDistrictsRoughlyConnected(a, b) {
    // Heuristic: is there a road near both districts?
    const nearA = this.findNearestRoadPoint(a.x, a.y, a.r + 90);
    const nearB = this.findNearestRoadPoint(b.x, b.y, b.r + 90);
    return !!(nearA && nearB);
  }

  addJob() {
    if (this.jobs.filter(j => j.active).length >= MAX_JOBS) return;
    const job = generateJob(this.districts, this.jobs);
    if (job) this.jobs.push(job);
  }

  findNearestRoadPoint(x, y, maxDist) {
    let best = null, bestDist = maxDist * maxDist;
    for (const road of this.roads) {
      for (const p of road.points) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestDist) { bestDist = d; best = { road, point: p }; }
      }
      const c = road.closestPoint(x, y);
      if (c.dist * c.dist < bestDist) {
        bestDist = c.dist * c.dist;
        best = { road, point: c.point };
      }
    }
    return best;
  }

  /**
   * Best road attachment near a district for job spawn.
   * Returns { road, t, reverse, x, y } or null.
   */
  findSpawnOnRoadNear(district, targetDistrict, maxDist = 200) {
    if (!district) return null;
    let best = null;
    let bestDist = maxDist;

    for (const road of this.roads) {
      if (!road.points || road.points.length < 2) continue;
      const c = road.closestPoint(district.x, district.y);
      if (c.dist >= bestDist) continue;

      const t = Math.min(0.97, Math.max(0.03, c.t));
      let reverse = false;
      if (targetDistrict) {
        const lookFwd = road.getPointAt(Math.min(0.98, t + 0.12));
        const lookRev = road.getPointAt(Math.max(0.02, t - 0.12));
        const distFwd = Math.hypot(targetDistrict.x - lookFwd.x, targetDistrict.y - lookFwd.y);
        const distRev = Math.hypot(targetDistrict.x - lookRev.x, targetDistrict.y - lookRev.y);
        reverse = distRev < distFwd;
      }
      const p = road.getPointAt(t);
      bestDist = c.dist;
      best = { road, t, reverse, x: p.x, y: p.y, dist: c.dist };
    }
    return best;
  }

  spawnJobVehicle(job, owner = 'player', ownerColor = null) {
    if (!job || !job.active || job.delivered >= job.amount) return null;

    // Live district refs
    const from = this.districts.find(d => d.name === job.from.name) || job.from;
    const to = this.districts.find(d => d.name === job.to.name) || job.to;

    // A1: only spawn if start has a road; prefer when destination area is also road-linked
    const spawn = this.findSpawnOnRoadNear(from, to, 200);
    if (!spawn) return null;

    const kind = job.type === 'cargo' ? 'truck' : 'car';
    const cargo = kind === 'truck' ? 1 + Math.floor(Math.random() * 2) : 1;

    const v = new Vehicle({
      x: spawn.x,
      y: spawn.y,
      targetDistrict: to,
      roads: this.roads,
      kind,
      job,
      owner,
      ownerColor,
      cargo,
      startRoad: spawn.road,
      startT: spawn.t,
      startReverse: spawn.reverse
    });
    this.vehicles.push(v);
    this.totalSpawned++;
    return v;
  }

  /**
   * F2: Assign open jobs to idle player fleet vehicles.
   * Prefers home district jobs, then nearest under-served jobs.
   */
  assignFleetJobs() {
    if (this.districts.length < 2 || this.roads.length === 0) return;

    const idle = this.getPlayerFleet().filter(v => !v.job && !v.arrived);
    if (!idle.length) return;

    const open = this.jobs.filter(j => j.active && j.delivered < j.amount);
    if (!open.length) return;

    const counts = {};
    for (const v of this.vehicles) {
      if (v.owner === 'player' && v.job) {
        counts[v.job.id] = (counts[v.job.id] || 0) + 1;
      }
    }

    for (const vehicle of idle) {
      let best = null;
      let bestScore = -Infinity;

      for (const job of open) {
        if (!vehicleCanDoJob(vehicle, job)) continue;
        const remaining = job.amount - job.delivered;
        const onRoute = counts[job.id] || 0;
        const perJobCap = Math.min(3, Math.max(1, remaining));
        if (onRoute >= perJobCap) continue;

        const from = this.districts.find(d => d.name === job.from.name) || job.from;
        const to = this.districts.find(d => d.name === job.to.name) || job.to;
        const spawn = this.findSpawnOnRoadNear(from, to, 200);
        if (!spawn) continue;

        const park = vehicle.parkName || vehicle.homeName;
        const homeBonus = park === from.name ? 80 : 0;
        const dist = Math.hypot(
          (vehicle.x || from.x) - from.x,
          (vehicle.y || from.y) - from.y
        );
        const cap = vehicle.getCargoCapacity?.() || 1;
        const cargoFit = Math.min(remaining, cap) * 14;
        // U3: match class to job shape – heavy loves big cargo, fast loves small passenger runs
        let classFit = 0;
        if (job.type === 'cargo') {
          if (vehicle.classId === 'truck_heavy') classFit = remaining >= 5 ? 55 : 20;
          else if (vehicle.classId === 'truck_std') classFit = 15;
        } else {
          if (vehicle.classId === 'car_fast') classFit = remaining <= 6 ? 50 : 18;
          else if (vehicle.classId === 'car_std') classFit = 15;
        }
        // Overkill penalty: huge capacity on tiny leftover job
        if (cap > remaining + 1) classFit -= (cap - remaining) * 8;
        const speedHint = (vehicle.baseSpeed || 60) * 0.1;
        const score =
          homeBonus + remaining * 5 + cargoFit + classFit + speedHint
          - onRoute * 25 - dist * 0.02 + Math.random();
        if (score > bestScore) {
          bestScore = score;
          best = { job, from, to, spawn };
        }
      }

      if (!best) continue;
      vehicle.assignJob(best.job, best.to, best.from, this.roads, best.spawn);
      counts[best.job.id] = (counts[best.job.id] || 0) + 1;
    }
  }

  /** @deprecated player uses fleet; bots still call spawnJobVehicle */
  spawnVehicle() {
    this.assignFleetJobs();
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

  addFloatText(x, y, text, color = '#059669') {
    this.floatTexts.push({
      x, y, text, color,
      life: 1.4,
      maxLife: 1.4,
      vy: -28
    });
  }

  completeDelivery(vehicle) {
    const job = vehicle.job;
    const units = vehicle.cargo || 1;
    let reward = 8;
    let applied = units;
    let jobJustCompleted = false;

    if (job && job.active) {
      const to = this.districts.find(d => d.name === job.to.name);
      if (to) vehicle.target = to;

      const remaining = job.amount - job.delivered;
      applied = Math.min(units, Math.max(0, remaining));
      job.delivered += applied;

      const unitReward = Math.round(job.reward / job.amount);
      reward = unitReward * applied + (jobComplete(job) ? Math.round(job.reward * 0.15) : 0);

      if (jobComplete(job)) {
        job.active = false;
        jobJustCompleted = true;
        this.showToast(`Opgave klar: ${job.from.name} → ${job.to.name}!`);
        this.addArrivalParticles(vehicle.x, vehicle.y, job.to.color);
      }
    }

    if (vehicle.owner === 'player') {
      this.money += reward;
      this.playerScore += reward;
      this.playerDelivered += applied;
      this.arrivedCount++;
      if (this.arrivedCount > this.sessionBest) this.sessionBest = this.arrivedCount;
      if (this.arrivedCount > this.allTimeBest) {
        this.allTimeBest = this.arrivedCount;
        this.saveBest(this.allTimeBest);
      }
      this.addFloatText(vehicle.x, vehicle.y - 10, `+$${reward}`, '#059669');

      // B1: XP per unit + bonus when whole job completes
      let xpGain = XP_REWARDS.perUnit * Math.max(1, applied);
      if (jobJustCompleted && job) {
        xpGain += XP_REWARDS.jobCompleteBase + job.amount * XP_REWARDS.jobCompletePerUnit;
      }
      this.grantXp(xpGain, { floatAt: { x: vehicle.x, y: vehicle.y } });

      // F1: fleet vehicles park at destination and stay
      if (vehicle.fleetOwned) {
        const parkAt = (job && this.districts.find(d => d.name === job.to.name))
          || vehicle.target
          || this.districts[0];
        vehicle.parkIdle(parkAt, this.roads);
      }
    } else {
      const bot = this.bots.find(b => b.id === vehicle.owner);
      if (bot) {
        bot.onDelivery(reward, applied);
        this.addFloatText(vehicle.x, vehicle.y - 10, `${bot.name} +$${reward}`, bot.color);
      }
    }

    this.addArrivalParticles(vehicle.x, vehicle.y, vehicle.color);
  }

  updateRoadDensities() {
    for (const road of this.roads) road.density = 0;
    for (const v of this.vehicles) {
      if (v.currentRoad) v.currentRoad.density = (v.currentRoad.density || 0) + 1;
    }
  }

  update(dt) {
    if (this.paused || !this.running) return;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast = null;
    }

    // Jobs
    this.jobTimer += dt;
    if (this.jobTimer > 6.5) {
      this.addJob();
      this.jobTimer = 0;
    }
    // Remove old completed jobs from list (keep a few for history)
    this.jobs = this.jobs.filter(j => j.active || (performance.now() - j.createdAt < 8000));

    // F2: assign jobs to idle fleet (not free spawn)
    this.assignTimer += dt;
    if (this.assignTimer > 0.85) {
      this.assignFleetJobs();
      this.assignTimer = 0;
    }

    // Bots
    if (this.botsEnabled) {
      for (const bot of this.bots) bot.update(dt);
    }

    // Stuck traffic penalty (busy player vehicles only)
    this.stuckPenaltyTimer += dt;
    if (this.stuckPenaltyTimer >= STUCK_PENALTY_INTERVAL) {
      this.stuckPenaltyTimer = 0;
      let stuckCount = 0;
      for (const v of this.vehicles) {
        if (v.owner === 'player' && v.job && v.stuck) stuckCount++;
      }
      if (stuckCount >= 3) {
        const pen = STUCK_PENALTY * Math.min(5, stuckCount - 2);
        this.money = Math.max(0, this.money - pen);
        this.showToast(`Kø-straf −$${pen}`);
      }
    }

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];

      // Job cancelled / filled while en-route
      if (v.job && !v.arrived && (v.job.active === false || v.job.delivered >= v.job.amount)) {
        if (v.fleetOwned) {
          const park = this.districts.find(d => d.name === (v.parkName || v.homeName))
            || v.target
            || this.districts[0];
          v.parkIdle(park, this.roads);
          continue;
        }
        this.vehicles.splice(i, 1);
        continue;
      }

      // Legacy non-fleet jobless: remove
      if (!v.fleetOwned && !v.job) {
        this.vehicles.splice(i, 1);
        continue;
      }

      v.update(dt, this.roads, this.vehicles);

      if (v.arrived && v.job) {
        this.completeDelivery(v);
        if (!v.fleetOwned) {
          this.vehicles.splice(i, 1);
        }
        // fleetOwned already parked inside completeDelivery
      } else if (!v.fleetOwned && v.life > 90) {
        this.vehicles.splice(i, 1);
      } else if (!v.fleetOwned && v.idleTime > 14 && v.life > 12) {
        this.vehicles.splice(i, 1);
      } else if (v.fleetOwned && v.job && v.idleTime > 18 && v.life > 15) {
        // Stuck owned vehicle: abort job and re-park at home
        const park = this.districts.find(d => d.name === (v.homeName || v.parkName))
          || this.districts[0];
        v.parkIdle(park, this.roads);
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

    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.floatTexts.splice(i, 1);
    }

    this.updateRoadDensities();
  }

  drawJobMarkers(ctx) {
    const active = this.jobs.filter(j => j.active);
    for (const job of active) {
      const from = this.districts.find(d => d.name === job.from.name) || job.from;
      const to = this.districts.find(d => d.name === job.to.name) || job.to;

      // Dashed route hint
      ctx.beginPath();
      ctx.setLineDash([6 * this.dpr, 8 * this.dpr]);
      ctx.strokeStyle = job.type === 'cargo' ? 'rgba(180, 83, 9, 0.35)' : 'rgba(37, 99, 235, 0.35)';
      ctx.lineWidth = 2 * this.dpr;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Origin badge
      const left = Math.max(0, job.amount - job.delivered);
      this.drawBadge(ctx, from.x, from.y - from.r - 14 * this.dpr, `${job.typeMeta.icon}${left}`, job.type === 'cargo' ? '#b45309' : '#2563eb');
      // Dest arrow badge
      this.drawBadge(ctx, to.x, to.y - to.r - 14 * this.dpr, '⚑', '#059669');
    }
  }

  drawBadge(ctx, x, y, text, color) {
    ctx.font = `bold ${Math.max(11, 12 * this.dpr)}px system-ui`;
    const tw = ctx.measureText(text).width;
    const pad = 6 * this.dpr;
    const h = 18 * this.dpr;
    const w = tw + pad * 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    const r = 8 * this.dpr;
    const bx = x - w / 2;
    const by = y - h / 2;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5 * this.dpr);
  }

  drawBackground(ctx, w, h) {
    // Soft meadow gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#e8f0e4');
    sky.addColorStop(0.45, '#efe8da');
    sky.addColorStop(1, '#e4dccf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Soft grass patches (world-space blobs, cheap)
    const patches = [
      [0.2, 0.3, 0.22], [0.7, 0.25, 0.18], [0.5, 0.7, 0.25],
      [0.15, 0.65, 0.16], [0.85, 0.55, 0.2], [0.4, 0.15, 0.14]
    ];
    for (const [rx, ry, rr] of patches) {
      const x = rx * w, y = ry * h, r = rr * Math.min(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(134, 180, 120, 0.14)');
      g.addColorStop(1, 'rgba(134, 180, 120, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle grid
    ctx.strokeStyle = 'rgba(60, 50, 40, 0.035)';
    ctx.lineWidth = 1;
    const step = 48 * this.dpr;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  drawDistrict(ctx, d) {
    // Outer glow
    const glow = ctx.createRadialGradient(d.x, d.y, d.r * 0.2, d.x, d.y, d.r * 2.1);
    glow.addColorStop(0, d.color + '55');
    glow.addColorStop(0.5, d.color + '22');
    glow.addColorStop(1, d.color + '00');
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Soft ground disc
    ctx.beginPath();
    ctx.arc(d.x, d.y + 3 * this.dpr, d.r * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(28, 25, 23, 0.12)';
    ctx.fill();

    // Main disc
    const disc = ctx.createRadialGradient(
      d.x - d.r * 0.25, d.y - d.r * 0.3, d.r * 0.1,
      d.x, d.y, d.r
    );
    disc.addColorStop(0, this.lightenHex(d.color, 0.25));
    disc.addColorStop(0.65, d.color);
    disc.addColorStop(1, this.darkenHex(d.color, 0.82));
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2.5 * this.dpr;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = this.darkenHex(d.color, 0.7);
    ctx.lineWidth = 2 * this.dpr;
    ctx.stroke();

    // Label plate
    ctx.font = `bold ${Math.max(11, 12.5 * this.dpr)}px system-ui`;
    const label = d.name;
    const tw = ctx.measureText(label).width;
    const padX = 8 * this.dpr;
    const padY = 5 * this.dpr;
    const bw = tw + padX * 2;
    const bh = 16 * this.dpr + padY;
    const bx = d.x - bw / 2;
    const by = d.y - bh / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    const rr = 7 * this.dpr;
    ctx.moveTo(bx + rr, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
    ctx.arcTo(bx, by + bh, bx, by, rr);
    ctx.arcTo(bx, by, bx + bw, by, rr);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,25,23,0.1)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.stroke();

    ctx.fillStyle = '#292524';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, d.x, d.y + 0.5 * this.dpr);
  }

  lightenHex(hex, amount) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const L = (c) => Math.min(255, Math.round(parseInt(c, 16) + 255 * amount));
    return `rgb(${L(m[1])},${L(m[2])},${L(m[3])})`;
  }

  darkenHex(hex, factor) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const d = (c) => Math.round(parseInt(c, 16) * factor);
    return `rgb(${d(m[1])},${d(m[2])},${d(m[3])})`;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cam = this.camera;

    // Screen-space clear (covers pan gaps)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#d6d3cd';
    ctx.fillRect(0, 0, w, h);

    // World transform
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

    this.drawBackground(ctx, w, h);

    // Roads under districts so hubs sit on top of asphalt
    for (const road of this.roads) road.draw(ctx, this.dpr);

    // Junction hubs
    const connR = 8 * this.dpr;
    const joinThresh = (this.snapDistance * this.dpr * 0.55) ** 2;
    for (let i = 0; i < this.roads.length; i++) {
      const r1 = this.roads[i];
      const ends1 = [r1.points[0], r1.points[r1.points.length - 1]];
      for (let j = i + 1; j < this.roads.length; j++) {
        const r2 = this.roads[j];
        const ends2 = [r2.points[0], r2.points[r2.points.length - 1]];
        for (const a of ends1) {
          for (const b of ends2) {
            const dx = a.x - b.x, dy = a.y - b.y;
            if (dx * dx + dy * dy < joinThresh) {
              const jx = (a.x + b.x) / 2;
              const jy = (a.y + b.y) / 2;
              ctx.beginPath();
              ctx.arc(jx, jy, connR, 0, Math.PI * 2);
              ctx.fillStyle = '#44403c';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(jx, jy, connR * 0.55, 0, Math.PI * 2);
              ctx.fillStyle = '#a8a29e';
              ctx.fill();
            }
          }
        }
      }
    }

    for (const d of this.districts) this.drawDistrict(ctx, d);

    this.drawJobMarkers(ctx);

    // Preview stroke
    if (this.mode === 'draw' && this.currentStroke && this.currentStroke.length > 1) {
      const ok = this.money >= this.pendingRoadCost;
      ctx.beginPath();
      ctx.strokeStyle = ok ? '#0f766e' : '#b91c1c';
      ctx.lineWidth = 16 * this.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.25;
      ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
      for (let i = 1; i < this.currentStroke.length; i++) {
        ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 12 * this.dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const last = this.currentStroke[this.currentStroke.length - 1];
      ctx.font = `bold ${Math.max(12, 13 * this.dpr)}px system-ui`;
      ctx.fillStyle = ok ? '#0f766e' : '#b91c1c';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3 * this.dpr;
      ctx.strokeText(`$${this.pendingRoadCost}`, last.x, last.y - 18 * this.dpr);
      ctx.fillText(`$${this.pendingRoadCost}`, last.x, last.y - 18 * this.dpr);

      // Snap glow near pointer
      for (const road of this.roads) {
        const c = road.closestPoint(last.x, last.y);
        if (c.dist < this.snapDistance * this.dpr) {
          ctx.beginPath();
          ctx.arc(c.point.x, c.point.y, 11 * this.dpr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 118, 110, 0.35)';
          ctx.fill();
          ctx.strokeStyle = '#0f766e';
          ctx.lineWidth = 2.5 * this.dpr;
          ctx.stroke();
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

    for (const f of this.floatTexts) {
      const alpha = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${Math.max(12, 14 * this.dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Screen-space UI (toast + minimap)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawMinimap(ctx, w, h);

    if (this.toast) {
      ctx.fillStyle = 'rgba(28, 25, 23, 0.85)';
      ctx.font = `bold ${Math.max(13, 15 * this.dpr)}px system-ui`;
      const tw = ctx.measureText(this.toast).width;
      const padX = 18 * this.dpr;
      const bx = w / 2 - tw / 2 - padX;
      const by = h * 0.1;
      const bw = tw + padX * 2;
      const bh = 30 * this.dpr;
      ctx.beginPath();
      const r = 12 * this.dpr;
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fafaf9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.toast, w / 2, by + bh / 2);
    }
  }

  /**
   * Compact minimap – bottom-center above stats (not bottom-left/right:
   * those cover Vest / Syd / zoom stack).
   */
  drawMinimap(ctx, w, h) {
    const mapW = 88 * this.dpr;
    const mapH = 66 * this.dpr;
    const mx = (w - mapW) / 2;
    const my = h - mapH - 48 * this.dpr;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(68,64,60,0.25)';
    ctx.lineWidth = 1.5 * this.dpr;
    const rr = 8 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(mx + rr, my);
    ctx.arcTo(mx + mapW, my, mx + mapW, my + mapH, rr);
    ctx.arcTo(mx + mapW, my + mapH, mx, my + mapH, rr);
    ctx.arcTo(mx, my + mapH, mx, my, rr);
    ctx.arcTo(mx, my, mx + mapW, my, rr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // World is full canvas coords
    const worldW = this.canvas.width || w;
    const worldH = this.canvas.height || h;
    const sx = mapW / worldW;
    const sy = mapH / worldH;

    // Roads
    ctx.lineWidth = Math.max(1, 1.2 * this.dpr);
    ctx.lineCap = 'round';
    for (const road of this.roads) {
      if (road.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = road.owner === 'player' ? '#57534e' : (road.ownerColor || '#78716c');
      ctx.moveTo(mx + road.points[0].x * sx, my + road.points[0].y * sy);
      for (let i = 1; i < road.points.length; i++) {
        ctx.lineTo(mx + road.points[i].x * sx, my + road.points[i].y * sy);
      }
      ctx.stroke();
    }

    // Districts
    for (const d of this.districts) {
      ctx.beginPath();
      ctx.fillStyle = d.color;
      ctx.arc(mx + d.x * sx, my + d.y * sy, Math.max(2.5 * this.dpr, d.r * sx * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle
    const cam = this.camera;
    const z = cam.zoom || 1;
    const viewX0 = -cam.x / z;
    const viewY0 = -cam.y / z;
    const viewW = w / z;
    const viewH = h / z;
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.strokeRect(
      mx + viewX0 * sx,
      my + viewY0 * sy,
      viewW * sx,
      viewH * sy
    );

    ctx.restore();
    this._minimapRect = { x: mx, y: my, w: mapW, h: mapH, sx, sy, worldW, worldH };
  }

  /** Click on minimap → pan camera so that world point is centered */
  handleMinimapTap(screenCssX, screenCssY) {
    const r = this._minimapRect;
    if (!r) return false;
    const x = screenCssX * this.dpr;
    const y = screenCssY * this.dpr;
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) return false;
    const wx = (x - r.x) / r.sx;
    const wy = (y - r.y) / r.sy;
    const z = this.camera.zoom || 1;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.camera.x = cw / 2 - wx * z;
    this.camera.y = ch / 2 - wy * z;
    this.requestDraw();
    return true;
  }

  /** UI helpers */
  getActiveJobs() {
    return this.jobs.filter(j => j.active).map(j => ({
      id: j.id,
      label: jobLabel(j),
      progress: j.delivered / j.amount,
      type: j.type,
      reward: j.reward,
      from: j.from.name,
      to: j.to.name
    }));
  }

  getBotStats() {
    return this.bots.map(b => ({
      id: b.id,
      name: b.name,
      color: b.color,
      money: Math.floor(b.money),
      score: b.score,
      delivered: b.delivered,
      enabled: b.enabled
    }));
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }
}
