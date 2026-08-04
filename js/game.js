import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { InputHandler } from './input.js';
import { generateJob, jobComplete, jobLabel, createJob, JOB_TYPES, setNextJobId } from './jobs.js';
import { playBuy, playDeliver, playRoad, playLevelUp, playJobDone, playError } from './audio.js';
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
  sellPriceForClass,
  fleetSlotPrice,
  canBuyFleetSlot,
  vehicleCanDoJob,
  getClass,
  upgradePrice,
  canUpgrade,
  resolveUnlockedClasses,
  applyUpgradeUnlocks,
  VEHICLE_CLASSES,
  cargoCapacity
} from './fleet.js';
import { saveMeta, setScenarioStars, getScenarioStars } from './meta.js';
import { buildPlaceDefs, placeTypeMeta } from './places.js';
import { drawWorldTerrain, drawPlaceHub } from './worlddraw.js';
import { buildWaterBodies, strokeWaterFraction } from './water.js';
import { loadGameAssets } from './assets.js';
import { buildTileMap } from './tilemap.js';
import {
  SCENARIOS,
  getScenario,
  evaluateGoals,
  goalLabel
} from './scenarios.js';
import {
  getShopItem,
  getShopCatalog,
  hasShopBuff,
  BUILDING_META
} from './shop.js';
import {
  unlockAchievement,
  achievementProgress
} from './achievements.js';
import {
  submitScore,
  getLeaderboard,
  getPlayerName,
  setPlayerName,
  formatShareLine
} from './leaderboard.js';

const START_MONEY = 1400;
const MAX_JOBS = 5;
const MAX_JOBS_RUSH = 8;
const ROAD_BASE_COST = 6;
const ROAD_COST_PER_PX = 0.024;
const STUCK_PENALTY_INTERVAL = 6;
const STUCK_PENALTY = 1;
/** Rush hour cycle (seconds of session time) */
const RUSH_CYCLE = 95;
const RUSH_DURATION = 28;
const RUSH_JOB_INTERVAL = 3.4;
const NORMAL_JOB_INTERVAL = 6.5;
/** District growth */
const GROWTH_MAX = 8;
const GROWTH_TICK = 22;

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
    this.growthTimer = 0;
    /** Session clock (seconds) for rush hour */
    this.sessionTime = 0;
    this.rushActive = false;
    this._wasRush = false;
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
    /** Live snap preview while drawing (P0-4) */
    this.activeSnap = null;
    this._snapPulse = 0;

    // Camera (canvas-pixel space)
    this.camera = { x: 0, y: 0, zoom: 1 };
    // Playable map is a finite board (not endless empty land)
    this.minZoom = 0.55;
    this.maxZoom = 2.6;
    this.worldW = 1600;
    this.worldH = 1200;
    this.mapSeed = 42;
    this.worldScale = 1.35;
    this.scenario = getScenario('intro');
    this.scenarioId = 'intro';
    this.jobsCompleted = 0;
    this.goalEval = { stars: 0, details: [] };
    this.runEnded = false;
    this._layout = null;
    this.waterBodies = [];
    this.tileMap = null;

    // Bots
    this.botsEnabled = false;
    this.bots = BOT_PRESETS.map(p => new Bot({
      ...p,
      money: 480,
      game: this,
      aggression: p.aggression || 1
    }));
    /** P3-1: day cycle + weather */
    this.timeOfDay = 0.35; // 0–1 (0 midnat, 0.25 morgen, 0.5 middag)
    this.weather = 'clear'; // clear | rain | fog
    this.weatherTimer = 0;
    this._cityHintShown = false;
    this._cityHintUntil = 0;
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
    this.districtDefs = buildPlaceDefs(this.mapSeed, this._layout);
    this.updateDistrictPositions();
  }

  updateDistrictPositions() {
    const dpr = this.dpr || 1;
    // Playable board size in canvas pixels – scales with mapScale, NOT raw screen*2
    const scale = this.worldScale || 1.15;
    const baseW = 1180 * dpr;
    const baseH = 860 * dpr;
    this.worldW = baseW * scale;
    this.worldH = baseH * scale;
    const w = this.worldW;
    const h = this.worldH;
    const minSide = Math.min(w, h);
    // Keep places inside padded map (margin so labels/roads fit)
    const mx = 0.1;
    const my = 0.11;
    const prev = this.districts;
    this.districts = this.districtDefs.map((d, i) => {
      const typeMeta = placeTypeMeta(d.type);
      const prevMatch = prev.find(p => p.name === d.name) || prev[i];
      const rx = mx + (d.rx ?? 0.5) * (1 - 2 * mx);
      const ry = my + (d.ry ?? 0.5) * (1 - 2 * my);
      const growth = Math.max(0, Math.min(GROWTH_MAX, prevMatch?.growth | 0));
      const baseR = Math.max(28 * dpr, (d.rr || 0.035) * minSide * 1.15);
      const rMul = 1 + growth * 0.045;
      return {
        id: d.id,
        x: rx * w,
        y: ry * h,
        r: baseR * rMul,
        baseR,
        growth,
        color: d.color || typeMeta.color,
        name: d.name,
        type: d.type || 'town',
        typeLabel: d.typeLabel || typeMeta.label,
        icon: d.icon || typeMeta.icon,
        spriteKey: d.spriteKey || d.type || 'town',
        passengers: (d.passengers ?? typeMeta.passengers) * (1 + growth * 0.06),
        cargo: (d.cargo ?? typeMeta.cargo) * (1 + growth * 0.06),
        demandPeople: prevMatch?.demandPeople ?? 0,
        demandCargo: prevMatch?.demandCargo ?? 0,
        deliveriesHere: prevMatch?.deliveriesHere ?? 0,
        buildings: prevMatch?.buildings
          ? { ...prevMatch.buildings }
          : { station: false, warehouse: false, depot: false }
      };
    });
    for (const job of this.jobs) {
      job.from = this.districts.find(d => d.name === job.from.name) || job.from;
      job.to = this.districts.find(d => d.name === job.to.name) || job.to;
    }
    this.waterBodies = buildWaterBodies(w, h, this.districts, this.mapSeed);
    this.tileMap = buildTileMap(w, h, this.dpr, this.districts, this.waterBodies, this.mapSeed);
  }

  /**
   * Load a campaign scenario (resets session state).
   * @param {string} scenarioId
   * @param {{ bots?: boolean }} [opts]
   */
  loadScenario(scenarioId, opts = {}) {
    const sc = getScenario(scenarioId);
    this.scenario = sc;
    this.scenarioId = sc.id;
    this.mapSeed = sc.seed;
    this.worldScale = sc.worldScale || 1.95;
    this._layout = sc.layout || null;

    this.roads = [];
    this.vehicles = [];
    this.jobs = [];
    this.particles = [];
    this.floatTexts = [];
    this.money = sc.startMoney != null ? sc.startMoney : START_MONEY;
    this.playerScore = 0;
    this.arrivedCount = 0;
    this.playerDelivered = 0;
    this.totalSpawned = 0;
    this.jobsCompleted = 0;
    this.runEnded = false;
    this.selectedDistrictName = null;
    this.currentStroke = null;
    this.pendingRoadCost = 0;
    this.jobTimer = 0;
    this.assignTimer = 0;
    this.growthTimer = 0;
    this.sessionTime = 0;
    this.rushActive = false;
    this._wasRush = false;
    this.timeOfDay = 0.32 + Math.random() * 0.15;
    this.weather = 'clear';
    this.weatherTimer = 18 + Math.random() * 25;
    this._cityHintShown = false;
    this._cityHintUntil = 0;

    this.initDistricts();
    this.botsEnabled = !!opts.bots;
    for (const b of this.bots) b.enabled = this.botsEnabled;
    if (!this.botsEnabled) {
      this.vehicles = this.vehicles.filter(v => v.owner === 'player');
    }
    return sc;
  }

  start(scenarioId = null) {
    if (scenarioId) this.loadScenario(scenarioId, { bots: this.botsEnabled });
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    loadGameAssets().then(() => this.requestDraw());
    this.startCamera();
    this.addJob();
    this.addJob();
    if ((this.districts.length || 0) >= 6) this.addJob();
    if (this.getPlayerFleet().length === 0) {
      const name = this.scenario?.name || 'kortet';
      this.showToast(`${name}: zoomet ind · Fit = hele brættet · tryk sted for bil`, 3.6);
    }
    this.refreshGoals();
    this._sessionDirty = true;
    // Første minut: hint om at trykke by (hvis ingen flåde)
    this._cityHintShown = false;
    this._cityHintUntil = 0;
    if (this.getPlayerFleet().length === 0) {
      this._cityHintUntil = 55;
      this._cityHintShown = true;
    }
    if (!this._loopStarted) {
      this._loopStarted = true;
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  /** P3-1: tid + vejr for UI */
  getAtmosphereUi() {
    const t = this.timeOfDay;
    let period = 'Nat';
    let icon = '🌙';
    if (t >= 0.22 && t < 0.35) { period = 'Morgen'; icon = '🌅'; }
    else if (t >= 0.35 && t < 0.62) { period = 'Dag'; icon = '☀️'; }
    else if (t >= 0.62 && t < 0.78) { period = 'Aften'; icon = '🌇'; }
    const w = this.weather || 'clear';
    const wMeta = {
      clear: { icon: '🌤️', label: 'Klart' },
      rain: { icon: '🌧️', label: 'Regn' },
      fog: { icon: '🌫️', label: 'Tåge' }
    }[w] || { icon: '🌤️', label: 'Klart' };
    return {
      period,
      periodIcon: icon,
      weather: w,
      weatherIcon: wMeta.icon,
      weatherLabel: wMeta.label,
      label: `${icon} ${period} · ${wMeta.icon} ${wMeta.label}`,
      short: `${wMeta.icon} ${period}`,
      speedMul: w === 'rain' ? 0.82 : w === 'fog' ? 0.9 : 1,
      timeOfDay: t
    };
  }

  tickAtmosphere(dt) {
    // Fuld dag ~ 4 min session-tid
    this.timeOfDay = (this.timeOfDay + dt / 240) % 1;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const roll = Math.random();
      const prev = this.weather;
      if (roll < 0.55) this.weather = 'clear';
      else if (roll < 0.82) this.weather = 'rain';
      else this.weather = 'fog';
      this.weatherTimer = 22 + Math.random() * 40;
      if (this.weather !== prev && this.running) {
        const a = this.getAtmosphereUi();
        if (this.weather !== 'clear') {
          this.showToast(`${a.weatherIcon} ${a.weatherLabel} – biler kører lidt langsommere`, 2.4);
        } else {
          this.showToast(`${a.periodIcon} Vejret letter`, 1.8);
        }
      }
    }
    if (this._cityHintUntil > 0) {
      this._cityHintUntil -= dt;
      if (this.getPlayerFleet().length > 0) this._cityHintUntil = 0;
    }
  }

  shouldShowCityHint() {
    return this.running && this._cityHintUntil > 0 && this.getPlayerFleet().length === 0;
  }

  /**
   * Genindlæs gemt session (veje, penge, jobs, flåde).
   * @param {object} data from session.js loadSessionRaw
   * @returns {boolean}
   */
  restoreSession(data) {
    if (!data?.scenarioId) return false;
    this.loadScenario(data.scenarioId, { bots: !!data.botsEnabled });

    this.money = data.money != null ? data.money : this.money;
    this.playerScore = data.playerScore | 0;
    this.arrivedCount = data.arrivedCount | 0;
    this.playerDelivered = data.playerDelivered | 0;
    this.jobsCompleted = data.jobsCompleted | 0;
    this.sessionTime = data.sessionTime || 0;
    this.rushActive = false;
    this._wasRush = false;
    // Apply saved district growth before vehicles/jobs
    if (Array.isArray(data.growth)) {
      for (const g of data.growth) {
        const d = this.districts.find(x => x.name === g.name);
        if (!d) continue;
        d.growth = Math.max(0, Math.min(GROWTH_MAX, g.growth | 0));
        d.deliveriesHere = g.deliveriesHere | 0;
        if (g.buildings) {
          d.buildings = {
            station: !!g.buildings.station,
            warehouse: !!g.buildings.warehouse,
            depot: !!g.buildings.depot
          };
        }
        const baseR = d.baseR || d.r;
        d.baseR = baseR;
        d.r = baseR * (1 + d.growth * 0.045);
        this.applyBuildingBuffs(d);
      }
    }

    // Roads
    this.roads = [];
    for (const r of data.roads || []) {
      if (!r.points || r.points.length < 2) continue;
      const road = new Road(r.points.map(p => ({ x: p.x, y: p.y })), {
        owner: r.owner || 'player',
        lanes: r.lanes != null ? r.lanes : 2,
        isBridge: !!r.isBridge,
        paidCost: r.paidCost || 0,
        oneWay: r.oneWay === -1 || r.oneWay === 1 ? r.oneWay : 0,
        hasLight: !!r.hasLight
      });
      if (r.id) road.id = r.id;
      this.roads.push(road);
    }

    // Jobs (re-link districts by name)
    this.jobs = [];
    let maxJobId = 0;
    for (const j of data.jobs || []) {
      const from = this.districts.find(d => d.name === j.fromName);
      const to = this.districts.find(d => d.name === j.toName);
      if (!from || !to) continue;
      const typeKey = j.type && JOB_TYPES[j.type] ? j.type : 'passengers';
      const job = createJob(from, to, typeKey, Math.max(1, j.amount | 0));
      if (j.id != null) job.id = j.id;
      job.delivered = Math.max(0, Math.min(job.amount, j.delivered | 0));
      job.reward = j.reward != null ? j.reward : job.reward;
      job.active = job.delivered < job.amount;
      if (!job.active) continue;
      this.jobs.push(job);
      maxJobId = Math.max(maxJobId, job.id | 0);
    }
    setNextJobId(maxJobId + 1);

    // Fleet
    this.vehicles = this.vehicles.filter(v => v.owner !== 'player');
    for (const f of data.fleet || []) {
      const home = this.districts.find(d => d.name === f.homeName) || this.districts[0];
      if (!home) continue;
      const classId = f.classId || 'car_std';
      const cls = getClass(classId);
      const rank = f.upgradeRank | 0;
      const v = new Vehicle({
        id: f.id || undefined,
        x: f.x != null ? f.x : home.x,
        y: f.y != null ? f.y : home.y,
        targetDistrict: home,
        roads: this.roads,
        kind: cls.kind,
        classId,
        upgradeRank: rank,
        job: null,
        owner: 'player',
        cargo: cargoCapacity(classId, rank),
        fleetOwned: true,
        homeName: home.name
      });
      v.parkIdle(home, this.roads);
      this.vehicles.push(v);
    }

    if (data.camera && typeof data.camera.zoom === 'number') {
      this.camera.x = data.camera.x || 0;
      this.camera.y = data.camera.y || 0;
      this.camera.zoom = this.clampZoom(data.camera.zoom);
    } else {
      this.startCamera();
    }

    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    this.refreshGoals();
    this.assignFleetJobs();
    this.showToast('Fortsætter gemt spil…', 2.2);
    this._sessionDirty = false;
    loadGameAssets().then(() => this.requestDraw());
    if (!this._loopStarted) {
      this._loopStarted = true;
      requestAnimationFrame((t) => this.loop(t));
    }
    return true;
  }

  allPlacesHaveRoad() {
    if (!this.districts.length) return false;
    for (const d of this.districts) {
      const near = this.findNearestRoadPoint(d.x, d.y, d.r + 95);
      if (!near) return false;
    }
    return true;
  }

  refreshGoals() {
    this.goalEval = evaluateGoals(this.scenario, {
      delivered: this.playerDelivered,
      money: this.money,
      jobsCompleted: this.jobsCompleted,
      allConnected: this.allPlacesHaveRoad()
    });
    return this.goalEval;
  }

  getGoalsUi() {
    this.refreshGoals();
    const evaled = this.goalEval;
    return {
      scenarioName: this.scenario?.name || '',
      freeplay: !!this.scenario?.freeplay || !(this.scenario?.goals?.length),
      stars: evaled.stars || 0,
      bestStars: getScenarioStars(this.meta, this.scenarioId),
      details: (evaled.details || []).map(d => ({
        label: goalLabel(d.goal),
        done: d.done,
        progress: d.progress,
        stars: d.goal.stars || 1
      }))
    };
  }

  /** Persist stars + optional end-of-run */
  tryCompleteScenario(force = false) {
    if (this.scenario?.freeplay || !this.scenario?.goals?.length) return null;
    this.refreshGoals();
    const stars = this.goalEval.stars || 0;
    if (stars < 1 && !force) return null;
    const improved = setScenarioStars(this.meta, this.scenarioId, stars);
    // XP only when star-record improves
    if (improved) {
      this.grantXp(12 + stars * 18, { silent: false });
      this.showToast(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} gemt!`, 2.8);
      if (stars >= 1) this.tryAchievement('star_1');
    }
    // Leaderboard: submit when stars improve or force end
    let lb = null;
    if (improved || force || stars >= 3) {
      lb = this.submitLeaderboardScore(stars);
    }
    if (stars >= 3) this.runEnded = true;
    if (force) this.runEnded = true;
    return { stars, improved, freeplay: false, leaderboard: lb };
  }

  /**
   * P3-3: gem run på lokal topscore.
   * @param {number} [stars]
   */
  submitLeaderboardScore(stars = null) {
    const s = stars != null ? stars : (this.goalEval?.stars || 0);
    const result = submitScore({
      name: getPlayerName(),
      scenarioId: this.scenarioId || 'freeplay',
      scenarioName: this.scenario?.name || this.scenarioId || 'Bane',
      score: this.playerScore | 0,
      delivered: this.playerDelivered | 0,
      stars: s,
      money: Math.floor(this.money),
      jobsCompleted: this.jobsCompleted | 0
    });
    if (result.rank > 0 && result.rank <= 5) {
      this.showToast(`🏅 Topscore #${result.rank} på ${result.entry.scenarioName}`, 2.6);
    }
    return result;
  }

  getLeaderboardUi(scenarioOnly = false) {
    const sid = scenarioOnly ? this.scenarioId : null;
    return {
      playerName: getPlayerName(),
      scenarioId: this.scenarioId,
      scenarioName: this.scenario?.name || '',
      global: getLeaderboard(null),
      scenario: getLeaderboard(this.scenarioId),
      list: getLeaderboard(sid)
    };
  }

  setPlayerDisplayName(name) {
    return setPlayerName(name);
  }

  getShareScoreLine() {
    const top = getLeaderboard(this.scenarioId)[0];
    if (top) return formatShareLine(top);
    return formatShareLine({
      name: getPlayerName(),
      scenarioName: this.scenario?.name || 'Bane',
      stars: this.goalEval?.stars || 0,
      score: this.playerScore | 0,
      delivered: this.playerDelivered | 0
    });
  }

  /** Center camera on a place (minimap / “gå til by”) */
  focusOnDistrict(district, zoomBoost = false) {
    if (!district) return false;
    const z = zoomBoost
      ? this.clampZoom(Math.max(this.camera.zoom || 1, 1.15))
      : (this.camera.zoom || 1);
    this.camera.zoom = z;
    const cw = this.canvas.width || 1;
    const ch = this.canvas.height || 1;
    this.camera.x = cw / 2 - district.x * z;
    this.camera.y = ch / 2 - district.y * z;
    this.requestDraw();
    return true;
  }

  listScenariosForUi() {
    const level = this.meta?.level || 1;
    return SCENARIOS.map(s => ({
      id: s.id,
      name: s.name,
      blurb: s.blurb,
      unlockLevel: s.unlockLevel || 1,
      locked: level < (s.unlockLevel || 1),
      stars: getScenarioStars(this.meta, s.id),
      freeplay: !!s.freeplay
    }));
  }

  getPlayerFleet() {
    return this.vehicles.filter(v => v.owner === 'player' && v.fleetOwned);
  }

  getExtraFleetSlots() {
    return Math.max(0, this.meta?.extraFleetSlots | 0);
  }

  getFleetCap() {
    return fleetCap(this.meta?.level || 1, this.getExtraFleetSlots());
  }

  getFleetStats() {
    const fleet = this.getPlayerFleet();
    const idle = fleet.filter(v => !v.job).length;
    const cap = this.getFleetCap();
    const extra = this.getExtraFleetSlots();
    return {
      owned: fleet.length,
      cap,
      idle,
      busy: fleet.length - idle,
      cars: fleet.filter(v => v.kind === 'car').length,
      trucks: fleet.filter(v => v.kind === 'truck').length,
      extraSlots: extra,
      canBuySlot: canBuyFleetSlot(this.meta?.level || 1, extra),
      slotPrice: fleetSlotPrice(extra),
      rush: !!this.rushActive
    };
  }

  /** F3: buy +1 fleet slot with $ */
  buyFleetSlot() {
    if (!this.running) return { ok: false, reason: 'not_running' };
    const extra = this.getExtraFleetSlots();
    if (!canBuyFleetSlot(this.meta?.level || 1, extra)) {
      this.showToast('Max flåde-slots nået');
      return { ok: false, reason: 'max' };
    }
    const price = fleetSlotPrice(extra);
    if (this.money < price) {
      this.showToast(`Ikke råd til slot (mangler $${price - Math.floor(this.money)})`);
      playError();
      return { ok: false, reason: 'money' };
    }
    this.money -= price;
    this.meta.extraFleetSlots = extra + 1;
    saveMeta(this.meta);
    const cap = this.getFleetCap();
    this.showToast(`+1 flåde-slot · nu ${cap} pladser (−$${price})`);
    playBuy();
    this._sessionDirty = true;
    return { ok: true, price, cap };
  }

  /**
   * F3: sell idle fleet vehicle for partial refund.
   */
  sellVehicle(vehicleId) {
    const v = this.getPlayerFleet().find(x => x.id === vehicleId);
    if (!v) return { ok: false, reason: 'not_found' };
    if (v.job) {
      this.showToast('Kan ikke sælge bil midt i et job');
      playError();
      return { ok: false, reason: 'busy' };
    }
    const refund = sellPriceForClass(v.classId, v.upgradeRank || 0);
    this.money += refund;
    const cls = getClass(v.classId);
    const idx = this.vehicles.indexOf(v);
    if (idx >= 0) this.vehicles.splice(idx, 1);
    this.addFloatText(v.x, v.y - 10, `+$${refund}`, '#15803d');
    this.showToast(`Solgt ${cls.icon} ${cls.short} · +$${refund}`);
    playBuy();
    this.tryAchievement('sell_car');
    this._sessionDirty = true;
    return { ok: true, refund };
  }

  isRushHour() {
    return !!this.rushActive;
  }

  /** Phase within rush cycle 0..1 */
  getRushPhase() {
    const t = this.sessionTime % RUSH_CYCLE;
    return {
      inRush: t < RUSH_DURATION,
      tInCycle: t,
      remaining: t < RUSH_DURATION ? RUSH_DURATION - t : RUSH_CYCLE - t
    };
  }

  hitDistrict(screenX, screenY) {
    const w = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestD = Infinity;
    for (const d of this.districts) {
      const dist = Math.hypot(d.x - w.x, d.y - w.y);
      // Outer ring – road connection / presence
      if (dist <= d.r * 1.4 && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /**
   * Hub-tap for bil-shop. Matcher den synlige sprite (større end gammel 0.52·r
   * og lidt forskudt opad, som drawPlaceHub).
   */
  hitDistrictCore(screenX, screenY) {
    const w = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestD = Infinity;
    for (const d of this.districts) {
      // Sprite: size ≈ 2.45·r, tegnet med y-offset ~0.34·r opad
      const cx = d.x;
      const cy = d.y - d.r * 0.28;
      const hitR = d.r * 1.05;
      const dist = Math.hypot(cx - w.x, cy - w.y);
      if (dist <= hitR && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /** Keep world point on the playable board */
  clampToWorld(p) {
    const m = 10 * (this.dpr || 1);
    const maxX = (this.worldW || 1) - m;
    const maxY = (this.worldH || 1) - m;
    return {
      x: Math.max(m, Math.min(maxX, p.x)),
      y: Math.max(m, Math.min(maxY, p.y))
    };
  }

  isOnBoard(p) {
    const m = 4 * (this.dpr || 1);
    return p.x >= m && p.y >= m && p.x <= (this.worldW || 0) - m && p.y <= (this.worldH || 0) - m;
  }

  openDistrictSheet(district) {
    if (!district || !this.running) return;
    this.selectedDistrictName = district.name;
    // Hook til UI (main.js) – undgå at vente på setInterval
    try {
      window.dispatchEvent(new CustomEvent('flowtown:district-sheet'));
    } catch (_) { /* ignore */ }
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
      const extra = this.getExtraFleetSlots();
      if (canBuyFleetSlot(this.meta?.level || 1, extra)) {
        const sp = fleetSlotPrice(extra);
        this.showToast(`Flåde fuld (${fleet.length}/${cap}) – køb slot for $${sp}`);
      } else {
        this.showToast(`Flåde fuld (${fleet.length}/${cap}) – stig i level`);
      }
      return { ok: false, reason: 'cap' };
    }

    const price = buyPriceForClass(classId, fleet.length);
    if (this.money < price) {
      this.showToast(`Ikke råd (mangler $${price - Math.floor(this.money)})`);
      playError();
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
    playBuy();
    this.tryAchievement('first_car');
    if (this.getPlayerFleet().length >= 5) this.tryAchievement('fleet_5');
    if (this.money >= 1500) this.tryAchievement('money_500');
    this._cityHintUntil = 0;
    this.assignFleetJobs();
    this._sessionDirty = true;
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

  /**
   * P2-4: unlock achievement once; toast + small XP.
   * @returns {boolean} newly unlocked
   */
  tryAchievement(id) {
    const def = unlockAchievement(this.meta, id);
    if (!def) return false;
    saveMeta(this.meta);
    if (def.xp) this.grantXp(def.xp, { silent: true });
    this.showToast(`${def.icon} Achievement: ${def.title}`, 2.8);
    return true;
  }

  getAchievementsUi() {
    return achievementProgress(this.meta);
  }

  /** P2-1: cycle one-way on tapped road */
  setOneWayNear(screenX, screenY) {
    const hit = this._hitPlayerRoad(screenX, screenY);
    if (!hit) {
      this.showToast('Tryk på din vej for envejs');
      return false;
    }
    const road = hit.road;
    const cost = 22;
    // free to clear one-way
    const next = road.oneWay === 0 ? 1 : road.oneWay === 1 ? -1 : 0;
    if (next !== 0 && this.money < cost) {
      this.showToast(`Ikke råd (mangler $${cost - Math.floor(this.money)})`);
      playError();
      return false;
    }
    if (next !== 0) {
      this.money -= cost;
      this.addFloatText(hit.point.x, hit.point.y - 12, `Envejs −$${cost}`, '#2563eb');
    } else {
      this.addFloatText(hit.point.x, hit.point.y - 12, 'Tovejs', '#57534e');
    }
    road.oneWay = next;
    const msg = next === 0 ? 'Tovejs igen' : next === 1 ? 'Envejs →' : 'Envejs ←';
    this.showToast(msg);
    playRoad();
    if (next !== 0) this.tryAchievement('oneway');
    this._sessionDirty = true;
    this.requestDraw();
    return true;
  }

  /** P2-1: toggle traffic light on road */
  toggleLightNear(screenX, screenY) {
    const hit = this._hitPlayerRoad(screenX, screenY);
    if (!hit) {
      this.showToast('Tryk på din vej for trafiklys');
      return false;
    }
    const road = hit.road;
    if (road.hasLight) {
      road.hasLight = false;
      road.lightPhase = 0;
      this.addFloatText(hit.point.x, hit.point.y - 12, 'Lys fjernet', '#57534e');
      this.showToast('Trafiklys fjernet');
    } else {
      const cost = 38;
      if (this.money < cost) {
        this.showToast(`Ikke råd (mangler $${cost - Math.floor(this.money)})`);
        playError();
        return false;
      }
      this.money -= cost;
      road.hasLight = true;
      road.lightPhase = 0;
      this.addFloatText(hit.point.x, hit.point.y - 12, `🚦 −$${cost}`, '#16a34a');
      this.showToast('Trafiklys sat');
      this.tryAchievement('traffic_light');
    }
    playRoad();
    this._sessionDirty = true;
    this.requestDraw();
    return true;
  }

  _hitPlayerRoad(screenX, screenY, maxDistCss = 48) {
    const p = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestDist = maxDistCss * this.dpr;
    for (const road of this.roads) {
      if (road.owner !== 'player') continue;
      const c = road.closestPoint(p.x, p.y);
      if (c.dist < bestDist) {
        bestDist = c.dist;
        best = { road, point: c.point, t: c.t };
      }
    }
    return best;
  }

  /** Update traffic light phases (global cycle with per-road offset) */
  tickTrafficLights() {
    const t = this.sessionTime || 0;
    // 10s cycle: green 6, yellow 1.2, red 2.8
    for (const road of this.roads) {
      if (!road.hasLight) continue;
      let h = 0;
      for (let i = 0; i < (road.id || '').length; i++) h = (h + road.id.charCodeAt(i) * 17) % 97;
      const phaseT = (t + h * 0.11) % 10;
      if (phaseT < 6) road.lightPhase = 0;
      else if (phaseT < 7.2) road.lightPhase = 1;
      else road.lightPhase = 2;
    }
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

  /**
   * Pan camera by CSS-pixel delta (positive dx = view moves right content left).
   */
  panBy(cssDx, cssDy) {
    const dpr = this.dpr || 1;
    this.camera.x += cssDx * dpr;
    this.camera.y += cssDy * dpr;
    this.requestDraw();
  }

  /** Nudge map with edge arrows (world-ish step) */
  panNudge(dir) {
    const step = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.18;
    if (dir === 'left') this.panBy(step, 0);
    else if (dir === 'right') this.panBy(-step, 0);
    else if (dir === 'up') this.panBy(0, step);
    else if (dir === 'down') this.panBy(0, -step);
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
  /** Fit entire playable board (Fit-knap) */
  fitCamera(paddingCss = 40) {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const bw = Math.max(40, this.worldW || 1);
    const bh = Math.max(40, this.worldH || 1);
    const pad = paddingCss * this.dpr;
    const zx = (w - pad * 2) / bw;
    const zy = (h - pad * 2) / bh;
    const z = this.clampZoom(Math.min(zx, zy));
    const cx = bw / 2;
    const cy = bh / 2;
    this.camera.zoom = z;
    this.camera.x = w / 2 - cx * z;
    this.camera.y = h / 2 - cy * z;
    this.requestDraw();
  }

  /**
   * Start closer: ~50–60% of the board visible, centered on capital/mid.
   * (Ikke “se alt det tomme land”.)
   */
  startCamera() {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const focus =
      this.districts.find(d => d.type === 'capital') ||
      this.districts[Math.floor(this.districts.length / 2)] ||
      { x: this.worldW / 2, y: this.worldH / 2 };

    // Want to see roughly half the map width
    const viewWorldW = Math.max(200, this.worldW * 0.52);
    const z = this.clampZoom(w / viewWorldW);
    this.camera.zoom = z;
    this.camera.x = w / 2 - focus.x * z;
    this.camera.y = h / 2 - focus.y * z;
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

  getSnapDistance() {
    let base = this.snapDistance;
    if (hasShopBuff(this.meta, 'snap_boost')) base *= 1.45;
    return base;
  }

  roadCostMul() {
    return hasShopBuff(this.meta, 'roads_cheap') ? 0.85 : 1;
  }

  roadCostForLength(lenCssPx) {
    // len may be in canvas (dpr) units — normalize roughly
    const len = lenCssPx / Math.max(1, this.dpr);
    const raw = Math.max(12, Math.round(ROAD_BASE_COST + len * ROAD_COST_PER_PX * 20));
    return Math.max(10, Math.round(raw * this.roadCostMul()));
  }

  estimateStrokeCost(points, { bridge = false } = {}) {
    if (!points || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    let cost = this.roadCostForLength(len);
    const waterFrac = strokeWaterFraction(points, this.waterBodies);
    if (bridge || waterFrac > 0.05) {
      // Broer er dyre – især over meget vand (lidt mildere end før)
      cost = Math.round(cost * (1.85 + waterFrac * 2.0) * this.roadCostMul());
      cost = Math.max(cost, Math.round(42 * this.roadCostMul()));
    }
    return cost;
  }

  /** PROG-B2 shop catalog for UI */
  getShopUi() {
    const d = this.getSelectedDistrict();
    return getShopCatalog(
      { level: this.meta?.level || 1, money: this.money, shopOwned: this.meta?.shopOwned || {} },
      {
        hasDistrict: !!d,
        districtBuildings: d?.buildings || null
      }
    );
  }

  /**
   * Buy shop item. Buildings need an open/selected district (or pass district).
   * @param {string} itemId
   * @param {object|null} [district]
   */
  buyShopItem(itemId, district = null) {
    if (!this.running) return { ok: false, reason: 'not_running' };
    const item = getShopItem(itemId);
    if (!item) return { ok: false, reason: 'unknown' };
    const level = this.meta?.level || 1;
    if (level < (item.unlockLevel || 1)) {
      this.showToast(`Kræver level ${item.unlockLevel}`);
      playError();
      return { ok: false, reason: 'level' };
    }
    if (!this.meta.shopOwned) this.meta.shopOwned = {};
    if (item.once && this.meta.shopOwned[item.id]) {
      this.showToast('Allerede købt');
      return { ok: false, reason: 'owned' };
    }
    if (this.money < item.price) {
      this.showToast(`Ikke råd (mangler $${item.price - Math.floor(this.money)})`);
      playError();
      return { ok: false, reason: 'money' };
    }

    if (item.kind === 'building') {
      const d = district || this.getSelectedDistrict();
      if (!d) {
        this.showToast('Tryk en by først – så køb bygning');
        playError();
        return { ok: false, reason: 'no_district' };
      }
      if (!d.buildings) d.buildings = { station: false, warehouse: false, depot: false };
      if (d.buildings[item.building]) {
        this.showToast(`${BUILDING_META[item.building]?.label || 'Bygning'} findes allerede i ${d.name}`);
        return { ok: false, reason: 'has_building' };
      }
      this.money -= item.price;
      d.buildings[item.building] = true;
      this.applyBuildingBuffs(d);
      this.addFloatText(d.x, d.y - d.r, `${item.icon} ${item.label}`, BUILDING_META[item.building]?.color || '#0f766e');
      this.showToast(`${item.icon} ${item.label} i ${d.name} (−$${item.price})`);
      playBuy();
      this.tryAchievement('builder');
      this._sessionDirty = true;
      this.requestDraw();
      return { ok: true, building: item.building, district: d };
    }

    // Buff
    this.money -= item.price;
    this.meta.shopOwned[item.id] = true;
    saveMeta(this.meta);
    this.showToast(`${item.icon} ${item.label} aktiv (−$${item.price})`);
    playBuy();
    this._sessionDirty = true;
    return { ok: true, buff: item.id };
  }

  applyBuildingBuffs(d) {
    if (!d) return;
    const typeMeta = placeTypeMeta(d.type);
    const g = d.growth | 0;
    let pMul = 1 + g * 0.06;
    let cMul = 1 + g * 0.06;
    if (d.buildings?.station) pMul += 0.28;
    if (d.buildings?.warehouse) cMul += 0.28;
    if (d.buildings?.depot) {
      pMul += 0.08;
      cMul += 0.08;
    }
    d.passengers = (typeMeta.passengers || 1) * pMul;
    d.cargo = (typeMeta.cargo || 1) * cMul;
  }

  showToast(msg, ms = 2.2) {
    this.toast = msg;
    this.toastTimer = ms;
  }

  beginStroke(x, y) {
    if (this.mode === 'pan') return;
    if (this.mode === 'erase') {
      this.eraseNear(x, y);
      return;
    }
    if (this.mode === 'upgrade') {
      this.upgradeRoadNear(x, y);
      return;
    }
    if (this.mode === 'oneway') {
      this.setOneWayNear(x, y);
      return;
    }
    if (this.mode === 'light') {
      this.toggleLightNear(x, y);
      return;
    }
    const p = this.clampToWorld(this.screenToWorld(x, y));
    if (!this.isOnBoard(p)) {
      this.currentStroke = null;
      this.clearActiveSnap();
      return;
    }
    const snapped = this.findSnapPoint(p.x, p.y);
    const start = this.clampToWorld(snapped);
    this.currentStroke = [{ x: start.x, y: start.y }];
    this.pendingRoadCost = 0;
    this.updateActiveSnap(p.x, p.y);
  }

  /**
   * Start a road from a district hub edge toward the pointer (easy connect).
   */
  beginStrokeFromDistrict(district, screenX, screenY) {
    if (!district || this.mode === 'pan' || this.mode === 'erase' || this.mode === 'upgrade'
      || this.mode === 'oneway' || this.mode === 'light') return;
    const aim = this.clampToWorld(this.screenToWorld(screenX, screenY));
    const ang = Math.atan2(aim.y - district.y, aim.x - district.x);
    const edge = {
      x: district.x + Math.cos(ang) * district.r * 0.92,
      y: district.y + Math.sin(ang) * district.r * 0.92
    };
    const start = this.clampToWorld(this.findSnapPoint(edge.x, edge.y));
    this.currentStroke = [{ x: start.x, y: start.y }];
    // Second point toward finger so stroke is valid quickly
    const mid = this.clampToWorld({
      x: start.x + Math.cos(ang) * 20 * this.dpr,
      y: start.y + Math.sin(ang) * 20 * this.dpr
    });
    this.currentStroke.push(mid);
    this.pendingRoadCost = this.estimateStrokeCost(this.currentStroke, {
      bridge: this.mode === 'bridge'
    });
    this.activeSnap = {
      x: start.x,
      y: start.y,
      kind: 'city',
      label: district.name,
      fromX: mid.x,
      fromY: mid.y,
      strength: 1
    };
  }

  continueStroke(x, y) {
    if (this.mode === 'erase' || this.mode === 'upgrade' || this.mode === 'oneway'
      || this.mode === 'light' || !this.currentStroke) return;
    const raw = this.screenToWorld(x, y);
    // Stop extending far outside board
    if (!this.isOnBoard(raw) && !this.isOnBoard(this.clampToWorld(raw))) {
      return;
    }
    const p = this.clampToWorld(raw);
    const last = this.currentStroke[this.currentStroke.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy > 12) {
      // Soft hex-snap away from strong road/city snap (easier neat roads)
      let pt = { x: p.x, y: p.y };
      const nearCity = this.districts.some(d => Math.hypot(d.x - p.x, d.y - p.y) < d.r * 1.6);
      if (!nearCity) pt = this.snapToHex(p.x, p.y, 0.38);
      pt = this.clampToWorld(pt);
      this.currentStroke.push(pt);
      const isBridge = this.mode === 'bridge';
      this.pendingRoadCost = this.estimateStrokeCost(this.currentStroke, { bridge: isBridge });
    }
    this.updateActiveSnap(p.x, p.y);
  }

  endStroke() {
    if (this.mode === 'erase' || this.mode === 'upgrade' || this.mode === 'oneway'
      || this.mode === 'light' || !this.currentStroke || this.currentStroke.length < 2) {
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      return;
    }

    let points = this.simplify(this.currentStroke, 9);
    points = points.map(p => this.clampToWorld(p));
    if (points.length < 2) {
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      return;
    }

    // Drop points that somehow left the board
    points = points.filter(p => this.isOnBoard(p));
    if (points.length < 2) {
      this.showToast('Kun på land – tegn inden for kortet');
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      return;
    }

    points = this.snapEndpoints(points);
    points = points.map(p => this.clampToWorld(p));
    const waterFrac = strokeWaterFraction(points, this.waterBodies);
    const wantBridge = this.mode === 'bridge';
    const crossesWater = waterFrac > 0.08;

    if (crossesWater && !wantBridge) {
      this.showToast('Over vand: brug Bro-værktøjet');
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      const mid = points[Math.floor(points.length / 2)];
      this.addArrivalParticles(mid.x, mid.y, '#0ea5e9');
      return;
    }

    // Bridge without water is just an expensive road (ok) or soft warn
    const isBridge = wantBridge || crossesWater;
    const cost = this.estimateStrokeCost(points, { bridge: isBridge });

    if (this.money < cost) {
      this.showToast(`Ikke råd (mangler $${cost - this.money})`);
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      const end = points[points.length - 1];
      this.addArrivalParticles(end.x, end.y, '#ef4444');
      return;
    }

    this.addRoadForOwner(points, 'player', null, cost, true, { isBridge });
    if (isBridge) this.showToast(crossesWater ? 'Bro bygget!' : 'Bro-segment (dyrt)');
    playRoad();
    this.tryAchievement('first_road');
    this._sessionDirty = true;
    this.currentStroke = null;
    this.pendingRoadCost = 0;
    this.clearActiveSnap();
  }

  /**
   * Shared road placement for player + bots.
   * @returns {boolean} success
   */
  addRoadForOwner(points, owner, ownerColor, cost, chargePlayer, opts = {}) {
    if (!points || points.length < 2) return false;
    const paid = Math.max(0, Math.round(cost || 0));
    if (chargePlayer) {
      if (this.money < paid) return false;
      this.money -= paid;
      this.addFloatText(
        points[Math.floor(points.length / 2)].x,
        points[Math.floor(points.length / 2)].y,
        `−$${paid}`,
        opts.isBridge ? '#0369a1' : '#b91c1c'
      );
    }
    this.roads.push(new Road(points, {
      owner,
      ownerColor,
      lanes: opts.lanes != null ? opts.lanes : 2, // tovejs som standard
      isBridge: !!opts.isBridge,
      paidCost: paid
    }));
    if (owner === 'player') {
      this.checkFirstLinks();
      this.refreshGoals();
      if (this.allPlacesHaveRoad()) this.tryAchievement('connect_all');
    }
    return true;
  }

  /** Cost to upgrade a road segment to 2-spor */
  upgradeRoadCost(road) {
    if (!road) return 0;
    const base = 28;
    const per = 0.038;
    return Math.max(35, Math.floor(base + road.length * per));
  }

  /**
   * B3: Tap road in upgrade mode → 2-spor for $.
   */
  upgradeRoadNear(screenX, screenY) {
    const p = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestDist = 48 * this.dpr;

    for (const road of this.roads) {
      if (road.owner !== 'player') continue;
      const c = road.closestPoint(p.x, p.y);
      if (c.dist < bestDist) {
        bestDist = c.dist;
        best = { road, point: c.point };
      }
    }

    if (!best) {
      this.showToast('Tryk på din egen vej for 2-spor');
      return false;
    }

    const road = best.road;
    if (road.lanes >= 3) {
      this.showToast('Allerede motorvej');
      return false;
    }

    const cost = this.upgradeRoadCost(road);
    if (this.money < cost) {
      this.showToast(`Ikke råd (mangler $${cost - Math.floor(this.money)})`);
      this.addArrivalParticles(best.point.x, best.point.y, '#ef4444');
      return false;
    }

    this.money -= cost;
    // Veje er allerede tovejs (2) – opgrader til motorvej (3)
    road.lanes = 3;
    road.paidCost = (road.paidCost || 0) + cost;
    this.addFloatText(best.point.x, best.point.y - 12, `Motorvej −$${cost}`, '#0f766e');
    this.addArrivalParticles(best.point.x, best.point.y, '#10b981');
    this.showToast(`Opgraderet til motorvej ($${cost})`);
    this.requestDraw();
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
      playLevelUp();
      if (result.level >= 3) this.tryAchievement('level_3');
    } else if (opts.toast) {
      this.showToast(opts.toast, 2.0);
    }
    return result;
  }

  getMetaProgress() {
    return levelProgress(this.meta);
  }

  /**
   * Find snap target. Returns { x, y, kind, label, strength }.
   * kind: 'free' | 'road' | 'endpoint' | 'city'
   */
  findSnapPoint(x, y) {
    const snap = this.getSnapDistance() * this.dpr;
    let best = { x, y, kind: 'free', label: null, strength: 0 };
    let bestD = snap * snap;

    // Snap to any point along existing roads (segment-accurate)
    for (const road of this.roads) {
      const c = road.closestPoint(x, y);
      const d = c.dist * c.dist;
      if (d < bestD) {
        bestD = d;
        best = { x: c.point.x, y: c.point.y, kind: 'road', label: 'Vej', strength: 1 - Math.sqrt(d) / snap };
      }
      // Prefer endpoints slightly for clean junctions
      for (const p of [road.points[0], road.points[road.points.length - 1]]) {
        const de = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (de < bestD * 0.85) {
          bestD = de;
          best = {
            x: p.x,
            y: p.y,
            kind: 'endpoint',
            label: 'Kryds',
            strength: 1 - Math.sqrt(de) / snap
          };
        }
      }
    }
    // Snap hard to district hub (easy connect) – prefer city over road
    for (const d of this.districts) {
      const dist = Math.hypot(d.x - x, d.y - y);
      const magnet = d.r + snap * 1.15;
      if (dist < magnet) {
        const ang = Math.atan2(y - d.y, x - d.x);
        const edge = {
          x: d.x + Math.cos(ang) * d.r * 0.9,
          y: d.y + Math.sin(ang) * d.r * 0.9
        };
        // Strong priority near cities
        const dd = (edge.x - x) ** 2 + (edge.y - y) ** 2 * 0.55;
        if (dd < bestD) {
          bestD = dd;
          best = {
            x: edge.x,
            y: edge.y,
            kind: 'city',
            label: d.name,
            district: d,
            strength: 1 - Math.sqrt(dd) / magnet
          };
        }
      }
    }
    return best;
  }

  /** Update activeSnap preview from world point (while drawing) */
  updateActiveSnap(worldX, worldY) {
    const snap = this.findSnapPoint(worldX, worldY);
    if (snap.kind === 'free') {
      this.activeSnap = null;
      return null;
    }
    this.activeSnap = {
      x: snap.x,
      y: snap.y,
      kind: snap.kind,
      label: snap.label,
      fromX: worldX,
      fromY: worldY,
      strength: Math.max(0.2, Math.min(1, snap.strength || 0.6))
    };
    return this.activeSnap;
  }

  clearActiveSnap() {
    this.activeSnap = null;
  }

  /**
   * Erase a chunk of road around the tap (not the whole road).
   * Full proportional refund of paidCost for removed length.
   */
  eraseNear(screenX, screenY) {
    const p = this.screenToWorld(screenX, screenY);
    let bestIdx = -1;
    let best = null;
    let bestDist = 48 * this.dpr;

    for (let i = 0; i < this.roads.length; i++) {
      if (this.roads[i].owner !== 'player') continue;
      const closest = this.roads[i].closestPoint(p.x, p.y);
      if (closest.dist < bestDist) {
        bestDist = closest.dist;
        bestIdx = i;
        best = closest;
      }
    }
    if (bestIdx < 0 || !best) return;

    const road = this.roads[bestIdx];
    const oldLen = road.length || 1;
    const eraseAlong = Math.max(70 * this.dpr, oldLen * 0.18); // chunk size
    const half = eraseAlong / 2;
    const tCenter = best.t;
    // Convert t to arc distance
    const distCenter = tCenter * oldLen;
    const cutStart = Math.max(0, distCenter - half);
    const cutEnd = Math.min(oldLen, distCenter + half);

    const before = this._polylineSliceByDist(road.points, 0, cutStart);
    const after = this._polylineSliceByDist(road.points, cutEnd, oldLen);
    const removedLen = Math.max(0, cutEnd - cutStart);
    const refund = Math.round((road.paidCost || this.roadCostForLength(oldLen)) * (removedLen / oldLen));

    this.vehicles = this.vehicles.filter(v => v.currentRoad !== road);
    this.roads.splice(bestIdx, 1);

    const minLen = 28 * this.dpr;
    const mk = (pts, frac) => {
      if (!pts || pts.length < 2) return;
      let len = 0;
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      if (len < minLen) return;
      this.roads.push(new Road(pts, {
        owner: road.owner,
        ownerColor: road.ownerColor,
        lanes: road.lanes,
        isBridge: road.isBridge,
        paidCost: Math.round((road.paidCost || 0) * frac),
        oneWay: road.oneWay || 0,
        hasLight: !!road.hasLight
      }));
    };

    const beforeLen = Math.max(0, cutStart);
    const afterLen = Math.max(0, oldLen - cutEnd);
    const remain = beforeLen + afterLen;
    mk(before, remain > 0 ? beforeLen / oldLen : 0);
    mk(after, remain > 0 ? afterLen / oldLen : 0);

    this.money += refund;
    this.addFloatText(p.x, p.y - 10, `+$${refund}`, '#059669');
    this.showToast(refund ? `Slettet stykke · +$${refund}` : 'Slettet stykke');
    this.requestDraw();
  }

  /** Extract polyline between arc distances [d0, d1] along points */
  _polylineSliceByDist(points, d0, d1) {
    if (!points || points.length < 2 || d1 <= d0 + 1) return [];
    const out = [];
    let traveled = 0;
    // start point
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1e-6;
      const a = traveled;
      const b = traveled + seg;
      // collect start
      if (d0 >= a && d0 <= b && out.length === 0) {
        const t = (d0 - a) / seg;
        out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
      }
      if (d0 <= a && d1 >= b) {
        if (out.length === 0) out.push({ x: p0.x, y: p0.y });
        out.push({ x: p1.x, y: p1.y });
      } else if (d0 < b && d1 > a) {
        if (out.length === 0) {
          const t0 = Math.max(0, (d0 - a) / seg);
          out.push({ x: p0.x + (p1.x - p0.x) * t0, y: p0.y + (p1.y - p0.y) * t0 });
        }
        if (d1 <= b) {
          const t1 = (d1 - a) / seg;
          out.push({ x: p0.x + (p1.x - p0.x) * t1, y: p0.y + (p1.y - p0.y) * t1 });
          break;
        } else {
          out.push({ x: p1.x, y: p1.y });
        }
      }
      traveled = b;
    }
    // dedupe consecutive
    const cleaned = [];
    for (const pt of out) {
      const prev = cleaned[cleaned.length - 1];
      if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1) cleaned.push(pt);
    }
    return cleaned;
  }

  snapEndpoints(points) {
    const snap = this.getSnapDistance() * this.dpr;
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
        // Full refund of what was paid for this road
        const refund = Math.max(
          0,
          road.paidCost || this.roadCostForLength(road.length)
        );
        this.money += refund;
        this.vehicles = this.vehicles.filter(v => v.currentRoad !== road);
        this.roads.splice(i, 1);
        this.showToast(refund ? `Undo · +$${refund} (fuld refund)` : 'Undo');
        this.requestDraw();
        return;
      }
    }
  }

  clearRoads() {
    // Full refund of all player roads' paid costs
    let refund = 0;
    const keep = [];
    for (const r of this.roads) {
      if (r.owner === 'player') {
        refund += Math.max(0, r.paidCost || this.roadCostForLength(r.length));
      } else {
        keep.push(r);
      }
    }
    this.roads = keep;
    this.vehicles = this.vehicles.filter(v => v.owner !== 'player');
    this.money += refund;
    if (refund) this.showToast(`Rydet · +$${refund} (fuld refund)`);
    this.requestDraw();
  }

  /** Hex grid size for snap helpers */
  get hexSize() {
    return 34 * (this.dpr || 1);
  }

  /** Soft snap to hex center (easier drawing, not forced) */
  snapToHex(x, y, strength = 0.45) {
    const size = this.hexSize;
    // axial hex (pointy top)
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(-q - r);
    const q_diff = Math.abs(rq - q);
    const r_diff = Math.abs(rr - r);
    const s_diff = Math.abs(rs - (-q - r));
    if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
    else if (r_diff > s_diff) rr = -rq - rs;
    const cx = size * (Math.sqrt(3) * rq + (Math.sqrt(3) / 2) * rr);
    const cy = size * ((3 / 2) * rr);
    return {
      x: x + (cx - x) * strength,
      y: y + (cy - y) * strength
    };
  }

  areDistrictsRoughlyConnected(a, b) {
    // Heuristic: is there a road near both districts?
    const nearA = this.findNearestRoadPoint(a.x, a.y, a.r + 90);
    const nearB = this.findNearestRoadPoint(b.x, b.y, b.r + 90);
    return !!(nearA && nearB);
  }

  addJob() {
    const max = this.rushActive ? MAX_JOBS_RUSH : MAX_JOBS;
    if (this.jobs.filter(j => j.active).length >= max) return;
    const job = generateJob(this.districts, this.jobs, {
      rush: this.rushActive,
      preferPassengers: hasShopBuff(this.meta, 'tourist_office'),
      preferCargo: hasShopBuff(this.meta, 'cargo_hub')
    });
    if (job) {
      this.jobs.push(job);
      if (this.rushActive) {
        // Small visual ping at origin during rush
        const from = job.from;
        if (from) this.addFloatText(from.x, from.y - (from.r || 20), '⚡', '#db2777');
      }
    }
  }

  /**
   * P1-4: grow a district (radius + demand). Triggered by deliveries / time.
   */
  growDistrict(district, amount = 1) {
    if (!district) return false;
    const before = district.growth | 0;
    if (before >= GROWTH_MAX) return false;
    district.growth = Math.min(GROWTH_MAX, before + amount);
    const g = district.growth;
    const baseR = district.baseR || district.r;
    district.baseR = baseR;
    district.r = baseR * (1 + g * 0.045);
    this.applyBuildingBuffs(district);
    if (g > before && (g === 1 || g === 3 || g === 5 || g === GROWTH_MAX)) {
      this.addFloatText(district.x, district.y - district.r, `By vokser ${g}`, '#0d9488');
      if (g >= 3) this.showToast(`${district.name} vokser (størrelse ${g})`, 2.0);
    }
    if (g >= 3) this.tryAchievement('growth_3');
    return true;
  }

  tickDistrictGrowth(dt) {
    this.growthTimer += dt;
    if (this.growthTimer < GROWTH_TICK) return;
    this.growthTimer = 0;
    // Prefer places with many deliveries; soft random growth elsewhere
    const list = [...this.districts].sort(
      (a, b) => (b.deliveriesHere | 0) - (a.deliveriesHere | 0)
    );
    let grew = 0;
    for (const d of list) {
      if ((d.growth | 0) >= GROWTH_MAX) continue;
      const deliv = d.deliveriesHere | 0;
      const chance = 0.12 + Math.min(0.55, deliv * 0.04) + (this.rushActive ? 0.08 : 0);
      if (Math.random() < chance) {
        this.growDistrict(d, 1);
        grew++;
        if (grew >= 2) break;
      }
    }
  }

  tickRushHour(dt) {
    this.sessionTime += dt;
    const phase = this.getRushPhase();
    this.rushActive = phase.inRush;
    if (this.rushActive && !this._wasRush) {
      this.showToast('🚇 Rush hour! Flere og større opgaver', 2.8);
      // Burst a couple jobs if room
      this.addJob();
      this.addJob();
      this.jobTimer = 0;
    } else if (!this.rushActive && this._wasRush) {
      this.showToast('Rush over – trafik roligere', 2.0);
    }
    this._wasRush = this.rushActive;
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
    // express/tourist use car (already via kind)

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
        // P2-3 depot: biler stationeret her får hurtigere/prioriteret assign
        const homeDist = this.districts.find(d => d.name === park);
        const depotBonus = homeDist?.buildings?.depot && park === from.name ? 55 : 0;
        const stationBonus = from.buildings?.station && job.type !== 'cargo' ? 22 : 0;
        const warehouseBonus = from.buildings?.warehouse && job.type === 'cargo' ? 22 : 0;
        const dist = Math.hypot(
          (vehicle.x || from.x) - from.x,
          (vehicle.y || from.y) - from.y
        );
        const cap = vehicle.getCargoCapacity?.() || 1;
        const cargoFit = Math.min(remaining, cap) * 14;
        // U3: match class to job shape – heavy loves big cargo, fast loves express
        let classFit = 0;
        if (job.type === 'cargo') {
          if (vehicle.classId === 'truck_heavy') classFit = remaining >= 5 ? 55 : 20;
          else if (vehicle.classId === 'truck_std') classFit = 15;
        } else if (job.type === 'express') {
          if (vehicle.classId === 'car_fast') classFit = 70;
          else if (vehicle.classId === 'car_std') classFit = 10;
        } else if (job.type === 'tourist') {
          if (vehicle.classId === 'car_std') classFit = 40;
          else if (vehicle.classId === 'car_fast') classFit = 35;
        } else {
          if (vehicle.classId === 'car_fast') classFit = remaining <= 6 ? 50 : 18;
          else if (vehicle.classId === 'car_std') classFit = 15;
        }
        // Overkill penalty: huge capacity on tiny leftover job
        if (cap > remaining + 1) classFit -= (cap - remaining) * 8;
        const speedHint = (vehicle.baseSpeed || 60) * 0.1;
        const score =
          homeBonus + depotBonus + stationBonus + warehouseBonus
          + remaining * 5 + cargoFit + classFit + speedHint
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
        if (vehicle.owner === 'player') this.jobsCompleted = (this.jobsCompleted || 0) + 1;
        const label = job.typeMeta?.label || 'Opgave';
        this.showToast(`${job.typeMeta?.icon || '✓'} ${label}: ${job.from.name} → ${job.to.name}!`);
        this.addArrivalParticles(vehicle.x, vehicle.y, job.to.color);
        if (vehicle.owner === 'player') playJobDone();
      } else if (vehicle.owner === 'player') {
        playDeliver();
      }
    }

    if (vehicle.owner === 'player') {
      this.money += reward;
      this.playerScore += reward;
      this.playerDelivered += applied;
      this.arrivedCount++;
      this.tryAchievement('first_delivery');
      if (jobJustCompleted) {
        this.tryAchievement('first_job');
        if (this.rushActive) this.tryAchievement('rush_job');
      }
      if (this.money >= 1500) this.tryAchievement('money_500');
      if ((this.meta?.level || 1) >= 3) this.tryAchievement('level_3');
      if (this.arrivedCount > this.sessionBest) this.sessionBest = this.arrivedCount;
      if (this.arrivedCount > this.allTimeBest) {
        this.allTimeBest = this.arrivedCount;
        this.saveBest(this.allTimeBest);
      }
      this.addFloatText(vehicle.x, vehicle.y - 10, `+$${reward}`, '#059669');

      // P1-4: deliveries feed place growth (to + soft from)
      if (job) {
        const toD = this.districts.find(d => d.name === job.to.name);
        const fromD = this.districts.find(d => d.name === job.from.name);
        if (toD) {
          toD.deliveriesHere = (toD.deliveriesHere | 0) + applied;
          if (jobJustCompleted && Math.random() < 0.45) this.growDistrict(toD, 1);
          else if ((toD.deliveriesHere % 12) === 0) this.growDistrict(toD, 1);
        }
        if (fromD && jobJustCompleted && Math.random() < 0.22) {
          fromD.deliveriesHere = (fromD.deliveriesHere | 0) + 1;
          this.growDistrict(fromD, 1);
        }
      }

      // B1: XP per unit + bonus when whole job completes
      let xpGain = XP_REWARDS.perUnit * Math.max(1, applied);
      if (jobJustCompleted && job) {
        xpGain += XP_REWARDS.jobCompleteBase + job.amount * XP_REWARDS.jobCompletePerUnit;
        if (job.type === 'express') xpGain += 4;
        if (job.type === 'tourist') xpGain += 3;
        if (this.rushActive) xpGain += 3;
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

    // P1-3 rush + P1-4 growth + P2-1 lights + P3-1 vejr/tid
    this.tickRushHour(dt);
    this.tickDistrictGrowth(dt);
    this.tickTrafficLights();
    this.tickAtmosphere(dt);

    // Jobs (faster spawn during rush)
    this.jobTimer += dt;
    const jobInterval = this.rushActive ? RUSH_JOB_INTERVAL : NORMAL_JOB_INTERVAL;
    if (this.jobTimer > jobInterval) {
      this.addJob();
      if (this.rushActive && Math.random() < 0.45) this.addJob();
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

      // Vejr: blød hastigheds-multiplikator
      const atmo = this.getAtmosphereUi();
      if (atmo.speedMul < 1 && v.baseSpeed) {
        v._weatherMul = atmo.speedMul;
      } else {
        v._weatherMul = 1;
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

      const meta = job.typeMeta || JOB_TYPES[job.type] || JOB_TYPES.passengers;
      const hex = meta.color || '#2563eb';
      // Dashed route hint
      ctx.beginPath();
      ctx.setLineDash([6 * this.dpr, 8 * this.dpr]);
      ctx.strokeStyle = hex.length === 7
        ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.38)`
        : 'rgba(37, 99, 235, 0.35)';
      ctx.lineWidth = 2 * this.dpr;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Origin badge
      const left = Math.max(0, job.amount - job.delivered);
      this.drawBadge(ctx, from.x, from.y - from.r - 14 * this.dpr, `${meta.icon}${left}`, hex);
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
    drawWorldTerrain(
      ctx, w, h, this.dpr,
      this.districts, this.mapSeed,
      this.waterBodies, this.tileMap,
      { showHex: this.mode === 'draw' || this.mode === 'bridge', hexSize: this.hexSize }
    );
  }

  drawDistrict(ctx, d) {
    drawPlaceHub(ctx, d, this.dpr, {
      lightenHex: (c, a) => this.lightenHex(c, a),
      darkenHex: (c, f) => this.darkenHex(c, f),
      drawSilhouette: (c, dist, type) => this.drawPlaceSilhouette(c, dist, type)
    });
  }

  /** VIS2 – mere detaljerede silhuetter pr. stedtype */
  drawPlaceSilhouette(ctx, d, type) {
    const s = d.r * 0.58;
    const dpr = this.dpr;
    ctx.save();
    ctx.translate(d.x, d.y - d.r * 0.05);
    ctx.lineJoin = 'round';

    if (type === 'farm') {
      // silo
      ctx.fillStyle = 'rgba(214, 211, 209, 0.75)';
      ctx.fillRect(s * 0.35, -s * 0.7, s * 0.32, s * 1.05);
      ctx.beginPath();
      ctx.arc(s * 0.51, -s * 0.7, s * 0.16, Math.PI, 0);
      ctx.fill();
      // barn body
      ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
      ctx.fillRect(-s * 0.75, -s * 0.1, s * 1.15, s * 0.72);
      ctx.fillStyle = 'rgba(180, 83, 9, 0.65)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.1);
      ctx.lineTo(-s * 0.15, -s * 0.78);
      ctx.lineTo(s * 0.5, -s * 0.1);
      ctx.closePath();
      ctx.fill();
      // door
      ctx.fillStyle = 'rgba(68, 64, 60, 0.45)';
      ctx.fillRect(-s * 0.35, s * 0.15, s * 0.28, s * 0.45);
    } else if (type === 'factory') {
      ctx.fillStyle = 'rgba(87, 83, 78, 0.55)';
      ctx.fillRect(-s * 0.85, -s * 0.05, s * 1.7, s * 0.7);
      // windows row
      ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(-s * 0.7 + i * s * 0.38, s * 0.08, s * 0.16, s * 0.2);
      }
      // chimneys + smoke puffs
      ctx.fillStyle = 'rgba(68, 64, 60, 0.7)';
      ctx.fillRect(-s * 0.5, -s * 0.95, s * 0.22, s * 0.9);
      ctx.fillRect(s * 0.2, -s * 1.05, s * 0.26, s * 1.0);
      ctx.fillStyle = 'rgba(168, 162, 158, 0.35)';
      ctx.beginPath();
      ctx.arc(-s * 0.35, -s * 1.1, s * 0.18, 0, Math.PI * 2);
      ctx.arc(s * 0.4, -s * 1.25, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'harbor') {
      // pier
      ctx.fillStyle = 'rgba(120, 113, 108, 0.55)';
      ctx.fillRect(-s * 1.0, s * 0.2, s * 2.0, s * 0.28);
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(-s * 0.85 + i * s * 0.4, s * 0.48, s * 0.1, s * 0.22);
      }
      // crane / mast
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.2);
      ctx.lineTo(-s * 0.15, -s * 0.75);
      ctx.lineTo(s * 0.65, -s * 0.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.5)';
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.15);
      ctx.lineTo(s * 0.7, s * 0.05);
      ctx.lineTo(s * 0.1, s * 0.15);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'capital') {
      // cathedral / hall
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(-s * 0.55, -s * 0.15, s * 1.1, s * 0.75);
      ctx.fillRect(-s * 0.22, -s * 0.7, s * 0.44, s * 0.55);
      // spire
      ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, -s * 0.7);
      ctx.lineTo(s * 0.0, -s * 1.15);
      ctx.lineTo(s * 0.12, -s * 0.7);
      ctx.fill();
      // side towers
      ctx.fillStyle = 'rgba(237, 233, 254, 0.7)';
      ctx.fillRect(-s * 0.85, s * 0.0, s * 0.28, s * 0.55);
      ctx.fillRect(s * 0.55, s * 0.0, s * 0.28, s * 0.55);
      ctx.fillStyle = 'rgba(167, 139, 250, 0.7)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, 0);
      ctx.lineTo(-s * 0.71, -s * 0.35);
      ctx.lineTo(-s * 0.52, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.52, 0);
      ctx.lineTo(s * 0.71, -s * 0.35);
      ctx.lineTo(s * 0.9, 0);
      ctx.fill();
    } else {
      // town: 3 houses + chimney
      const house = (ox, sc, roof) => {
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.fillRect(ox - sc * 0.35, -sc * 0.05, sc * 0.7, sc * 0.6);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(ox - sc * 0.45, -sc * 0.05);
        ctx.lineTo(ox, -sc * 0.55);
        ctx.lineTo(ox + sc * 0.45, -sc * 0.05);
        ctx.fill();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillRect(ox - sc * 0.12, sc * 0.12, sc * 0.18, sc * 0.18);
      };
      house(-s * 0.45, s * 0.85, 'rgba(185, 28, 28, 0.55)');
      house(s * 0.35, s * 1.0, 'rgba(180, 83, 9, 0.55)');
      house(s * 0.05, s * 0.7, 'rgba(120, 53, 15, 0.5)');
      ctx.fillStyle = 'rgba(68, 64, 60, 0.5)';
      ctx.fillRect(s * 0.45, -s * 0.55, s * 0.1, s * 0.25);
    }
    ctx.restore();
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

    // Outside playable board = void (not fake buildable land)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2c2925';
    ctx.fillRect(0, 0, w, h);

    // World transform
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

    this.drawBackground(ctx, this.worldW || w * 1.95, this.worldH || h * 1.95);

    // Roads under districts so hubs sit on top of asphalt
    for (const road of this.roads) road.draw(ctx, this.dpr);

    // Junction hubs
    const connR = 8 * this.dpr;
    const joinThresh = (this.getSnapDistance() * this.dpr * 0.55) ** 2;
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

    // Preview stroke (draw + bridge)
    if ((this.mode === 'draw' || this.mode === 'bridge') && this.currentStroke && this.currentStroke.length > 1) {
      const ok = this.money >= this.pendingRoadCost;
      const bridge = this.mode === 'bridge';
      ctx.beginPath();
      ctx.strokeStyle = ok ? (bridge ? '#0284c7' : '#0f766e') : '#b91c1c';
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

      // P0-4: tydelig snap-feedback (mål + guide-linje + label)
      this.drawSnapFeedback(ctx, last);
    } else if (this.activeSnap) {
      this.drawSnapFeedback(ctx, null);
    }

    // Building badges on places
    for (const d of this.districts) {
      this.drawBuildingBadges(ctx, d);
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
    this.drawAtmosphereOverlay(ctx, w, h);
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
   * P0-4: snap magnet preview while drawing.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}|null} tip stroke tip (optional)
   */
  drawSnapFeedback(ctx, tip) {
    const snap = this.activeSnap;
    if (!snap) return;
    const dpr = this.dpr || 1;
    const pulse = 0.85 + 0.15 * Math.sin((performance.now() / 180));
    const colors = {
      city: { fill: 'rgba(245, 158, 11, 0.4)', stroke: '#d97706', ring: 'rgba(251, 191, 36, 0.35)' },
      endpoint: { fill: 'rgba(14, 165, 233, 0.4)', stroke: '#0284c7', ring: 'rgba(56, 189, 248, 0.35)' },
      road: { fill: 'rgba(16, 185, 129, 0.38)', stroke: '#059669', ring: 'rgba(52, 211, 153, 0.3)' }
    };
    const c = colors[snap.kind] || colors.road;
    const r = (12 + (snap.strength || 0.5) * 8) * dpr * pulse;

    // Guide line tip → snap
    const fromX = tip?.x ?? snap.fromX;
    const fromY = tip?.y ?? snap.fromY;
    if (fromX != null && Math.hypot(snap.x - fromX, snap.y - fromY) > 4 * dpr) {
      ctx.save();
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(snap.x, snap.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Outer soft ring
    ctx.beginPath();
    ctx.arc(snap.x, snap.y, r * 1.55, 0, Math.PI * 2);
    ctx.fillStyle = c.ring;
    ctx.fill();
    // Core magnet
    ctx.beginPath();
    ctx.arc(snap.x, snap.y, r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 2.8 * dpr;
    ctx.stroke();
    // Crosshair
    ctx.beginPath();
    ctx.moveTo(snap.x - r * 0.55, snap.y);
    ctx.lineTo(snap.x + r * 0.55, snap.y);
    ctx.moveTo(snap.x, snap.y - r * 0.55);
    ctx.lineTo(snap.x, snap.y + r * 0.55);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();

    if (snap.label) {
      const label = snap.kind === 'city' ? `◎ ${snap.label}` : snap.kind === 'endpoint' ? '⊕ Kryds' : '⊞ Vej';
      ctx.font = `bold ${Math.max(11, 12 * dpr)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3.5 * dpr;
      ctx.strokeText(label, snap.x, snap.y - r - 6 * dpr);
      ctx.fillStyle = c.stroke;
      ctx.fillText(label, snap.x, snap.y - r - 6 * dpr);
    }
  }

  /** Small icons for station/lager/depot on a place */
  drawBuildingBadges(ctx, d) {
    if (!d?.buildings) return;
    const keys = ['station', 'warehouse', 'depot'].filter(k => d.buildings[k]);
    if (!keys.length) return;
    const dpr = this.dpr || 1;
    const size = d.r * 2.45;
    const baseY = d.y + size * 0.18;
    const startX = d.x - (keys.length - 1) * 9 * dpr;
    ctx.font = `${Math.max(11, 12 * dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    keys.forEach((k, i) => {
      const meta = BUILDING_META[k];
      const x = startX + i * 18 * dpr;
      const y = baseY + 14 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = meta?.color || '#57534e';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
      ctx.fillText(meta?.icon || '•', x, y + 0.5 * dpr);
    });
  }

  /** P3-1: soft day/night + weather overlay (screen space) */
  drawAtmosphereOverlay(ctx, w, h) {
    const t = this.timeOfDay ?? 0.4;
    // Night darkness: peak at midnight (0 and 1)
    const night = Math.max(0, Math.cos((t - 0.5) * Math.PI * 2));
    const dark = Math.pow(Math.max(0, night - 0.15), 1.2) * 0.42;
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(15, 23, 42, ${dark.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      // Soft warm windows at night
      if (dark > 0.18) {
        ctx.fillStyle = `rgba(251, 191, 36, ${(dark * 0.06).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h * 0.35);
      }
    }
    // Dawn / dusk tint
    if (t > 0.2 && t < 0.35) {
      const a = (1 - Math.abs(t - 0.28) / 0.1) * 0.12;
      ctx.fillStyle = `rgba(251, 146, 60, ${Math.max(0, a).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    } else if (t > 0.62 && t < 0.78) {
      const a = (1 - Math.abs(t - 0.7) / 0.1) * 0.14;
      ctx.fillStyle = `rgba(244, 114, 182, ${Math.max(0, a).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.weather === 'rain') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
      ctx.fillRect(0, 0, w, h);
      const dpr = this.dpr || 1;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.lineWidth = 1.2 * dpr;
      const n = 28;
      const seed = ((this.sessionTime || 0) * 40) | 0;
      for (let i = 0; i < n; i++) {
        const x = ((i * 97 + seed * 3) % 1000) / 1000 * w;
        const y = ((i * 53 + seed * 7) % 1000) / 1000 * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3 * dpr, y + 12 * dpr);
        ctx.stroke();
      }
    } else if (this.weather === 'fog') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.18)';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.55);
      g.addColorStop(0, 'rgba(241, 245, 249, 0.05)');
      g.addColorStop(1, 'rgba(148, 163, 184, 0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * Minimap over hele spilbrættet (worldW/H) – bottom-left
   * (pan-ned er midt-bund; zoom er højre-bund 2×2).
   */
  drawMinimap(ctx, w, h) {
    const dpr = this.dpr || 1;
    const cssW = w / dpr;
    const worldW = Math.max(1, this.worldW || w);
    const worldH = Math.max(1, this.worldH || h);
    const worldAspect = worldW / worldH;

    // Kompakt: ~28% bredde; bottom-left, fri for pan-ned midt og zoom højre
    const mapCssW = Math.min(168, Math.max(118, cssW * 0.28));
    const mapCssH = Math.min(mapCssW / worldAspect, cssW * 0.36);
    const mapW = mapCssW * dpr;
    const mapH = mapCssH * dpr;
    const safeLeft = 10 * dpr;
    const safeBotCss = 14;
    const mx = safeLeft;
    const my = h - mapH - Math.max(26, 18 + safeBotCss) * dpr;

    // Ens scale i x/y – bræt fylder panelet (evt. lille padding)
    const pad = 3 * dpr;
    const scale = Math.min((mapW - pad * 2) / worldW, (mapH - pad * 2) / worldH);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const ox = mx + (mapW - drawW) / 2;
    const oy = my + (mapH - drawH) / 2;

    ctx.save();
    // Panel
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(28, 25, 23, 0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5 * dpr;
    const rr = 10 * dpr;
    ctx.beginPath();
    ctx.moveTo(mx + rr, my);
    ctx.arcTo(mx + mapW, my, mx + mapW, my + mapH, rr);
    ctx.arcTo(mx + mapW, my + mapH, mx, my + mapH, rr);
    ctx.arcTo(mx, my + mapH, mx, my, rr);
    ctx.arcTo(mx, my, mx + mapW, my, rr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Clip alt indhold til bræt-rektangel
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, drawW, drawH);
    ctx.clip();

    // Board background
    ctx.fillStyle = 'rgba(197, 217, 160, 0.95)';
    ctx.fillRect(ox, oy, drawW, drawH);

    // Water blobs (tiny)
    if (this.waterBodies?.length) {
      for (const b of this.waterBodies) {
        ctx.beginPath();
        ctx.ellipse(
          ox + b.cx * scale,
          oy + b.cy * scale,
          Math.max(2 * dpr, b.rx * scale),
          Math.max(1.5 * dpr, b.ry * scale),
          b.rot || 0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
        ctx.fill();
      }
    }

    // Roads
    ctx.lineWidth = Math.max(1.2 * dpr, 1.5 * dpr);
    ctx.lineCap = 'round';
    for (const road of this.roads) {
      if (road.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = road.isBridge
        ? '#38bdf8'
        : road.owner === 'player'
          ? '#44403c'
          : (road.ownerColor || '#78716c');
      ctx.moveTo(ox + road.points[0].x * scale, oy + road.points[0].y * scale);
      for (let i = 1; i < road.points.length; i++) {
        ctx.lineTo(ox + road.points[i].x * scale, oy + road.points[i].y * scale);
      }
      ctx.stroke();
    }

    // Places – larger dots for mobile readability (+ hit targets for tap→by)
    const placeHits = [];
    for (const d of this.districts) {
      const px = ox + d.x * scale;
      const py = oy + d.y * scale;
      const pr = Math.max(5 * dpr, d.r * scale * 0.9);
      placeHits.push({ d, px, py, pr: Math.max(pr, 11 * dpr) });
      ctx.beginPath();
      ctx.fillStyle = d.color || '#a8a29e';
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
    }
    this._minimapPlaceHits = placeHits;

    // Viewport = det der vises på skærmen (matcher setTransform(zoom,0,0,zoom,cam.x,cam.y))
    const cam = this.camera;
    const z = Math.max(1e-6, cam.zoom || 1);
    const invZ = 1 / z;
    // Canvas-pixels (0..w, 0..h) → world
    const left = (0 - cam.x) * invZ;
    const top = (0 - cam.y) * invZ;
    const right = (w - cam.x) * invZ;
    const bottom = (h - cam.y) * invZ;

    // Clip viewport til bræt – firkant ligger altid på kortet
    const vx0 = Math.max(0, Math.min(worldW, left));
    const vy0 = Math.max(0, Math.min(worldH, top));
    const vx1 = Math.max(0, Math.min(worldW, right));
    const vy1 = Math.max(0, Math.min(worldH, bottom));
    const rw = vx1 - vx0;
    const rh = vy1 - vy0;
    if (rw > 1 && rh > 1) {
      const rx = ox + vx0 * scale;
      const ry = oy + vy0 * scale;
      const rww = rw * scale;
      const rhh = rh * scale;
      ctx.fillStyle = 'rgba(20, 184, 166, 0.16)';
      ctx.fillRect(rx, ry, rww, rhh);
      ctx.strokeStyle = '#14b8a6';
      ctx.lineWidth = 2.25 * dpr;
      ctx.strokeRect(rx, ry, rww, rhh);
    }

    ctx.restore(); // clip

    // Board edge (uden for clip så streg er skarp)
    ctx.strokeStyle = 'rgba(68,64,60,0.45)';
    ctx.lineWidth = 1.25 * dpr;
    ctx.strokeRect(ox, oy, drawW, drawH);

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `${Math.max(9, 10 * dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Kort · tryk by', mx + mapW / 2, my - 2 * dpr);

    ctx.restore();
    // Tap: world = (x-ox)/scale (panelet matcher bræt)
    this._minimapRect = {
      x: mx,
      y: my,
      w: mapW,
      h: mapH,
      ox,
      oy,
      scale,
      worldW,
      worldH
    };
  }

  /**
   * Minimap-tap: prik på by → hop til by; ellers pan til punkt.
   * @returns {boolean} handled
   */
  handleMinimapTap(screenCssX, screenCssY) {
    const r = this._minimapRect;
    if (!r) return false;
    const x = screenCssX * this.dpr;
    const y = screenCssY * this.dpr;
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) return false;

    // 1) Hit nearest place (større hit-radius til touch)
    const hits = this._minimapPlaceHits || [];
    let best = null;
    let bestD = Infinity;
    for (const h of hits) {
      const dd = Math.hypot(h.px - x, h.py - y);
      const thr = h.pr * 1.65;
      if (dd <= thr && dd < bestD) {
        bestD = dd;
        best = h;
      }
    }
    if (best?.d) {
      this.focusOnDistrict(best.d, true);
      this.showToast(`📍 ${best.d.name}`, 1.4);
      return true;
    }

    // 2) Ellers pan til world-punkt under finger
    const bx = Math.max(r.ox, Math.min(r.ox + r.worldW * r.scale, x));
    const by = Math.max(r.oy, Math.min(r.oy + r.worldH * r.scale, y));
    const wx = (bx - r.ox) / r.scale;
    const wy = (by - r.oy) / r.scale;
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
