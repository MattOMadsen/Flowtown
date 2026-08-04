/**
 * Input: draw roads (incl. from city edge), tap city center = shop,
 * pan via long-press, two-finger, arrows, space/right-click — not a bad Flyt-button.
 */

export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.drawing = false;
    this.panning = false;
    this.spaceDown = false;
    this.panLast = null;
    this.pinch = null;
    this.pendingDistrict = null;
    this.downPos = null;
    this.movedPx = 0;
    this.longPressTimer = null;
    this.longPressPan = false;
    /** Touch: vent med vejtegning indtil 2. finger er ude af billedet / flyt bekræftet */
    this.deferDraw = false;
    this.pinchJustEnded = false;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseleave', () => {
      if (this.drawing && !this.panning) this.onUp();
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = true;
        e.preventDefault();
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const map = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down'
        };
        this.game.panNudge?.(map[e.key]);
      }
      if (e.key === '+' || e.key === '=') this.game.zoomBy(1.15);
      if (e.key === '-' || e.key === '_') this.game.zoomBy(1 / 1.15);
      // Drej kamera (kun yaw) – Q/E eller [ ]
      if (e.key === 'q' || e.key === 'Q' || e.key === '[') {
        e.preventDefault();
        this.game.rotateBy?.(-Math.PI / 12);
      }
      if (e.key === 'e' || e.key === 'E' || e.key === ']') {
        e.preventDefault();
        this.game.rotateBy?.(Math.PI / 12);
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.game.resetCamera();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // 2+ fingre: zoom/drej – ALDRIG læg vej (annuller evt. streg, commit ikke)
      if (e.touches.length >= 2) {
        this.clearLongPress();
        this.cancelDrawIfAny();
        this.pendingDistrict = null;
        this.deferDraw = false;
        this.startPinch(e.touches);
        return;
      }
      if (e.touches.length === 1 && !this.pinch) {
        // Efter pinch: ignorer den finger der bliver tilbage kortvarigt
        if (this.pinchJustEnded) {
          this.pinchJustEnded = false;
          return;
        }
        // Touch: udskyd beginStroke til flyt – ellers sættes vej før 2. finger rammer
        this.onDown(e.touches[0], { deferDraw: true });
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        this.cancelDrawIfAny();
        this.deferDraw = false;
        if (!this.pinch) this.startPinch(e.touches);
        else this.movePinch(e.touches);
        return;
      }
      if (e.touches.length === 1 && !this.pinch) {
        const t = e.touches[0];
        // Start udskudt vejtegning ved reel flyt (ikke bare finger-plant)
        if (this.deferDraw && this.downPos) {
          const pos = this.getPos(t);
          this.movedPx = Math.hypot(pos.x - this.downPos.x, pos.y - this.downPos.y);
          if (this.movedPx > 12) {
            this.commitDeferredDraw(t);
          }
        }
        if (this.panning) this.onPanMove(t);
        else this.onMove(t);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) return;
      if (e.touches.length === 1) {
        // Gik fra pinch → 1 finger: ikke start tegning med den sidste finger
        if (this.pinch) {
          this.pinch = null;
          this.pinchJustEnded = true;
          this.panning = false;
          this.panLast = null;
          this.cancelDrawIfAny();
          this.deferDraw = false;
        }
        return;
      }
      // 0 fingre
      const wasPinch = !!this.pinch;
      this.pinch = null;
      this.panning = false;
      this.panLast = null;
      if (wasPinch) {
        this.pinchJustEnded = true;
        this.cancelDrawIfAny();
        this.deferDraw = false;
        this.downPos = null;
        this.movedPx = 0;
        this.pendingDistrict = null;
        this.drawing = false;
        return;
      }
      // Tap uden flyt (slet/opgrader/lys/shop) – kør deferred down-handling
      if (this.deferDraw && this.movedPx <= 12) {
        this.fireDeferredTap();
      }
      this.deferDraw = false;
      this.onUp();
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.pinch = null;
      this.panning = false;
      this.panLast = null;
      this.clearLongPress();
      this.cancelDrawIfAny();
      this.deferDraw = false;
      this.drawing = false;
      this.downPos = null;
      this.pendingDistrict = null;
    });
  }

  clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  armLongPressPan() {
    this.clearLongPress();
    this.longPressPan = false;
    // By-tap: ingen long-press-pan – ellers stjæles shop ved ~340ms hold
    if (this.pendingDistrict) return;
    this.longPressTimer = setTimeout(() => {
      if (this.movedPx < 12 && !this.drawing && !this.pendingDistrict) {
        // Long-press på tomt land → pan (uden Flyt-værktøj)
        this.longPressPan = true;
        this.pendingDistrict = null;
        this.panning = true;
        this.panLast = this.downPos;
        this.drawing = false;
        this.game.currentStroke = null;
        this.game.showToast?.('Flyt kort…', 0.9);
      }
    }, 420);
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  touchDist(t0, t1) {
    return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
  }

  touchMid(t0, t1) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (t0.clientX + t1.clientX) / 2 - rect.left,
      y: (t0.clientY + t1.clientY) / 2 - rect.top
    };
  }

  touchAngle(t0, t1) {
    return Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
  }

  startPinch(touches) {
    const t0 = touches[0];
    const t1 = touches[1];
    const mid = this.touchMid(t0, t1);
    const cam = this.game.camera;
    this.pinch = {
      dist: this.touchDist(t0, t1),
      angle: this.touchAngle(t0, t1),
      zoom: cam.zoom,
      rotation: cam.rotation || 0,
      camX: cam.x,
      camY: cam.y,
      originMidX: mid.x,
      originMidY: mid.y
    };
    this.drawing = false;
    this.panning = true;
    this.pendingDistrict = null;
  }

  movePinch(touches) {
    if (!this.pinch || touches.length < 2) return;
    const mid = this.touchMid(touches[0], touches[1]);
    const dist = this.touchDist(touches[0], touches[1]);
    const ang = this.touchAngle(touches[0], touches[1]);
    const scale = dist / Math.max(1, this.pinch.dist);
    const newZoom = this.game.clampZoom(this.pinch.zoom * scale);
    // Drej: vinkelforskel mellem fingre (kun yaw)
    let dAng = ang - this.pinch.angle;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const newRot = (this.pinch.rotation || 0) + dAng;

    // World-punkt under pinch-start midt
    const dpr = this.game.dpr;
    const ox = this.pinch.originMidX * dpr;
    const oy = this.pinch.originMidY * dpr;
    const z0 = this.pinch.zoom;
    const r0 = this.pinch.rotation || 0;
    const c0 = Math.cos(r0);
    const s0 = Math.sin(r0);
    const dx0 = ox - this.pinch.camX;
    const dy0 = oy - this.pinch.camY;
    const wx = (c0 * dx0 + s0 * dy0) / z0;
    const wy = (-s0 * dx0 + c0 * dy0) / z0;

    const nx = mid.x * dpr;
    const ny = mid.y * dpr;
    const c1 = Math.cos(newRot);
    const s1 = Math.sin(newRot);

    this.game.camera.zoom = newZoom;
    this.game.camera.rotation = newRot;
    this.game.camera.x = nx - (newZoom * c1 * wx - newZoom * s1 * wy);
    this.game.camera.y = ny - (newZoom * s1 * wx + newZoom * c1 * wy);
    this.game.requestDraw();
  }

  onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getPos(e);
    const dy = e.deltaY;
    const factor = dy < 0 ? 1.12 : 1 / 1.12;
    const steps = Math.min(3, Math.max(1, Math.round(Math.abs(dy) / 100)));
    let f = 1;
    for (let i = 0; i < steps; i++) f *= factor;
    this.game.zoomBy(f, pos.x, pos.y);
  }

  onMouseDown(e) {
    // Middle/right/space = pan
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      e.preventDefault();
      this.panning = true;
      this.panLast = this.getPos(e);
      this.drawing = false;
      return;
    }
    if (e.button === 0) this.onDown(e);
  }

  onMouseMove(e) {
    if (this.panning && this.panLast) {
      this.onPanMove(e);
      return;
    }
    this.onMove(e);
  }

  onPanMove(e) {
    const pos = this.getPos(e);
    if (!this.panLast) {
      this.panLast = pos;
      return;
    }
    const dpr = this.game.dpr;
    this.game.camera.x += (pos.x - this.panLast.x) * dpr;
    this.game.camera.y += (pos.y - this.panLast.y) * dpr;
    this.panLast = pos;
    this.game.requestDraw();
  }

  onMouseUp() {
    this.clearLongPress();
    if (this.panning) {
      this.panning = false;
      this.panLast = null;
      this.longPressPan = false;
      // Hvis long-press nåede at starte pan, men der var by-tap, åbn shop alligevel
      // (bør ikke ske længere – pendingDistrict arm'er ikke pan)
      if (this.pendingDistrict && this.movedPx <= 11) {
        this.game.openDistrictSheet(this.pendingDistrict);
      }
      this.pendingDistrict = null;
      this.downPos = null;
      this.movedPx = 0;
      this.drawing = false;
      return;
    }
    this.onUp();
  }

  /** Commit streg (bruges når man bevidst slipper efter tegning) */
  endDrawIfAny() {
    this.pendingDistrict = null;
    this.deferDraw = false;
    if (this.drawing) {
      this.drawing = false;
      this.game.endStroke();
    }
  }

  /** Slet igangværende streg UDEN at bygge vej (pinch / multi-touch) */
  cancelDrawIfAny() {
    this.pendingDistrict = null;
    this.drawing = false;
    this.deferDraw = false;
    if (this.game.currentStroke) {
      this.game.currentStroke = null;
      this.game.pendingRoadCost = 0;
      this.game.clearActiveSnap?.();
      this.game.requestDraw?.();
    }
  }

  /**
   * Touch: start streg efter flyt (bekræftet 1-finger-træk).
   */
  commitDeferredDraw(touchOrEvent) {
    if (!this.deferDraw || !this.downPos) return;
    this.deferDraw = false;
    const mode = this.game.mode;
    // Tap-værktøjer: ikke start streg ved flyt – de kører ved fireDeferredTap
    if (mode === 'erase' || mode === 'upgrade' || mode === 'oneway' || mode === 'light') {
      return;
    }
    if (this.pendingDistrict) {
      const d = this.pendingDistrict;
      this.pendingDistrict = null;
      this.drawing = true;
      this.game.beginStrokeFromDistrict?.(d, this.downPos.x, this.downPos.y);
      const pos = this.getPos(touchOrEvent);
      this.game.continueStroke(pos.x, pos.y);
      return;
    }
    this.drawing = true;
    this.game.beginStroke(this.downPos.x, this.downPos.y);
    const pos = this.getPos(touchOrEvent);
    this.game.continueStroke(pos.x, pos.y);
  }

  /** Touch: kort tap uden pinch – slet/lys/by-shop */
  fireDeferredTap() {
    if (!this.downPos) return;
    const pos = this.downPos;
    const mode = this.game.mode;
    if (mode === 'erase' || mode === 'upgrade' || mode === 'oneway' || mode === 'light') {
      this.game.beginStroke(pos.x, pos.y);
      this.game.endStroke?.();
      // beginStroke already applies erase/upgrade; endStroke no-ops for those modes
      return;
    }
    // pendingDistrict håndteres i onUp
  }

  onDown(e, opts = {}) {
    const pos = this.getPos(e);
    this.downPos = pos;
    this.movedPx = 0;
    this.pendingDistrict = null;
    this.longPressPan = false;
    this.deferDraw = !!opts.deferDraw;

    if (this.game.handleMinimapTap?.(pos.x, pos.y)) {
      this.drawing = false;
      this.deferDraw = false;
      return;
    }

    // Explicit pan mode still works
    if (this.game.mode === 'pan') {
      this.panning = true;
      this.panLast = pos;
      this.drawing = false;
      this.deferDraw = false;
      return;
    }

    const mode = this.game.mode;
    // Shop ved by-tap i de fleste modes (slet/opgrader bruger by-området til værktøj)
    const canShop =
      this.game.running &&
      mode !== 'erase' && mode !== 'upgrade' && mode !== 'pan';

    // Center of city = short tap opens shop; drag = draw road FROM city
    const core = canShop ? this.game.hitDistrictCore?.(pos.x, pos.y) : null;
    if (core) {
      this.pendingDistrict = core;
      this.drawing = false;
      // deferDraw forbliver true på touch – streg startes ved flyt
      this.armLongPressPan();
      return;
    }

    // Mus: tegn med det samme. Touch: vent på flyt (se commitDeferredDraw)
    if (this.deferDraw) {
      this.drawing = false;
      this.armLongPressPan();
      return;
    }

    // Outer ring / empty land: draw or erase immediately (snap to hub)
    this.drawing = true;
    this.game.beginStroke(pos.x, pos.y);
    this.armLongPressPan();
  }

  onMove(e) {
    const pos = this.getPos(e);
    if (this.downPos) {
      this.movedPx = Math.hypot(pos.x - this.downPos.x, pos.y - this.downPos.y);
      if (this.movedPx > 10) this.clearLongPress();
    }

    // Drag from city center → DRAW road (not pan, not shop)
    if (this.pendingDistrict && this.downPos) {
      if (this.movedPx > 14) {
        const d = this.pendingDistrict;
        this.pendingDistrict = null;
        this.panning = false;
        this.drawing = true;
        // Start stroke at district edge toward drag direction
        this.game.beginStrokeFromDistrict?.(d, this.downPos.x, this.downPos.y);
        this.game.continueStroke(pos.x, pos.y);
      }
      return;
    }

    if (this.panning) {
      this.onPanMove(e);
      return;
    }
    if (!this.drawing) return;
    this.game.continueStroke(pos.x, pos.y);
  }

  onUp() {
    this.clearLongPress();
    if (this.panning) {
      this.panning = false;
      this.panLast = null;
      this.longPressPan = false;
    }
    if (this.pendingDistrict) {
      // Tillad lidt finger-rysten før det tæller som træk (vej)
      if (this.movedPx <= 14) {
        this.game.openDistrictSheet(this.pendingDistrict);
      }
      this.pendingDistrict = null;
      this.downPos = null;
      this.movedPx = 0;
      this.drawing = false;
      return;
    }
    if (!this.drawing) {
      this.downPos = null;
      return;
    }
    this.drawing = false;
    this.downPos = null;
    this.game.endStroke();
  }
}
