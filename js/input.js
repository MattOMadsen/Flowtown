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
      // Arrow keys pan when not typing
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
      if (e.touches.length === 1) {
        if (this.panning) this.onPanMove(e.touches[0]);
        else if (this.drawing || this.pendingDistrict) this.onMove(e.touches[0]);
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

    this.pinch.lastMidX = mid.x;
    this.pinch.lastMidY = mid.y;
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
    if (e.button === 1 || e.button === 2 || this.spaceDown || this.game.mode === 'pan') {
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

    if (this.game.handleMinimapTap?.(pos.x, pos.y)) {
      this.drawing = false;
      return;
    }

    // Pan tool: drag map, never draw
    if (this.game.mode === 'pan') {
      this.panning = true;
      this.panLast = pos;
      this.drawing = false;
      return;
    }

    const hit = this.game.hitDistrict?.(pos.x, pos.y);
    const mode = this.game.mode;
    if (
      hit && this.game.running &&
      mode !== 'erase' && mode !== 'upgrade' && mode !== 'bridge' && mode !== 'pan'
    ) {
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
      // Drag on city → pan map instead of accidental road (better UX)
      if (this.movedPx > 16) {
        this.pendingDistrict = null;
        this.panning = true;
        this.panLast = this.downPos;
        this.onPanMove(e);
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
    if (this.panning) {
      this.panning = false;
      this.panLast = null;
    }
    if (this.pendingDistrict) {
      if (this.movedPx <= 16) {
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
