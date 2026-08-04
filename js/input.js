export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.drawing = false;
    this.panning = false;
    this.spaceDown = false;
    this.panLast = null;
    this.pinch = null;
    /** District tap without drag (buy fleet) */
    this.pendingDistrict = null;
    this.downPos = null;
    this.movedPx = 0;

    // Mouse
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseleave', () => {
      // keep pan if dragging outside; drawing ends
      if (this.drawing && !this.panning) this.onUp();
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = true;
        e.preventDefault();
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

    // Touch – only on canvas
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        this.endDrawIfAny();
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
      if (e.touches.length === 1 && this.drawing) {
        this.onMove(e.touches[0]);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length < 2) this.pinch = null;
      if (e.touches.length === 0) {
        this.panning = false;
        this.onUp();
      }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.pinch = null;
      this.panning = false;
      this.onUp();
    });
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
      originMidY: mid.y,
      lastMidX: mid.x,
      lastMidY: mid.y
    };
    this.drawing = false;
    this.panning = true;
  }

  movePinch(touches) {
    if (!this.pinch || touches.length < 2) return;
    const mid = this.touchMid(touches[0], touches[1]);
    const dist = this.touchDist(touches[0], touches[1]);
    const scale = dist / Math.max(1, this.pinch.dist);
    const newZoom = this.game.clampZoom(this.pinch.zoom * scale);

    // Reconstruct camera from pinch origin so zoom stays stable
    const dpr = this.game.dpr;
    const ox = this.pinch.originMidX * dpr;
    const oy = this.pinch.originMidY * dpr;
    const wx = (ox - this.pinch.camX) / this.pinch.zoom;
    const wy = (oy - this.pinch.camY) / this.pinch.zoom;

    // New mid in screen px
    const nx = mid.x * dpr;
    const ny = mid.y * dpr;

    this.game.camera.zoom = newZoom;
    // Keep original world point under original mid, then pan by mid delta
    this.game.camera.x = nx - wx * newZoom;
    this.game.camera.y = ny - wy * newZoom;
    this.game.requestDraw();

    this.pinch.lastMidX = mid.x;
    this.pinch.lastMidY = mid.y;
  }

  onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getPos(e);
    // Support trackpads (small delta) and mice
    const dy = e.deltaY;
    const factor = dy < 0 ? 1.12 : 1 / 1.12;
    // Stronger zoom for larger wheel ticks
    const steps = Math.min(3, Math.max(1, Math.round(Math.abs(dy) / 100)));
    let f = 1;
    for (let i = 0; i < steps; i++) f *= factor;
    this.game.zoomBy(f, pos.x, pos.y);
  }

  onMouseDown(e) {
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      e.preventDefault();
      this.panning = true;
      this.panLast = this.getPos(e);
      return;
    }
    if (e.button === 0) this.onDown(e);
  }

  onMouseMove(e) {
    if (this.panning && this.panLast) {
      const pos = this.getPos(e);
      const dpr = this.game.dpr;
      this.game.camera.x += (pos.x - this.panLast.x) * dpr;
      this.game.camera.y += (pos.y - this.panLast.y) * dpr;
      this.panLast = pos;
      this.game.requestDraw();
      return;
    }
    this.onMove(e);
  }

  onMouseUp(e) {
    if (this.panning) {
      this.panning = false;
      this.panLast = null;
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

    // Minimap click pans camera instead of drawing
    if (this.game.handleMinimapTap?.(pos.x, pos.y)) {
      this.drawing = false;
      return;
    }

    // Tap-on-city candidate (F1) – not in erase/upgrade mode
    const hit = this.game.hitDistrict?.(pos.x, pos.y);
    const mode = this.game.mode;
    if (hit && this.game.running && mode !== 'erase' && mode !== 'upgrade' && mode !== 'bridge') {
      this.pendingDistrict = hit;
      this.drawing = false;
      return;
    }

    this.drawing = true;
    this.game.beginStroke(pos.x, pos.y);
  }

  onMove(e) {
    const pos = this.getPos(e);
    if (this.pendingDistrict && this.downPos) {
      const dx = pos.x - this.downPos.x;
      const dy = pos.y - this.downPos.y;
      this.movedPx = Math.hypot(dx, dy);
      // Drag → start drawing from original point (not a city tap)
      if (this.movedPx > 14) {
        this.pendingDistrict = null;
        this.drawing = true;
        this.game.beginStroke(this.downPos.x, this.downPos.y);
        this.game.continueStroke(pos.x, pos.y);
      }
      return;
    }
    if (!this.drawing) return;
    this.game.continueStroke(pos.x, pos.y);
  }

  onUp() {
    if (this.pendingDistrict) {
      if (this.movedPx <= 14) {
        this.game.openDistrictSheet(this.pendingDistrict);
      }
      this.pendingDistrict = null;
      this.downPos = null;
      this.movedPx = 0;
      this.drawing = false;
      return;
    }
    if (!this.drawing) return;
    this.drawing = false;
    this.downPos = null;
    this.game.endStroke();
  }
}
