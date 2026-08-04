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
      if (e.touches.length >= 2) {
        this.clearLongPress();
        this.endDrawIfAny();
        this.pendingDistrict = null;
        this.startPinch(e.touches);
        return;
      }
      if (e.touches.length === 1 && !this.pinch) {
        this.onDown(e.touches[0]);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        if (!this.pinch) this.startPinch(e.touches);
        else this.movePinch(e.touches);
        return;
      }
      if (e.touches.length === 1) {
        if (this.panning) this.onPanMove(e.touches[0]);
        else this.onMove(e.touches[0]);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length < 2) this.pinch = null;
      if (e.touches.length === 0) {
        this.panning = false;
        this.panLast = null;
        this.onUp();
      }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.pinch = null;
      this.panning = false;
      this.panLast = null;
      this.clearLongPress();
      this.onUp();
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

  startPinch(touches) {
    const t0 = touches[0];
    const t1 = touches[1];
    const mid = this.touchMid(t0, t1);
    const cam = this.game.camera;
    this.pinch = {
      dist: this.touchDist(t0, t1),
      zoom: cam.zoom,
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
    const scale = dist / Math.max(1, this.pinch.dist);
    const newZoom = this.game.clampZoom(this.pinch.zoom * scale);

    const dpr = this.game.dpr;
    const ox = this.pinch.originMidX * dpr;
    const oy = this.pinch.originMidY * dpr;
    const wx = (ox - this.pinch.camX) / this.pinch.zoom;
    const wy = (oy - this.pinch.camY) / this.pinch.zoom;
    const nx = mid.x * dpr;
    const ny = mid.y * dpr;

    this.game.camera.zoom = newZoom;
    this.game.camera.x = nx - wx * newZoom;
    this.game.camera.y = ny - wy * newZoom;
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

  endDrawIfAny() {
    this.pendingDistrict = null;
    if (this.drawing) {
      this.drawing = false;
      this.game.endStroke();
    }
  }

  onDown(e) {
    const pos = this.getPos(e);
    this.downPos = pos;
    this.movedPx = 0;
    this.pendingDistrict = null;
    this.longPressPan = false;

    if (this.game.handleMinimapTap?.(pos.x, pos.y)) {
      this.drawing = false;
      return;
    }

    // Explicit pan mode still works
    if (this.game.mode === 'pan') {
      this.panning = true;
      this.panLast = pos;
      this.drawing = false;
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
