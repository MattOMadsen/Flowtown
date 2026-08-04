/**
 * Input state machine for Flowtown.
 * States: idle | pending | draw | pan | pinch
 * Se STABILISERING.md – pinch/draw må aldrig være samtidigt; pinch commit’er aldrig vej.
 */

/** @typedef {'idle'|'pending'|'draw'|'pan'|'pinch'} InputMode */

export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;

    /** @type {InputMode} */
    this.mode = 'idle';
    this.spaceDown = false;
    this.panLast = null;
    this.pinch = null;
    this.pendingDistrict = null;
    this.downPos = null;
    this.movedPx = 0;
    this.longPressTimer = null;
    /** Efter pinch: ignorer næste single-touch kortvarigt */
    this._pinchCooldownUntil = 0;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
    canvas.addEventListener('mouseleave', () => {
      if (this.mode === 'draw') this.commitDraw();
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });

    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', () => this.resetToIdle(true));
  }

  /** @param {InputMode} next */
  setMode(next) {
    this.mode = next;
  }

  clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  armLongPressPan() {
    this.clearLongPress();
    if (this.pendingDistrict) return;
    this.longPressTimer = setTimeout(() => {
      if (this.mode !== 'pending' || this.movedPx >= 12 || this.pendingDistrict) return;
      this.cancelStrokeOnly();
      this.setMode('pan');
      this.panLast = this.downPos;
      this.game.showToast?.('Flyt kort…', 0.9);
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

  // ─── Stroke helpers ───────────────────────────────────────────

  /** Slet streg uden at bygge (pinch / abort) */
  cancelStrokeOnly() {
    this.pendingDistrict = null;
    if (typeof this.game.cancelStroke === 'function') {
      this.game.cancelStroke();
    } else if (this.game.currentStroke) {
      this.game.currentStroke = null;
      this.game.pendingRoadCost = 0;
      this.game.clearActiveSnap?.();
      this.game.requestDraw?.();
    }
  }

  /** Byg vej fra igangværende streg */
  commitDraw() {
    this.clearLongPress();
    this.pendingDistrict = null;
    if (this.mode === 'draw' || this.game.currentStroke) {
      this.game.endStroke();
    }
    this.setMode('idle');
    this.downPos = null;
    this.movedPx = 0;
  }

  resetToIdle(cancelStroke = false) {
    this.clearLongPress();
    if (cancelStroke) this.cancelStrokeOnly();
    this.pinch = null;
    this.panLast = null;
    this.pendingDistrict = null;
    this.downPos = null;
    this.movedPx = 0;
    this.setMode('idle');
  }

  enterPinch(touches) {
    this.clearLongPress();
    this.cancelStrokeOnly();
    this.pendingDistrict = null;
    this.downPos = null;
    this.movedPx = 0;
    this.panLast = null;

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
    this.setMode('pinch');
  }

  movePinch(touches) {
    if (this.mode !== 'pinch' || !this.pinch || touches.length < 2) return;
    const mid = this.touchMid(touches[0], touches[1]);
    const dist = this.touchDist(touches[0], touches[1]);
    const ang = this.touchAngle(touches[0], touches[1]);
    const scale = dist / Math.max(1, this.pinch.dist);
    const newZoom = this.game.clampZoom(this.pinch.zoom * scale);

    let dAng = ang - this.pinch.angle;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const newRot = (this.pinch.rotation || 0) + dAng;

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

  exitPinch() {
    this.pinch = null;
    this._pinchCooldownUntil = performance.now() + 280;
    this.setMode('idle');
    this.panLast = null;
    this.downPos = null;
    this.movedPx = 0;
    this.pendingDistrict = null;
  }

  // ─── Keyboard / wheel / mouse ─────────────────────────────────

  onKeyDown(e) {
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
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      e.preventDefault();
      this.clearLongPress();
      this.cancelStrokeOnly();
      this.setMode('pan');
      this.panLast = this.getPos(e);
      return;
    }
    if (e.button === 0) this.beginPointer(e, { isTouch: false });
  }

  onMouseMove(e) {
    if (this.mode === 'pan' && this.panLast) {
      this.onPanMove(e);
      return;
    }
    this.onPointerMove(e);
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
    if (this.mode === 'pan') {
      this.panLast = null;
      this.setMode('idle');
      this.downPos = null;
      this.movedPx = 0;
      this.pendingDistrict = null;
      return;
    }
    this.endPointer();
  }

  // ─── Touch ────────────────────────────────────────────────────

  onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      this.enterPinch(e.touches);
      return;
    }
    if (e.touches.length === 1 && this.mode !== 'pinch') {
      if (performance.now() < this._pinchCooldownUntil) return;
      this.beginPointer(e.touches[0], { isTouch: true });
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      if (this.mode !== 'pinch') this.enterPinch(e.touches);
      else this.movePinch(e.touches);
      return;
    }
    if (e.touches.length === 1 && this.mode !== 'pinch') {
      this.onPointerMove(e.touches[0]);
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length >= 2) return;

    if (e.touches.length === 1) {
      // pinch → 1 finger: stop pinch, ignorer rest-finger
      if (this.mode === 'pinch') {
        this.exitPinch();
      }
      return;
    }

    // 0 fingre
    if (this.mode === 'pinch') {
      this.exitPinch();
      return;
    }
    if (this.mode === 'pan') {
      this.panLast = null;
      this.setMode('idle');
      this.downPos = null;
      this.movedPx = 0;
      return;
    }
    this.endPointer();
  }

  // ─── Shared pointer logic ─────────────────────────────────────

  /**
   * @param {*} e touch or mouse
   * @param {{ isTouch?: boolean }} opts
   */
  beginPointer(e, opts = {}) {
    const isTouch = !!opts.isTouch;
    const pos = this.getPos(e);
    this.downPos = pos;
    this.movedPx = 0;
    this.pendingDistrict = null;
    this.clearLongPress();

    if (this.game.handleMinimapTap?.(pos.x, pos.y)) {
      this.setMode('idle');
      return;
    }

    if (this.game.mode === 'pan') {
      this.setMode('pan');
      this.panLast = pos;
      return;
    }

    const mode = this.game.mode;
    const canShop =
      this.game.running &&
      mode !== 'erase' && mode !== 'upgrade' && mode !== 'pan';

    const core = canShop ? this.game.hitDistrictCore?.(pos.x, pos.y) : null;
    if (core) {
      this.pendingDistrict = core;
      this.setMode('pending');
      // ingen long-press-pan på by
      return;
    }

    // Touch: pending indtil flyt (undgår vej før pinch)
    // Mus: start draw med det samme (undtagen tap-tools)
    if (isTouch) {
      this.setMode('pending');
      this.armLongPressPan();
      return;
    }

    // Mus: slet/opgrader/lys kører på ned
    if (mode === 'erase' || mode === 'upgrade' || mode === 'oneway' || mode === 'light') {
      this.game.beginStroke(pos.x, pos.y);
      this.setMode('idle');
      return;
    }

    this.setMode('draw');
    this.game.beginStroke(pos.x, pos.y);
    this.armLongPressPan();
  }

  onPointerMove(e) {
    if (!this.downPos && this.mode !== 'draw' && this.mode !== 'pan') return;
    const pos = this.getPos(e);
    if (this.downPos) {
      this.movedPx = Math.hypot(pos.x - this.downPos.x, pos.y - this.downPos.y);
      if (this.movedPx > 10) this.clearLongPress();
    }

    // pending → draw ved flyt
    if (this.mode === 'pending' && this.downPos && this.movedPx > 12) {
      this.startDrawFromPending(e);
      return;
    }

    if (this.mode === 'pan') {
      this.onPanMove(e);
      return;
    }

    if (this.mode === 'draw') {
      this.game.continueStroke(pos.x, pos.y);
    }
  }

  startDrawFromPending(e) {
    const gmode = this.game.mode;
    // Tap-tools: ikke streg ved flyt
    if (gmode === 'erase' || gmode === 'upgrade' || gmode === 'oneway' || gmode === 'light') {
      return;
    }
    const pos = this.getPos(e);
    if (this.pendingDistrict) {
      const d = this.pendingDistrict;
      this.pendingDistrict = null;
      this.setMode('draw');
      this.game.beginStrokeFromDistrict?.(d, this.downPos.x, this.downPos.y);
      this.game.continueStroke(pos.x, pos.y);
      return;
    }
    this.setMode('draw');
    this.game.beginStroke(this.downPos.x, this.downPos.y);
    this.game.continueStroke(pos.x, pos.y);
  }

  endPointer() {
    this.clearLongPress();

    if (this.mode === 'pending') {
      // Kort tap
      if (this.pendingDistrict && this.movedPx <= 14) {
        this.game.openDistrictSheet(this.pendingDistrict);
      } else if (this.movedPx <= 12 && this.downPos) {
        const gmode = this.game.mode;
        if (gmode === 'erase' || gmode === 'upgrade' || gmode === 'oneway' || gmode === 'light') {
          this.game.beginStroke(this.downPos.x, this.downPos.y);
        }
      }
      this.pendingDistrict = null;
      this.downPos = null;
      this.movedPx = 0;
      this.setMode('idle');
      return;
    }

    if (this.mode === 'draw') {
      this.commitDraw();
      return;
    }

    this.downPos = null;
    this.movedPx = 0;
    this.pendingDistrict = null;
    this.setMode('idle');
  }
}
