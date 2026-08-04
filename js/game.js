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
import { buildWaterBodies, strokeWaterFraction, pointInWater } from './water.js';
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
  BUILDING_META,
  districtBuildingEffects
} from './shop.js';
import {
  unlockAchievement,
  achievementProgress
} from './achievements.js';
import {
  loadDaily,
  saveDaily,
  applyDailyProgress,
  claimDaily,
  dailyUi,
  isDailyComplete
} from './daily.js';
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
    this.bottleneckTimer = 0;
    this.bottleneckToastCooldown = 0;
    /** Worst player road congestion { road, dens, mid } | null */
    this.bottleneck = null;
    /** Flow meter (IMP-A4) */
    this.flowPct = 0;
    this.flowHoldTimer = 0;
    this.flowHoldBest = 0;
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
    this.sessionXp = 0;
    this.sessionBuys = 0;
    this.sessionStartLevel = 1;
    this.allTimeBest = this.loadBest();
    this.pendingRoadCost = 0;
    this.toast = null;
    this.toastTimer = 0;
    this.daily = loadDaily();

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
    this.worldScale = 1.65;
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
    /** Mission-vejviser: job-id der fremhæves på kortet (null = alle dæmpet) */
    this.guideJobId = null;
    this.guideJobUntil = 0;
    /** Afventer bro/kryds-valg efter vej-over-vej (evt. flere kryds) */
    this.pendingCrossing = null;
    /** UI-callback: ({ open, bridgeCost, junctionCost, bridgeAllCost, junctionAllCost, money, index, total, multi }) */
    this.onCrossingChoice = null;
    this._nextLightGroupId = 1;
    /**
     * Undo-batches for multi-kryds (ét træk = alle segmenter + fuld $).
     * { id, roadIds: string[], totalPaid, lightRestores: [{ roadId, hasLight, lightT, lightGroup, lightRole, lightPhase }] }
     */
    this.undoBatches = [];
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
    // Større bræt: base + scale (scenarier sætter worldScale)
    const scale = this.worldScale || 1.55;
    const baseW = 1320 * dpr;
    const baseH = 980 * dpr;
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
    this.worldScale = sc.worldScale || 1.75;
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
    this.sessionXp = 0;
    this.sessionBuys = 0;
    this.sessionStartLevel = this.meta?.level || 1;
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
    this.timeOfDay = sc.startTimeOfDay != null
      ? sc.startTimeOfDay
      : (0.32 + Math.random() * 0.15);
    this.weather = sc.startWeather || 'clear';
    this.weatherTimer = 18 + Math.random() * 25;
    this._cityHintShown = false;
    this._cityHintUntil = 0;
    this.flowPct = 0;
    this.flowHoldTimer = 0;
    this.flowHoldBest = 0;
    this.daily = loadDaily();

    this.initDistricts();
    this.botsEnabled = !!opts.bots;
    if (sc.forceBotsHint && opts.bots === undefined) {
      /* caller may enable bots from UI */
    }
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
        hasLight: !!r.hasLight,
        lightT: r.lightT != null ? r.lightT : 0.5,
        lightGroup: r.lightGroup != null ? r.lightGroup : null,
        lightRole: r.lightRole === 1 ? 1 : 0
      });
      if (r.id) road.id = r.id;
      this.roads.push(road);
      if (r.lightGroup != null) {
        this._nextLightGroupId = Math.max(this._nextLightGroupId | 0, (r.lightGroup | 0) + 1);
      }
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
      allConnected: this.allPlacesHaveRoad(),
      flowPct: this.flowPct | 0,
      flowHoldBest: this.flowHoldBest || 0,
      flowHoldTimer: this.flowHoldTimer || 0
    });
    return this.goalEval;
  }

  /**
   * Live flow %: share of busy player fleet that is not stuck.
   * Soft fallback when few vehicles (based on arrivals vs fleet).
   */
  computeFlowPct() {
    const fleet = this.getPlayerFleet();
    const busy = fleet.filter(v => v.job);
    if (busy.length >= 2) {
      const ok = busy.filter(v => !v.stuck).length;
      return Math.round((ok / busy.length) * 100);
    }
    const onRoad = this.vehicles.filter(v => v.owner === 'player' && v.job).length;
    const arrived = this.arrivedCount || 0;
    if (arrived + onRoad < 4) return Math.max(this.flowPct || 0, 50);
    const score = arrived / (arrived + Math.max(1, onRoad * 0.65));
    return Math.max(0, Math.min(100, Math.round(score * 100)));
  }

  /** Threshold from active flow goals (lowest amount) or 70 */
  getFlowThreshold() {
    const goals = this.scenario?.goals || [];
    const flowGoals = goals.filter(g => g.type === 'flow');
    if (!flowGoals.length) return 70;
    return Math.min(...flowGoals.map(g => g.amount || 70));
  }

  tickFlow(dt) {
    this.flowPct = this.computeFlowPct();
    const thr = this.getFlowThreshold();
    if (this.flowPct >= thr) {
      this.flowHoldTimer = (this.flowHoldTimer || 0) + dt;
      if (this.flowHoldTimer > (this.flowHoldBest || 0)) {
        this.flowHoldBest = this.flowHoldTimer;
      }
    } else {
      this.flowHoldTimer = 0;
    }
    // Daily flow_hold uses fixed 65% threshold
    if (this.daily?.type === 'flow_hold') {
      if (this.flowPct >= 65) {
        this._dailyFlowHold = (this._dailyFlowHold || 0) + dt;
      } else {
        this._dailyFlowHold = 0;
      }
    }
    this.syncDailyProgress();
  }

  /** Push session stats into today's mini-goal */
  syncDailyProgress() {
    if (!this.daily) this.daily = loadDaily();
    applyDailyProgress(this.daily, {
      delivered: this.playerDelivered | 0,
      jobs: this.jobsCompleted | 0,
      score: this.playerScore | 0,
      buys: this.sessionBuys | 0,
      flowHold: this._dailyFlowHold || 0
    });
  }

  getDailyUi() {
    if (!this.daily) this.daily = loadDaily();
    return dailyUi(this.daily);
  }

  /**
   * Claim daily reward once complete.
   * @returns {{ ok: boolean, xp?: number, money?: number, streak?: number, reason?: string }}
   */
  claimDailyReward() {
    if (!this.daily) this.daily = loadDaily();
    this.syncDailyProgress();
    const res = claimDaily(this.daily);
    if (!res.ok) {
      if (res.reason === 'claimed') this.showToast('Dagens mål er allerede hentet');
      else if (res.reason === 'incomplete') this.showToast('Dagens mål er ikke færdigt endnu');
      return res;
    }
    this.money += res.money || 0;
    if (res.xp) this.grantXp(res.xp, { silent: false });
    this.showToast(
      `📅 Dagsmål! +$${res.money} · +${res.xp} XP${res.streak > 1 ? ` · streak ${res.streak}` : ''}`,
      3.2
    );
    playBuy();
    return res;
  }

  /** Snapshot for end-of-run panel */
  getRunSummary() {
    const levelNow = this.meta?.level || 1;
    const startLv = this.sessionStartLevel || levelNow;
    const totalUp = this.meta?.totalUpgrades || 0;
    let nextUnlock = null;
    if (totalUp < 5) nextUnlock = { at: 5, label: 'Hurtig bil ⚡' };
    else if (totalUp < 8) nextUnlock = { at: 8, label: 'Varebil 🚐' };
    else if (totalUp < 10) nextUnlock = { at: 10, label: 'Tung lastbil 🚛' };
    else if (totalUp < 15) nextUnlock = { at: 15, label: 'Bus 🚌' };
    return {
      stars: this.goalEval?.stars || 0,
      delivered: this.playerDelivered | 0,
      money: Math.floor(this.money),
      jobs: this.jobsCompleted | 0,
      score: this.playerScore | 0,
      sessionXp: this.sessionXp | 0,
      level: levelNow,
      levelsGained: Math.max(0, levelNow - startLv),
      totalUpgrades: totalUp,
      nextUnlock,
      scenarioName: this.scenario?.name || '',
      shareLine: this.getShareScoreLine?.() || ''
    };
  }

  /** Effects list for district sheet (IMP-A5) */
  getDistrictBuildingUi(district) {
    const d = typeof district === 'string'
      ? this.districts.find(x => x.name === district)
      : district;
    if (!d) return { lines: [], passengers: 1, cargo: 1, growth: 0 };
    const lines = districtBuildingEffects(d.buildings);
    return {
      lines,
      passengers: Math.round((d.passengers || 1) * 100) / 100,
      cargo: Math.round((d.cargo || 1) * 100) / 100,
      growth: d.growth | 0,
      hasAny: lines.length > 0
    };
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
   * Hub-tap for bil-shop. By-sprite står på d.y (jord) og fylder opad.
   */
  hitDistrictCore(screenX, screenY) {
    const w = this.screenToWorld(screenX, screenY);
    let best = null;
    let bestD = Infinity;
    for (const d of this.districts) {
      // Sprite plantet på groundY≈d.y, højde ~2.2·r opad
      const cx = d.x;
      const cy = d.y - d.r * 0.55;
      const hitR = d.r * 1.15;
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

  /**
   * Skub punkt ud af by-kerne / bygningshub, så veje ikke ligger under byer.
   * Endpoints tillades tæt på kanten (minR); midtpunkter skubbes til ring.
   * @param {{x:number,y:number}} p
   * @param {{ endpoint?: boolean }} [opts]
   */
  pushOutOfHubs(p, opts = {}) {
    if (!p || !this.districts?.length) return p;
    let x = p.x;
    let y = p.y;
    const endpoint = !!opts.endpoint;
    for (const d of this.districts) {
      const r = d.r || 40;
      // Endpoints må ligge på kanten (~0.92r); midt-veje skal uden for ~0.88r
      const minR = r * (endpoint ? 0.88 : 0.95);
      const dx = x - d.x;
      const dy = y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minR) {
        if (dist < 1.5) {
          // Præcis centrum: skub i en stabil retning (øst hvis intet andet)
          x = d.x + minR;
          y = d.y;
        } else {
          const s = minR / dist;
          x = d.x + dx * s;
          y = d.y + dy * s;
        }
      }
    }
    return this.clampToWorld({ x, y });
  }

  /** Hele stroke: skub midtpunkter ud af hubs; behold endpoint-snap til kant. */
  sanitizeStrokeThroughHubs(points) {
    if (!points || points.length < 2) return points;
    const out = points.map((p, i) => {
      const endpoint = i === 0 || i === points.length - 1;
      return this.pushOutOfHubs({ x: p.x, y: p.y }, { endpoint });
    });
    // Drop næsten-duplikater efter push
    const clean = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const prev = clean[clean.length - 1];
      if (Math.hypot(out[i].x - prev.x, out[i].y - prev.y) > 2) clean.push(out[i]);
    }
    if (clean.length < 2) clean.push(out[out.length - 1]);
    return clean;
  }

  /**
   * Startpunkt på by-kant, på land (vigtigt for havn).
   * Prøver primær vinkel, derefter vifter rundt indtil land findes.
   */
  landEdgeFromDistrict(district, aimX, aimY) {
    const baseAng = Math.atan2(aimY - district.y, aimX - district.x);
    const r = (district.r || 40) * 0.95;
    const tryEdge = (ang) => {
      const e = {
        x: district.x + Math.cos(ang) * r,
        y: district.y + Math.sin(ang) * r
      };
      const c = this.clampToWorld(e);
      // Land hvis ikke vand (med hub-undtagelse) eller tæt på hub
      if (!pointInWater(c.x, c.y, this.waterBodies, this.districts)) return c;
      return null;
    };
    let hit = tryEdge(baseAng);
    if (hit) return hit;
    // Vift ± op til 180°
    for (let step = 1; step <= 12; step++) {
      const da = (step / 12) * Math.PI;
      hit = tryEdge(baseAng + da);
      if (hit) return hit;
      hit = tryEdge(baseAng - da);
      if (hit) return hit;
    }
    // Fallback: kant i aim-retning alligevel (hub-carve gør den land)
    return this.clampToWorld({
      x: district.x + Math.cos(baseAng) * r,
      y: district.y + Math.sin(baseAng) * r
    });
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
    this.sessionBuys = (this.sessionBuys || 0) + 1;
    this.syncDailyProgress();
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
      road.lightGroup = null;
      road.lightRole = 0;
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
      road.lightT = hit.t != null ? hit.t : 0.5;
      road.lightGroup = null;
      road.lightRole = 0;
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

  /**
   * Trafiklys: parrede grupper (firevejs) kører i modfase;
   * lone lys beholder egen offset-cyklus.
   * Cyklus 12s: grøn 5 → gul 1 → rød 6 (modfase spejlvendt).
   */
  tickTrafficLights() {
    const t = this.sessionTime || 0;
    const CYCLE = 12;
    for (const road of this.roads) {
      if (!road.hasLight) continue;
      if (road.lightGroup != null) {
        const phaseT = t % CYCLE;
        const role = road.lightRole === 1 ? 1 : 0;
        if (role === 0) {
          if (phaseT < 5) road.lightPhase = 0;
          else if (phaseT < 6) road.lightPhase = 1;
          else road.lightPhase = 2;
        } else {
          // Modfase: rød mens A er grøn/gul; grøn/gul mens A er rød
          if (phaseT < 6) road.lightPhase = 2;
          else if (phaseT < 11) road.lightPhase = 0;
          else road.lightPhase = 1;
        }
        continue;
      }
      let h = 0;
      for (let i = 0; i < (road.id || '').length; i++) h = (h + road.id.charCodeAt(i) * 17) % 97;
      const phaseT = (t + h * 0.11) % 10;
      if (phaseT < 6) road.lightPhase = 0;
      else if (phaseT < 7.2) road.lightPhase = 1;
      else road.lightPhase = 2;
    }
  }

  /** Nyt lys-gruppe-id til synkroniserede kryds */
  _allocLightGroup() {
    this._nextLightGroupId = (this._nextLightGroupId | 0) + 1;
    return this._nextLightGroupId;
  }

  /**
   * Par to veje ved et kryds: modsat grøn/rød.
   */
  pairJunctionLights(roadA, tA, roadB, tB) {
    if (!roadA || !roadB) return;
    const gid = this._allocLightGroup();
    roadA.hasLight = true;
    roadA.lightT = tA != null ? tA : 0.5;
    roadA.lightGroup = gid;
    roadA.lightRole = 0;
    roadA.lightPhase = 0;
    roadB.hasLight = true;
    roadB.lightT = tB != null ? tB : 0.5;
    roadB.lightGroup = gid;
    roadB.lightRole = 1;
    roadB.lightPhase = 2;
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
    const waterFrac = strokeWaterFraction(points, this.waterBodies, this.districts);
    if (bridge || waterFrac > 0.05) {
      // Broer er dyre – især over meget vand (lidt mildere end før)
      cost = Math.round(cost * (1.85 + waterFrac * 2.0) * this.roadCostMul());
      cost = Math.max(cost, Math.round(42 * this.roadCostMul()));
    }
    return cost;
  }

  /**
   * Proper segment intersection (not shared endpoint / collinear overlap).
   * Returns true if segments AB and CD cross properly.
   * Tillader også “næsten-kryds” med lille epsilon (floating point).
   */
  _segmentsCrossProper(ax, ay, bx, by, cx, cy, dx, dy) {
    const cross = (ox, oy, px, py, qx, qy) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
    const d1 = cross(cx, cy, dx, dy, ax, ay);
    const d2 = cross(cx, cy, dx, dy, bx, by);
    const d3 = cross(ax, ay, bx, by, cx, cy);
    const d4 = cross(ax, ay, bx, by, dx, dy);
    // Strict proper intersection
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    // Næsten-kryds (endpoint-on-segment tæller ikke – det fanges af t/u-check)
    const eps = 1e-6;
    if (Math.abs(d1) < eps || Math.abs(d2) < eps || Math.abs(d3) < eps || Math.abs(d4) < eps) {
      return false;
    }
    return false;
  }

  /** Indsæt punkter langs stroke så kryds-detektion ikke misser buer. */
  _densifyPolyline(points, stepCss = 16) {
    if (!points || points.length < 2) return points || [];
    const step = Math.max(8, stepCss) * Math.max(1, this.dpr || 1);
    const out = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  /** Parameter 0–1 along polyline for a point on segment i→i+1 at local t. */
  _polylineParamAt(points, segIndex, localT) {
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segs.push(len);
      total += len;
    }
    if (total <= 0) return 0.5;
    let before = 0;
    for (let i = 0; i < segIndex - 1 && i < segs.length; i++) before += segs[i];
    const segLen = segs[segIndex - 1] || 0;
    return Math.max(0.02, Math.min(0.98, (before + localT * segLen) / total));
  }

  /**
   * Find all proper mid-crossings with existing roads (not T-junction snap).
   * Sorted by tOnNew ascending. Deduped when nearly same t.
   *
   * Vigtigt: undgå dpr-store “skip”-zoner på korte segmenter (mobil-bug:
   * skip≈70px + korte streger = ALLE kryds blev filtreret væk).
   *
   * @returns {Array<{ road, point, tOnNew, tOnOld }>}
   */
  findAllStrokeRoadCrossings(points, endSkipCss = 22) {
    if (!points || points.length < 2 || !this.roads?.length) return [];
    // Kun hele stroke-/vej-ender – IKKE hvert segment-hjørne
    const endSkip = Math.max(12, endSkipCss) * Math.max(1, this.dpr || 1);
    const found = [];
    const strokeStart = points[0];
    const strokeEnd = points[points.length - 1];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 2) continue;
      for (const road of this.roads) {
        const rp = road.points;
        if (!rp || rp.length < 2) continue;
        const roadStart = rp[0];
        const roadEnd = rp[rp.length - 1];
        for (let j = 1; j < rp.length; j++) {
          const c = rp[j - 1];
          const d = rp[j];
          const otherLen = Math.hypot(d.x - c.x, d.y - c.y);
          if (otherLen < 2) continue;
          if (!this._segmentsCrossProper(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) continue;
          const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
          const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den;
          // Kun midt på segmenter – undgår T-kryds ved vertices
          if (t < 0.04 || t > 0.96 || u < 0.04 || u > 0.96) continue;
          const ix = a.x + t * (b.x - a.x);
          const iy = a.y + t * (b.y - a.y);
          // Skip hvis kryds er ved HELE stroke-enden (T-forbindelse til eksisterende)
          const distEnd = (p) => Math.hypot(ix - p.x, iy - p.y);
          if (distEnd(strokeStart) < endSkip || distEnd(strokeEnd) < endSkip) continue;
          // Skip hvis kryds er ved HELE den eksisterende vejs ende (T ind i den)
          if (distEnd(roadStart) < endSkip * 0.85 || distEnd(roadEnd) < endSkip * 0.85) continue;

          found.push({
            road,
            point: { x: ix, y: iy },
            tOnNew: this._polylineParamAt(points, i, t),
            tOnOld: this._polylineParamAt(rp, j, u)
          });
        }
      }
    }
    found.sort((x, y) => x.tOnNew - y.tOnNew);
    const out = [];
    for (const f of found) {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.tOnNew - f.tOnNew) < 0.03) continue;
      if (prev && prev.road === f.road && Math.abs(prev.tOnNew - f.tOnNew) < 0.06) continue;
      out.push(f);
    }
    return out;
  }

  findStrokeRoadCrossing(points, endSkip = 28) {
    const all = this.findAllStrokeRoadCrossings(points, endSkip);
    return all[0] || null;
  }

  /** True if stroke crosses an existing road in the middle. */
  strokeCrossesExistingRoads(points, endSkip = 28) {
    return this.findAllStrokeRoadCrossings(points, endSkip).length > 0;
  }

  /** Punkt på polylinje ved parameter 0–1 (længde). */
  _pointAtPolylineT(points, t) {
    if (!points?.length) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segs.push(len);
      total += len;
    }
    if (total <= 0) return { x: points[0].x, y: points[0].y };
    let target = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i] || i === segs.length - 1) {
        const u = segs[i] > 0 ? Math.min(1, target / segs[i]) : 0;
        const a = points[i];
        const b = points[i + 1];
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
      target -= segs[i];
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  }

  /** Udsnit af polylinje mellem t0 og t1 (inkl. vertices imellem). */
  slicePolylineByT(points, t0, t1) {
    if (!points || points.length < 2) return points ? points.map(p => ({ x: p.x, y: p.y })) : [];
    const a = Math.max(0, Math.min(1, Math.min(t0, t1)));
    const b = Math.max(0, Math.min(1, Math.max(t0, t1)));
    if (b - a < 0.002) {
      const p = this._pointAtPolylineT(points, a);
      const q = this._pointAtPolylineT(points, Math.min(1, a + 0.01));
      return [p, q];
    }
    let total = 0;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segs.push(len);
      total += len;
    }
    const out = [this._pointAtPolylineT(points, a)];
    if (total > 0) {
      let traveled = 0;
      for (let i = 0; i < segs.length; i++) {
        traveled += segs[i];
        const tt = traveled / total;
        if (tt > a + 0.001 && tt < b - 0.001) {
          out.push({ x: points[i + 1].x, y: points[i + 1].y });
        }
      }
    }
    out.push(this._pointAtPolylineT(points, b));
    // drop zero-length duplicates
    const clean = [out[0]];
    for (let i = 1; i < out.length; i++) {
      if (Math.hypot(out[i].x - clean[clean.length - 1].x, out[i].y - clean[clean.length - 1].y) > 1.5) {
        clean.push(out[i]);
      }
    }
    if (clean.length < 2) clean.push(this._pointAtPolylineT(points, b));
    return clean;
  }

  /** Pris for trafiklys ved kryds (pakke-rabat vs. manuelt lys). */
  crossingLightCost() {
    return Math.max(22, Math.round(28 * this.roadCostMul()));
  }

  /**
   * Estimer samlet pris for en beslutningsliste (bridge|junction pr. kryds).
   * Vejen opdeles ved kryds; bro-segmenter koster bro-pris, lys tillæg pr. junction.
   */
  estimateDecisionsCost(points, crossings, decisions) {
    if (!points || points.length < 2) return 0;
    const n = crossings?.length || 0;
    if (!n) return this.estimateStrokeCost(points, { bridge: false });
    const cuts = [0, ...crossings.map(c => c.tOnNew), 1];
    let total = 0;
    const light = this.crossingLightCost();
    for (let i = 0; i < n; i++) {
      const seg = this.slicePolylineByT(points, cuts[i], cuts[i + 1]);
      const d = decisions[i] || 'junction';
      total += this.estimateStrokeCost(seg, { bridge: d === 'bridge' });
      if (d === 'junction') total += light;
    }
    // sidste stykke efter sidste kryds
    const tail = this.slicePolylineByT(points, cuts[n], 1);
    const lastD = decisions[n - 1] || 'junction';
    // Tail følger sidste valg: bro hvis bro, ellers almindelig
    total += this.estimateStrokeCost(tail, { bridge: lastD === 'bridge' });
    return Math.max(10, Math.round(total));
  }

  /** Priser til UI for aktuelt kryds + “alle resterende”. */
  getCrossingChoicePrices(points, crossings, decisions, index) {
    const n = crossings.length;
    const light = this.crossingLightCost();
    const fill = (choice) => {
      const d = decisions.slice();
      for (let i = index; i < n; i++) d[i] = choice;
      return this.estimateDecisionsCost(points, crossings, d);
    };
    const one = (choice) => {
      const d = decisions.slice();
      d[index] = choice;
      // antag samme for rest til preview af “dette kryds”-pris-delta er svær – vis estimat hvis rest = choice
      for (let i = index + 1; i < n; i++) d[i] = d[i] || 'junction';
      // For single-step display when multi: cost if this choice and rest junction (conservative for bridge button)
      if (choice === 'bridge') {
        for (let i = index + 1; i < n; i++) d[i] = 'junction';
      }
      return this.estimateDecisionsCost(points, crossings, d);
    };
    // When only one left, one === all
    const bridgeOne = one('bridge');
    const junctionOne = one('junction');
    const bridgeAll = fill('bridge');
    const junctionAll = fill('junction');
    return {
      base: this.estimateStrokeCost(points, { bridge: false }),
      light,
      bridge: bridgeOne,
      junction: junctionOne,
      bridgeAll,
      junctionAll
    };
  }

  _emitCrossingUi(pend) {
    if (!pend) {
      this.closeCrossingChoiceUi();
      return;
    }
    const idx = pend.index | 0;
    const total = pend.crossings.length;
    const prices = this.getCrossingChoicePrices(pend.points, pend.crossings, pend.decisions, idx);
    pend.bridgeCost = prices.bridge;
    pend.junctionCost = prices.junction;
    pend.bridgeAllCost = prices.bridgeAll;
    pend.junctionAllCost = prices.junctionAll;
    const cur = pend.crossings[idx];
    pend.point = cur?.point || null;
    pend.tOnNew = cur?.tOnNew;
    pend.tOnOld = cur?.tOnOld;
    pend.otherRoad = cur?.road || null;
    if (typeof this.onCrossingChoice === 'function') {
      this.onCrossingChoice({
        open: true,
        bridgeCost: prices.bridge,
        junctionCost: prices.junction,
        bridgeAllCost: prices.bridgeAll,
        junctionAllCost: prices.junctionAll,
        money: Math.floor(this.money),
        index: idx,
        total,
        multi: total > 1
      });
    }
  }

  /**
   * Åbn valg: bro eller kryds med lys (evt. flere kryds i kø).
   * @param {object} payload – points + crossings[]
   */
  openCrossingChoice(payload) {
    const crossings = payload.crossings || [];
    if (!crossings.length) return;
    this.pendingCrossing = {
      points: payload.points,
      crossings,
      decisions: new Array(crossings.length).fill(null),
      index: 0
    };
    this._emitCrossingUi(this.pendingCrossing);
  }

  closeCrossingChoiceUi() {
    if (typeof this.onCrossingChoice === 'function') {
      this.onCrossingChoice({ open: false });
    }
  }

  /** Snapshot af lys-tilstand før vi piller ved en eksisterende vej (til undo). */
  _snapshotLight(road) {
    if (!road) return null;
    return {
      roadId: road.id,
      hasLight: !!road.hasLight,
      lightT: road.lightT != null ? road.lightT : 0.5,
      lightGroup: road.lightGroup != null ? road.lightGroup : null,
      lightRole: road.lightRole === 1 ? 1 : 0,
      lightPhase: road.lightPhase | 0
    };
  }

  _restoreLightSnapshot(snap) {
    if (!snap?.roadId) return;
    const road = this.roads.find(r => r.id === snap.roadId);
    if (!road) return;
    road.hasLight = !!snap.hasLight;
    road.lightT = snap.lightT != null ? snap.lightT : 0.5;
    road.lightGroup = snap.lightGroup != null ? snap.lightGroup : null;
    road.lightRole = snap.lightRole === 1 ? 1 : 0;
    road.lightPhase = snap.lightPhase | 0;
  }

  /**
   * Byg vej ud fra færdige beslutninger (split ved kryds).
   * Hele byggeriet er ét undo-batch med fuld refund.
   */
  _commitCrossingBuild(pend) {
    const points = pend.points;
    const crossings = pend.crossings;
    const decisions = pend.decisions;
    const n = crossings.length;
    const cost = this.estimateDecisionsCost(points, crossings, decisions);
    if (this.money < cost) {
      this.showToast(`Ikke råd (mangler $${cost - Math.floor(this.money)})`);
      playError();
      return false;
    }

    const cuts = [0, ...crossings.map(c => c.tOnNew), 1];
    let anyBridge = false;
    let anyJunction = false;
    for (const d of decisions) {
      if (d === 'bridge') anyBridge = true;
      if (d === 'junction') anyJunction = true;
    }

    const batchId = `xb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const batchRoadIds = [];
    const lightRestores = [];
    // Undgå dobbelt-snapshot af samme eksisterende vej
    const snappedOld = new Set();

    this.money -= cost;
    const mid = this._pointAtPolylineT(points, 0.5);
    this.addFloatText(mid.x, mid.y, `−$${cost}`, anyBridge ? '#0369a1' : '#b91c1c');

    for (let i = 0; i < n; i++) {
      const seg = this.slicePolylineByT(points, cuts[i], cuts[i + 1]);
      const d = decisions[i];
      const isBridge = d === 'bridge';
      const isJunc = d === 'junction';
      const lightT = isJunc ? 0.9 : 0.5;
      const roadOk = this.addRoadForOwner(seg, 'player', null, 0, false, {
        isBridge,
        hasLight: isJunc,
        lightT,
        undoBatchId: batchId
      });
      if (!roadOk) continue;
      const newRoad = this.roads[this.roads.length - 1];
      if (newRoad) {
        newRoad.undoBatchId = batchId;
        batchRoadIds.push(newRoad.id);
        if (isJunc && crossings[i].road && this.roads.includes(crossings[i].road)) {
          const old = crossings[i].road;
          if (!snappedOld.has(old.id)) {
            lightRestores.push(this._snapshotLight(old));
            snappedOld.add(old.id);
          }
          this.pairJunctionLights(newRoad, lightT, old, crossings[i].tOnOld);
        } else if (isJunc) {
          newRoad.hasLight = true;
          newRoad.lightT = lightT;
        }
      }
    }
    // Tail
    const tail = this.slicePolylineByT(points, cuts[n], 1);
    const lastD = decisions[n - 1];
    this.addRoadForOwner(tail, 'player', null, 0, false, {
      isBridge: lastD === 'bridge',
      hasLight: false,
      undoBatchId: batchId
    });
    const tailRoad = this.roads[this.roads.length - 1];
    if (tailRoad) {
      tailRoad.undoBatchId = batchId;
      batchRoadIds.push(tailRoad.id);
    }
    // Fordel paidCost så sum == cost (batch.totalPaid er dog facit ved undo)
    if (batchRoadIds.length) {
      const each = Math.floor(cost / batchRoadIds.length);
      let sum = 0;
      for (let k = 0; k < batchRoadIds.length; k++) {
        const r = this.roads.find(x => x.id === batchRoadIds[k]);
        if (!r) continue;
        if (k === batchRoadIds.length - 1) r.paidCost = Math.max(0, cost - sum);
        else {
          r.paidCost = each;
          sum += each;
        }
      }
    }

    if (batchRoadIds.length) {
      this.undoBatches.push({
        id: batchId,
        roadIds: batchRoadIds.slice(),
        totalPaid: cost,
        lightRestores
      });
      // Hold stakken kort
      if (this.undoBatches.length > 40) this.undoBatches.shift();
    }

    if (anyJunction) this.tryAchievement('traffic_light');
    if (anyBridge && anyJunction) this.showToast(n > 1 ? 'Blandet: bro + lys' : 'Vej bygget');
    else if (anyBridge) this.showToast(n > 1 ? 'Broer over vejene!' : 'Bro over vejen!');
    else if (anyJunction) this.showToast(n > 1 ? 'Kryds med synkroniserede lys!' : 'Kryds med trafiklys!');
    else this.showToast('Vej bygget');

    playRoad();
    this.tryAchievement('first_road');
    this._sessionDirty = true;
    this.currentStroke = null;
    this.pendingRoadCost = 0;
    this.clearActiveSnap();
    this.requestDraw?.();
    return true;
  }

  /**
   * UI: 'bridge' | 'junction' | 'bridge_all' | 'junction_all' | 'cancel'
   */
  resolveCrossingChoice(choice) {
    const pend = this.pendingCrossing;
    if (!pend || !pend.points || pend.points.length < 2) {
      this.pendingCrossing = null;
      this.closeCrossingChoiceUi();
      return false;
    }

    if (choice === 'cancel') {
      this.pendingCrossing = null;
      this.closeCrossingChoiceUi();
      this.showToast('Vej annulleret');
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      this.requestDraw?.();
      return false;
    }

    const n = pend.crossings.length;
    const idx = pend.index | 0;

    if (choice === 'bridge_all' || choice === 'junction_all') {
      const fill = choice === 'bridge_all' ? 'bridge' : 'junction';
      for (let i = idx; i < n; i++) pend.decisions[i] = fill;
      this.pendingCrossing = null;
      this.closeCrossingChoiceUi();
      return this._commitCrossingBuild(pend);
    }

    if (choice !== 'bridge' && choice !== 'junction') {
      return false;
    }

    pend.decisions[idx] = choice;

    if (idx + 1 < n) {
      pend.index = idx + 1;
      this._emitCrossingUi(pend);
      this.showToast(`Kryds ${idx + 2}/${n} – vælg igen`);
      this.requestDraw?.();
      return true;
    }

    // Alle valgt
    this.pendingCrossing = null;
    this.closeCrossingChoiceUi();
    return this._commitCrossingBuild(pend);
  }

  /** Vælg mission til vejviser på kortet (fra→til). */
  setGuideJob(jobId, seconds = 18) {
    this.guideJobId = jobId != null ? jobId : null;
    this.guideJobUntil = jobId != null
      ? (this.sessionTime || 0) + Math.max(4, seconds)
      : 0;
    if (jobId != null) {
      const job = this.jobs.find(j => j.id === jobId && j.active);
      if (job) {
        const from = this.districts.find(d => d.name === job.from.name) || job.from;
        const to = this.districts.find(d => d.name === job.to.name) || job.to;
        if (from && to) {
          // Fit kamera omkring ruten (let padding)
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const dist = Math.hypot(to.x - from.x, to.y - from.y);
          const z = Math.max(0.45, Math.min(1.35, (Math.min(this.canvas.width, this.canvas.height) * 0.55) / Math.max(220, dist + 180)));
          this.camera.zoom = z;
          this.camera.x = this.canvas.width / 2 - midX * z;
          this.camera.y = this.canvas.height / 2 - midY * z;
          this.showToast(`Vejviser: ${from.name} → ${to.name}`);
        }
      }
    }
    this.requestDraw?.();
  }

  clearGuideJob() {
    this.guideJobId = null;
    this.guideJobUntil = 0;
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
    let snapped = this.findSnapPoint(p.x, p.y);
    snapped = this.pushOutOfHubs(this.clampToWorld(snapped), { endpoint: true });
    // Undgå start midt i åbent vand (medmindre bro-mode)
    if (this.mode !== 'bridge' && pointInWater(snapped.x, snapped.y, this.waterBodies, this.districts)) {
      this.showToast('Start på land – eller brug Bro over vand');
      this.currentStroke = null;
      this.clearActiveSnap();
      return;
    }
    this.currentStroke = [{ x: snapped.x, y: snapped.y }];
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
    // Start på land-kant (havn må ikke starte i vand)
    let start = this.landEdgeFromDistrict(district, aim.x, aim.y);
    start = this.pushOutOfHubs(this.clampToWorld(this.findSnapPoint(start.x, start.y)), { endpoint: true });
    this.currentStroke = [{ x: start.x, y: start.y }];
    // Second point toward finger – også på land / uden for hub
    let mid = this.clampToWorld({
      x: start.x + Math.cos(ang) * 22 * this.dpr,
      y: start.y + Math.sin(ang) * 22 * this.dpr
    });
    mid = this.pushOutOfHubs(mid, { endpoint: false });
    // Hvis mid rammer vand uden bro-mode: skub indad mod land langs fra by
    if (this.mode !== 'bridge' && pointInWater(mid.x, mid.y, this.waterBodies, this.districts)) {
      mid = this.landEdgeFromDistrict(district, aim.x, aim.y);
      mid = this.clampToWorld({
        x: mid.x + Math.cos(ang) * 12 * this.dpr,
        y: mid.y + Math.sin(ang) * 12 * this.dpr
      });
      mid = this.pushOutOfHubs(mid, { endpoint: false });
    }
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
      // Ikke gennem by-kerne / under bygninger
      pt = this.pushOutOfHubs(pt, { endpoint: false });
      // Ikke frit ud i vand uden bro-mode (tillad kyst-ring via districts i pointInWater)
      if (this.mode !== 'bridge' && pointInWater(pt.x, pt.y, this.waterBodies, this.districts)) {
        // Drop point i vand – hold forrige; spilleren skal bruge bro
        this.updateActiveSnap(p.x, p.y);
        return;
      }
      this.currentStroke.push(pt);
      const isBridge = this.mode === 'bridge'
        || this.strokeCrossesExistingRoads(this.currentStroke);
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
    // Veje må ikke ligge under byer/bygninger – skub midterpunkter til hub-kant
    points = this.sanitizeStrokeThroughHubs(points);
    points = this.snapEndpoints(points);
    points = points.map((p, i) => this.pushOutOfHubs(this.clampToWorld(p), {
      endpoint: i === 0 || i === points.length - 1
    }));
    if (points.length < 2) {
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      return;
    }

    const waterFrac = strokeWaterFraction(points, this.waterBodies, this.districts);
    const wantBridge = this.mode === 'bridge';
    const crossesWater = waterFrac > 0.08;
    // Densify til mere pålidelig kryds-detektion (lange buer / få vertices)
    const detectPts = this._densifyPolyline(points, 16);
    const crossings = this.findAllStrokeRoadCrossings(detectPts);
    const crossesRoad = crossings.length > 0;

    if (crossesWater && !wantBridge) {
      this.showToast('Over vand: brug Bro-værktøjet');
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      const mid = points[Math.floor(points.length / 2)];
      this.addArrivalParticles(mid.x, mid.y, '#0ea5e9');
      return;
    }

    // Vej over vej (ikke vand, ikke bro-værktøj): vælg bro/lys pr. kryds (eller alle)
    if (crossesRoad && !wantBridge && !crossesWater) {
      // Map tOnNew fra detectPts til original points (samme geometri)
      const crossingsOnOrig = this.findAllStrokeRoadCrossings(points);
      const useCrossings = crossingsOnOrig.length ? crossingsOnOrig : crossings;
      const usePoints = crossingsOnOrig.length ? points : detectPts;
      const prices = this.getCrossingChoicePrices(
        usePoints, useCrossings, new Array(useCrossings.length).fill(null), 0
      );
      const minCost = Math.min(prices.bridgeAll, prices.junctionAll, prices.bridge, prices.junction);
      if (this.money < minCost) {
        this.showToast(`Ikke råd (mangler $${minCost - Math.floor(this.money)})`);
        this.currentStroke = null;
        this.pendingRoadCost = 0;
        this.clearActiveSnap();
        const end = points[points.length - 1];
        this.addArrivalParticles(end.x, end.y, '#ef4444');
        return;
      }
      this.openCrossingChoice({
        points: usePoints.map(p => ({ x: p.x, y: p.y })),
        crossings: useCrossings
      });
      this.currentStroke = null;
      this.pendingRoadCost = 0;
      this.clearActiveSnap();
      this.showToast(
        useCrossings.length > 1
          ? `${useCrossings.length} kryds – vælg pr. kryds eller alle`
          : 'Vælg: bro eller kryds med lys'
      );
      return;
    }

    // Bro: manuelt værktøj eller over vand
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
    if (isBridge) {
      if (crossesWater) this.showToast('Bro bygget over vand!');
      else this.showToast('Bro-segment (dyrt)');
    }
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
    const road = new Road(points, {
      owner,
      ownerColor,
      lanes: opts.lanes != null ? opts.lanes : 2, // tovejs som standard
      isBridge: !!opts.isBridge,
      paidCost: paid,
      hasLight: !!opts.hasLight,
      lightT: opts.lightT != null ? opts.lightT : 0.5,
      lightGroup: opts.lightGroup != null ? opts.lightGroup : null,
      lightRole: opts.lightRole === 1 ? 1 : 0
    });
    if (opts.undoBatchId) road.undoBatchId = opts.undoBatchId;
    this.roads.push(road);
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
    this.sessionXp = (this.sessionXp || 0) + result.amount;

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
    // Find seneste spiller-vej
    let lastIdx = -1;
    for (let i = this.roads.length - 1; i >= 0; i--) {
      if (this.roads[i].owner === 'player') {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx < 0) {
      this.showToast('Intet at fortryde');
      return;
    }

    const last = this.roads[lastIdx];
    const batchId = last.undoBatchId || null;

    // Multi-kryds / split-strøg: ét undo fjerner hele batch + fuld refund + lys-restore
    if (batchId) {
      let batch = null;
      for (let b = this.undoBatches.length - 1; b >= 0; b--) {
        if (this.undoBatches[b].id === batchId) {
          batch = this.undoBatches[b];
          this.undoBatches.splice(b, 1);
          break;
        }
      }
      const idSet = new Set(
        batch?.roadIds?.length
          ? batch.roadIds
          : this.roads.filter(r => r.undoBatchId === batchId).map(r => r.id)
      );
      let refund = 0;
      if (batch && batch.totalPaid != null) {
        refund = Math.max(0, batch.totalPaid | 0);
      } else {
        for (const r of this.roads) {
          if (idSet.has(r.id)) {
            refund += Math.max(0, r.paidCost || this.roadCostForLength(r.length));
          }
        }
      }
      // Fjern biler på batch-veje
      this.vehicles = this.vehicles.filter(v => !v.currentRoad || !idSet.has(v.currentRoad.id));
      this.roads = this.roads.filter(r => !idSet.has(r.id));
      // Gendan lys på eksisterende veje som blev parret
      if (batch?.lightRestores?.length) {
        for (const snap of batch.lightRestores) this._restoreLightSnapshot(snap);
      }
      this.money += refund;
      const n = idSet.size;
      this.showToast(
        refund
          ? `Undo · ${n} stykke${n === 1 ? '' : 'r'} · +$${refund} (fuld refund)`
          : `Undo · ${n} stykke${n === 1 ? '' : 'r'}`
      );
      this._sessionDirty = true;
      this.requestDraw();
      return;
    }

    // Enkelt vej
    const refund = Math.max(
      0,
      last.paidCost || this.roadCostForLength(last.length)
    );
    this.money += refund;
    this.vehicles = this.vehicles.filter(v => v.currentRoad !== last);
    this.roads.splice(lastIdx, 1);
    this.showToast(refund ? `Undo · +$${refund} (fuld refund)` : 'Undo');
    this._sessionDirty = true;
    this.requestDraw();
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
    // Match tilemap hex når muligt
    if (this.tileMap?.hexSize) return this.tileMap.hexSize;
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
          else if (vehicle.classId === 'van') classFit = remaining <= 6 ? 40 : 22;
          else if (vehicle.classId === 'truck_std') classFit = 15;
        } else if (job.type === 'express') {
          if (vehicle.classId === 'car_fast') classFit = 70;
          else if (vehicle.classId === 'van') classFit = 25;
          else if (vehicle.classId === 'car_std') classFit = 10;
          else if (vehicle.classId === 'bus') classFit = -10; // bus er ikke ekspres
        } else if (job.type === 'tourist') {
          if (vehicle.classId === 'bus') classFit = 65;
          else if (vehicle.classId === 'car_std') classFit = 40;
          else if (vehicle.classId === 'car_fast') classFit = 35;
        } else {
          // passengers
          if (vehicle.classId === 'bus') classFit = remaining >= 4 ? 70 : 45;
          else if (vehicle.classId === 'car_fast') classFit = remaining <= 6 ? 50 : 18;
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

      // F1: fleet vehicles park empty at destination
      if (vehicle.fleetOwned) {
        const parkAt = (job && this.districts.find(d => d.name === job.to.name))
          || vehicle.target
          || this.districts[0];
        vehicle.cargo = 0;
        vehicle.haulPhase = 'idle';
        vehicle.parkIdle(parkAt, this.roads);
      } else {
        vehicle.cargo = 0;
      }
    } else {
      const bot = this.bots.find(b => b.id === vehicle.owner);
      if (bot) {
        bot.onDelivery(reward, applied);
        this.addFloatText(vehicle.x, vehicle.y - 10, `${bot.name} +$${reward}`, bot.color);
      }
      vehicle.cargo = 0;
    }

    this.addArrivalParticles(vehicle.x, vehicle.y, vehicle.color);
  }

  updateRoadDensities() {
    for (const road of this.roads) road.density = 0;
    for (const v of this.vehicles) {
      if (v.currentRoad) v.currentRoad.density = (v.currentRoad.density || 0) + 1;
    }
  }

  /**
   * IMP-A2: find worst player-road congestion for UI + glow.
   * dens threshold: ≥3 orange, ≥5 critical (after lanes).
   */
  refreshBottleneck() {
    let best = null;
    let bestDens = 2.4;
    for (const road of this.roads) {
      if (road.owner && road.owner !== 'player') continue;
      const dens = road.effectiveDensity != null
        ? road.effectiveDensity
        : (road.density || 0) / Math.max(1, road.lanes || 1);
      if (dens > bestDens) {
        bestDens = dens;
        const mid = road.getPointAt?.(0.5) || road.points?.[Math.floor((road.points?.length || 1) / 2)];
        best = { road, dens, mid, critical: dens >= 5 };
      }
    }
    this.bottleneck = best;
    return best;
  }

  /** Hint copy for tools that fix traffic */
  getBottleneckHint(bn = this.bottleneck) {
    if (!bn) return null;
    const r = bn.road;
    const parts = [];
    if ((r.lanes | 0) < 3) parts.push('🛣️ motorvej');
    if (!r.oneWay) parts.push('➡️ envejs');
    if (!r.hasLight) parts.push('🚦 lys');
    const tools = parts.length ? parts.join(' / ') : 'flere veje eller færre biler';
    return {
      dens: bn.dens,
      critical: bn.critical,
      short: bn.critical ? 'Trafikprop!' : 'Kø opbygges',
      text: bn.critical
        ? `Trafikprop – prøv ${tools}`
        : `Kø på vej – overvej ${tools}`,
      mid: bn.mid
    };
  }

  /** Camera + toast when user taps “Vis” on bottleneck strip */
  focusBottleneck() {
    const bn = this.bottleneck || this.refreshBottleneck();
    if (!bn?.mid) {
      this.showToast('Ingen kø lige nu');
      return false;
    }
    const z = this.clampZoom(Math.max(this.camera.zoom || 1, 1.2));
    this.camera.zoom = z;
    const cw = this.canvas.width || 1;
    const ch = this.canvas.height || 1;
    this.camera.x = cw / 2 - bn.mid.x * z;
    this.camera.y = ch / 2 - bn.mid.y * z;
    const h = this.getBottleneckHint(bn);
    if (h) this.showToast(h.text, 2.8);
    this.requestDraw();
    return true;
  }

  tickBottleneck(dt) {
    this.bottleneckTimer += dt;
    this.bottleneckToastCooldown = Math.max(0, this.bottleneckToastCd - dt);
    if (this.bottleneckTimer < 1.1) return;
    this.bottleneckTimer = 0;
    this.refreshBottleneck();
    const h = this.getBottleneckHint();
    if (h?.critical && this.bottleneckToastCd <= 0) {
      this.showToast(h.text, 2.6);
      this.bottleneckToastCd = 14;
      if (h.mid) {
        this.addFloatText(h.mid.x, h.mid.y - 16, 'KØ!', '#e11d48');
      }
    }
  }

  getBottleneckUi() {
    const h = this.getBottleneckHint();
    if (!h) return { active: false };
    return {
      active: true,
      critical: h.critical,
      text: h.short,
      detail: h.text,
      dens: Math.round(h.dens * 10) / 10
    };
  }

  drawBottleneckGlow(ctx) {
    const bn = this.bottleneck;
    if (!bn?.road || !bn.mid) return;
    const dpr = this.dpr || 1;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
    const r = bn.road;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.22 + 0.18 * pulse;
    ctx.strokeStyle = bn.critical ? '#ef4444' : '#f97316';
    ctx.lineWidth = (bn.critical ? 28 : 22) * dpr;
    ctx.beginPath();
    r.path(ctx);
    ctx.stroke();
    ctx.globalAlpha = 0.55 + 0.25 * pulse;
    ctx.fillStyle = bn.critical ? '#f43f5e' : '#fb923c';
    ctx.beginPath();
    ctx.arc(bn.mid.x, bn.mid.y, (10 + pulse * 4) * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    ctx.font = `bold ${Math.max(11, 12 * dpr)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    const label = bn.critical ? '⚠ Kø' : 'Kø';
    ctx.strokeText(label, bn.mid.x, bn.mid.y - 14 * dpr);
    ctx.fillStyle = bn.critical ? '#9f1239' : '#c2410c';
    ctx.fillText(label, bn.mid.x, bn.mid.y - 14 * dpr);
    ctx.restore();
  }

  update(dt) {
    if (this.paused || !this.running) return;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast = null;
    }

    // P1-3 rush + P1-4 growth + P2-1 lights + P3-1 vejr/tid + flaskehals
    this.tickRushHour(dt);
    this.tickDistrictGrowth(dt);
    this.tickTrafficLights();
    this.tickAtmosphere(dt);
    this.tickBottleneck(dt);
    this.tickFlow(dt);

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
        // Two-leg haul: arrived at pickup empty → load, then go to destination
        if (v.haulPhase === 'to_pickup') {
          v.loadAtPickup();
          continue;
        }
        // Loaded arrival at destination → unload / complete
        this.completeDelivery(v);
        if (!v.fleetOwned) {
          this.vehicles.splice(i, 1);
        }
        // fleetOwned already parked empty inside completeDelivery → parkIdle
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
    // Udløb vejviser
    if (this.guideJobId != null && this.guideJobUntil > 0
      && (this.sessionTime || 0) > this.guideJobUntil) {
      this.clearGuideJob();
    }

    const active = this.jobs.filter(j => j.active);
    const guided = this.guideJobId != null
      ? active.find(j => j.id === this.guideJobId)
      : null;

    for (const job of active) {
      const from = this.districts.find(d => d.name === job.from.name) || job.from;
      const to = this.districts.find(d => d.name === job.to.name) || job.to;
      if (!from || !to) continue;

      const meta = job.typeMeta || JOB_TYPES[job.type] || JOB_TYPES.passengers;
      const hex = meta.color || '#2563eb';
      const isGuide = guided && job.id === guided.id;
      // Når vejviser er aktiv: dæmp andre, fremhæv valgte
      if (guided && !isGuide) {
        const left = Math.max(0, job.amount - job.delivered);
        this.drawBadge(ctx, from.x, from.y - from.r - 14 * this.dpr, `${meta.icon}${left}`, 'rgba(120,113,108,0.55)');
        continue;
      }

      const alpha = isGuide ? 0.92 : 0.38;
      const lw = (isGuide ? 4.5 : 2) * this.dpr;
      const dashOff = isGuide ? -((this.sessionTime || 0) * 48) % 40 : 0;
      ctx.beginPath();
      ctx.setLineDash(isGuide
        ? [10 * this.dpr, 8 * this.dpr]
        : [6 * this.dpr, 8 * this.dpr]);
      ctx.lineDashOffset = dashOff;
      ctx.strokeStyle = hex.length === 7
        ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`
        : `rgba(37, 99, 235, ${alpha})`;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      if (isGuide) {
        this.drawJobWayfinder(ctx, from, to, hex, meta);
      }

      const left = Math.max(0, job.amount - job.delivered);
      this.drawBadge(ctx, from.x, from.y - from.r - 14 * this.dpr, `${meta.icon}${left}`, hex);
      this.drawBadge(ctx, to.x, to.y - to.r - 14 * this.dpr, '⚑', '#059669');
    }
  }

  /** Smart vejviser: pulserende FRA/TIL + retningspile langs ruten */
  drawJobWayfinder(ctx, from, to, hex, meta) {
    const dpr = this.dpr || 1;
    const t = this.sessionTime || 0;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);

    const parseRgb = (h) => {
      if (!h || h.length !== 7) return [37, 99, 235];
      return [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16)
      ];
    };
    const [cr, cg, cb] = parseRgb(hex);

    // Glow rings
    for (const [p, label, col] of [
      [from, 'FRA', `rgba(${cr},${cg},${cb},`],
      [to, 'TIL', 'rgba(5,150,105,']
    ]) {
      const r0 = (p.r || 28) + 10 * dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r0 + 8 * dpr * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `${col}${(0.55 * pulse).toFixed(3)})`;
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r0 + 18 * dpr * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `${col}${(0.22 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // Label pill
      ctx.font = `bold ${Math.max(11, 12 * dpr)}px system-ui`;
      const tw = ctx.measureText(label).width;
      const padX = 7 * dpr;
      const ph = 16 * dpr;
      const pw = tw + padX * 2;
      const lx = p.x;
      const ly = p.y + (p.r || 28) + 22 * dpr;
      ctx.fillStyle = label === 'FRA'
        ? `rgba(${cr},${cg},${cb},0.92)`
        : 'rgba(5, 150, 105, 0.92)';
      ctx.beginPath();
      const rr = 7 * dpr;
      const bx = lx - pw / 2;
      const by = ly - ph / 2;
      ctx.moveTo(bx + rr, by);
      ctx.arcTo(bx + pw, by, bx + pw, by + ph, rr);
      ctx.arcTo(bx + pw, by + ph, bx, by + ph, rr);
      ctx.arcTo(bx, by + ph, bx, by, rr);
      ctx.arcTo(bx, by, bx + pw, by, rr);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly + 0.5 * dpr);
    }

    // Chevrons along the line (animated)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const n = Math.max(2, Math.min(8, Math.floor(len / (70 * dpr))));
    const phase = (t * 0.35) % 1;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.85)`;
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n + phase * 0.15) % 1;
      if (u < 0.08 || u > 0.92) continue;
      const cx = from.x + ux * len * u;
      const cy = from.y + uy * len * u;
      const s = 7 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + ux * s, cy + uy * s);
      ctx.lineTo(cx - ux * s * 0.55 + px * s * 0.7, cy - uy * s * 0.55 + py * s * 0.7);
      ctx.lineTo(cx - ux * s * 0.55 - px * s * 0.7, cy - uy * s * 0.55 - py * s * 0.7);
      ctx.closePath();
      ctx.fill();
    }

    // Midt-label med ikon
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const midLabel = `${meta?.icon || '•'} rute`;
    ctx.font = `bold ${Math.max(11, 11.5 * dpr)}px system-ui`;
    const mtw = ctx.measureText(midLabel).width;
    const mpad = 6 * dpr;
    const mh = 18 * dpr;
    const mw = mtw + mpad * 2;
    ctx.fillStyle = 'rgba(28, 25, 23, 0.78)';
    ctx.beginPath();
    {
      const rr = 8 * dpr;
      const bx = mx - mw / 2;
      const by = my - mh / 2 - 12 * dpr;
      ctx.moveTo(bx + rr, by);
      ctx.arcTo(bx + mw, by, bx + mw, by + mh, rr);
      ctx.arcTo(bx + mw, by + mh, bx, by + mh, rr);
      ctx.arcTo(bx, by + mh, bx, by, rr);
      ctx.arcTo(bx, by, bx + mw, by, rr);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = '#fafaf9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(midLabel, mx, my - 12 * dpr + 0.5 * dpr);
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
    // Soft “online” ring when a road touches the hub
    d._connected = !!this.findNearestRoadPoint(d.x, d.y, d.r + 95);
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

  /**
   * Find fletninger: endpoint-T + midt-midt X-kryds mellem veje.
   * @returns {Map<Road, { joinStart:boolean, joinEnd:boolean, joins:Array }>}
   */
  _computeRoadJoins() {
    const dpr = this.dpr || 1;
    const thresh = Math.max(14, this.getSnapDistance() * dpr * 0.72);
    const map = new Map();
    const roads = this.roads || [];
    for (const road of roads) {
      map.set(road, { joinStart: false, joinEnd: false, joins: [] });
    }
    const markEnd = (road, which, point) => {
      const m = map.get(road);
      if (!m) return;
      if (which === 'start') m.joinStart = true;
      else m.joinEnd = true;
      m.joins.push(point);
    };
    const markMid = (point) => {
      // X-kryds: begge veje får pad (ingen end-cap-ændring nødvendig)
      for (const road of roads) {
        const m = map.get(road);
        if (m) m.joins.push(point);
      }
    };

    // Endpoint joins (T + end-end)
    for (let i = 0; i < roads.length; i++) {
      const r1 = roads[i];
      const ends1 = [
        { which: 'start', p: r1.points[0] },
        { which: 'end', p: r1.points[r1.points.length - 1] }
      ];
      for (const e1 of ends1) {
        if (!e1.p) continue;
        for (let j = 0; j < roads.length; j++) {
          if (i === j) continue;
          const r2 = roads[j];
          for (const p2 of [r2.points[0], r2.points[r2.points.length - 1]]) {
            if (!p2) continue;
            if (Math.hypot(e1.p.x - p2.x, e1.p.y - p2.y) < thresh) {
              markEnd(r1, e1.which, { x: (e1.p.x + p2.x) / 2, y: (e1.p.y + p2.y) / 2 });
            }
          }
          const c = r2.closestPoint(e1.p.x, e1.p.y);
          if (c && c.dist < thresh * 0.95 && c.t > 0.06 && c.t < 0.94) {
            markEnd(r1, e1.which, { x: c.point.x, y: c.point.y });
          }
        }
      }
    }

    // Midt–midt X-kryds (to veje krydser midt på segmenter)
    for (let i = 0; i < roads.length; i++) {
      const r1 = roads[i];
      const p1 = r1.points;
      if (!p1 || p1.length < 2) continue;
      for (let j = i + 1; j < roads.length; j++) {
        const r2 = roads[j];
        const p2 = r2.points;
        if (!p2 || p2.length < 2) continue;
        for (let a = 1; a < p1.length; a++) {
          const A = p1[a - 1];
          const B = p1[a];
          for (let b = 1; b < p2.length; b++) {
            const C = p2[b - 1];
            const D = p2[b];
            if (!this._segmentsCrossProper(A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y)) continue;
            const den = (A.x - B.x) * (C.y - D.y) - (A.y - B.y) * (C.x - D.x);
            if (Math.abs(den) < 1e-9) continue;
            const t = ((A.x - C.x) * (C.y - D.y) - (A.y - C.y) * (C.x - D.x)) / den;
            const u = -((A.x - B.x) * (A.y - C.y) - (A.y - B.y) * (A.x - C.x)) / den;
            if (t < 0.05 || t > 0.95 || u < 0.05 || u > 0.95) continue;
            const ix = A.x + t * (B.x - A.x);
            const iy = A.y + t * (B.y - A.y);
            // undgå vej-ender (allerede dækket)
            const nearTip = (road, p) => {
              const s = road.points[0];
              const e = road.points[road.points.length - 1];
              return Math.hypot(p.x - s.x, p.y - s.y) < thresh
                || Math.hypot(p.x - e.x, p.y - e.y) < thresh;
            };
            if (nearTip(r1, { x: ix, y: iy }) || nearTip(r2, { x: ix, y: iy })) continue;
            const pt = { x: ix, y: iy, cross: true };
            map.get(r1)?.joins.push(pt);
            map.get(r2)?.joins.push(pt);
          }
        }
      }
    }
    return map;
  }

  /**
   * Tegn rene asfalt-pads i T/X-kryds (dækker pølse-overlap).
   */
  drawRoadJunctions(ctx, joinMeta) {
    const dpr = this.dpr || 1;
    const pads = [];
    const mergeDist = 14 * dpr;

    for (const road of this.roads) {
      const m = joinMeta?.get(road);
      if (!m?.joins?.length) continue;
      const st = road.getDrawStyle?.(dpr) || { wBody: 18 * dpr, asphalt: '#5c5a62', edge: '#2a2623' };
      for (const j of m.joins) {
        pads.push({
          x: j.x,
          y: j.y,
          r: st.wBody * (j.cross ? 0.72 : 0.58),
          asphalt: st.asphalt,
          edge: st.edge,
          hi: st.asphaltHi || '#7a7882',
          cross: !!j.cross
        });
      }
    }

    const used = new Array(pads.length).fill(false);
    const merged = [];
    for (let i = 0; i < pads.length; i++) {
      if (used[i]) continue;
      let x = pads[i].x;
      let y = pads[i].y;
      let r = pads[i].r;
      let n = 1;
      let asphalt = pads[i].asphalt;
      let edge = pads[i].edge;
      let hi = pads[i].hi;
      let cross = pads[i].cross;
      used[i] = true;
      for (let j = i + 1; j < pads.length; j++) {
        if (used[j]) continue;
        if (Math.hypot(pads[j].x - x / n, pads[j].y - y / n) < mergeDist + r * 0.35) {
          used[j] = true;
          x += pads[j].x;
          y += pads[j].y;
          r = Math.max(r, pads[j].r);
          n++;
          if (pads[j].cross) cross = true;
        }
      }
      merged.push({
        x: x / n,
        y: y / n,
        r: r * (n > 1 || cross ? 1.12 : 1),
        asphalt,
        edge,
        hi,
        cross
      });
    }

    for (const p of merged) {
      // ydre curb
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = p.edge;
      ctx.globalAlpha = 0.96;
      ctx.fill();
      // asfalt
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.asphalt;
      ctx.fill();
      // highlight
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.15, p.y - p.r * 0.18, p.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = p.hi;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      // X-kryds: lille hvid “+” markering
      if (p.cross) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.4 * dpr;
        ctx.lineCap = 'round';
        const s = p.r * 0.28;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, p.r * 0.1), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill();
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cam = this.camera;

    // Outside playable board = deep warm void
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const voidG = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    voidG.addColorStop(0, '#3a342e');
    voidG.addColorStop(1, '#1c1917');
    ctx.fillStyle = voidG;
    ctx.fillRect(0, 0, w, h);

    // World transform
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

    this.drawBackground(ctx, this.worldW || w * 1.95, this.worldH || h * 1.95);

    // Roads: detect fletninger (T/X) så ends ikke tegnes som runde pølser
    const joinMeta = this._computeRoadJoins();
    for (const road of this.roads) {
      const m = joinMeta.get(road) || { joinStart: false, joinEnd: false };
      road.draw(ctx, this.dpr, m);
    }
    // Kryds-pads oven på veje (samler fletning rent)
    this.drawRoadJunctions(ctx, joinMeta);
    // IMP-A2: highlight worst congestion after road draw
    this.drawBottleneckGlow(ctx);

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
    } else if (this.pendingCrossing?.points?.length > 1) {
      // Ghost mens spilleren vælger bro/kryds (alle kryds markeres; aktiv pulserer)
      const pts = this.pendingCrossing.points;
      const crosses = this.pendingCrossing.crossings || [];
      const idx = this.pendingCrossing.index | 0;
      ctx.beginPath();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 14 * this.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.22;
      ctx.setLineDash([10 * this.dpr, 8 * this.dpr]);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const pulse = 0.6 + 0.4 * Math.sin((this.sessionTime || 0) * 4);
      crosses.forEach((cr, i) => {
        if (!cr?.point) return;
        const active = i === idx;
        const decided = this.pendingCrossing.decisions?.[i];
        let col = `rgba(245, 158, 11, ${active ? 0.85 * pulse : 0.35})`;
        if (decided === 'bridge') col = 'rgba(3, 105, 161, 0.7)';
        if (decided === 'junction') col = 'rgba(22, 163, 74, 0.7)';
        ctx.beginPath();
        ctx.arc(cr.point.x, cr.point.y, (active ? 12 : 8) * this.dpr * (active ? pulse : 1), 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = (active ? 3 : 2) * this.dpr;
        ctx.stroke();
      });
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

  /** P3-1: soft day/night + weather overlay (screen space). Hold alphas lave – undgå “hvidt skær”. */
  drawAtmosphereOverlay(ctx, w, h) {
    const t = this.timeOfDay ?? 0.4;
    // Night darkness: peak at midnight (0 and 1) – dæmpet så spillet ikke gråner
    const night = Math.max(0, Math.cos((t - 0.5) * Math.PI * 2));
    const dark = Math.pow(Math.max(0, night - 0.22), 1.35) * 0.26;
    if (dark > 0.03) {
      ctx.fillStyle = `rgba(15, 23, 42, ${dark.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      // Meget blød varm top – ingen guld-slør over hele skærmen
      if (dark > 0.14) {
        ctx.fillStyle = `rgba(251, 191, 36, ${(dark * 0.025).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h * 0.22);
      }
    }
    // Dawn / dusk tint (svag)
    if (t > 0.2 && t < 0.35) {
      const a = (1 - Math.abs(t - 0.28) / 0.1) * 0.06;
      if (a > 0.01) {
        ctx.fillStyle = `rgba(251, 146, 60, ${a.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else if (t > 0.62 && t < 0.78) {
      const a = (1 - Math.abs(t - 0.7) / 0.1) * 0.07;
      if (a > 0.01) {
        ctx.fillStyle = `rgba(244, 114, 182, ${a.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    if (this.weather === 'rain') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.035)';
      ctx.fillRect(0, 0, w, h);
      const dpr = this.dpr || 1;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
      ctx.lineWidth = 1.2 * dpr;
      const n = 22;
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
      // Kun kant-slør – undgå flad hvid film midt på skærmen
      const g = ctx.createRadialGradient(
        w * 0.5, h * 0.5, Math.min(w, h) * 0.22,
        w * 0.5, h * 0.5, Math.max(w, h) * 0.62
      );
      g.addColorStop(0, 'rgba(241, 245, 249, 0)');
      g.addColorStop(0.55, 'rgba(226, 232, 240, 0.04)');
      g.addColorStop(1, 'rgba(148, 163, 184, 0.12)');
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
    return this.jobs.filter(j => j.active).map(j => {
      const left = Math.max(0, (j.amount | 0) - (j.delivered | 0));
      const meta = j.typeMeta || {};
      return {
        id: j.id,
        label: jobLabel(j),
        progress: j.amount ? j.delivered / j.amount : 0,
        type: j.type,
        reward: j.reward,
        from: j.from?.name || '?',
        to: j.to?.name || '?',
        icon: meta.icon || '•',
        unit: meta.unit || '',
        amount: j.amount | 0,
        delivered: j.delivered | 0,
        remaining: left
      };
    });
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
