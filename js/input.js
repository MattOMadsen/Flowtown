export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.drawing = false;
    this.panning = false;
    this.spaceDown = false;

    // Pinch state
    this.pinch = null; // { dist, midX, midY, camX, camY, zoom }

    // Mouse
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = true;
        e.preventDefault();
      }
      if (e.key === '+' || e.key === '=') this.game.zoomBy(1.12);
      if (e.key === '-' || e.key === '_') this.game.zoomBy(1 / 1.12);
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.game.resetCamera();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
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
      if (e.touches.length === 2) {
        this.movePinch(e.touches);
        return;
      }
      if (e.touches.length === 1 && this.drawing) {
        this.onMove(e.touches[0]);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length < 2) this.pinch = null;
      if (e.touches.length === 0) this.onUp();
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.pinch = null;
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
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy) || 1;
  }

  touchMid(t0, t1) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (t0.clientX + t1.clientX) / 2 - rect.left,
      y: (t0.clientY + t1.clientY) / 2 - rect.top
    };
  }

  startPinch(touches) {
    const mid = this.touchMid(touches[0], touches[1]);
    const cam = this.game.camera;
    this.pinch = {
      dist: this.touchDist(touches[0], touches[1]),
      midX: mid.x,
      midY: mid.y,
      camX: cam.x,
      camY: cam.y,
      zoom: cam.zoom,
      lastMidX: mid.x,
      lastMidY: mid.y
    };
    this.panning = true;
  }

  movePinch(touches) {
    if (!this.pinch) {
      this.startPinch(touches);
      return;
    }
    const mid = this.touchMid(touches[0], touches[1]);
    const dist = this.touchDist(touches[0], touches[1]);
    const scale = dist / this.pinch.dist;
    const newZoom = this.pinch.zoom * scale;

    // Zoom toward midpoint, then pan by finger movement
    this.game.setZoomAt(newZoom, mid.x, mid.y);

    const dpr = this.game.dpr;
    this.game.camera.x += (mid.x - this.pinch.lastMidX) * dpr;
    this.game.camera.y += (mid.y - this.pinch.lastMidY) * dpr;
    this.pinch.lastMidX = mid.x;
    this.pinch.lastMidY = mid.y;
  }

  onWheel(e) {
    e.preventDefault();
    const pos = this.getPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.game.zoomBy(factor, pos.x, pos.y);
  }

  onMouseDown(e) {
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
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
    if (this.drawing) {
      this.drawing = false;
      this.game.endStroke();
    }
  }

  onDown(e) {
    const pos = this.getPos(e);
    this.drawing = true;
    this.game.beginStroke(pos.x, pos.y);
  }

  onMove(e) {
    if (!this.drawing) return;
    const pos = this.getPos(e);
    this.game.continueStroke(pos.x, pos.y);
  }

  onUp() {
    if (!this.drawing) return;
    this.drawing = false;
    this.game.endStroke();
  }
}
