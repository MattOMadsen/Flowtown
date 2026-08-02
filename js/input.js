export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.drawing = false;

    // Mouse
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMove(e));
    canvas.addEventListener('mouseup', (e) => this.onUp(e));
    canvas.addEventListener('mouseleave', (e) => this.onUp(e));

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) this.onDown(e.touches[0]);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) this.onMove(e.touches[0]);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onUp();
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => this.onUp());
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
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
