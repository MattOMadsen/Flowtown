/**
 * Soft Web Audio beeps – ingen eksterne filer.
 * Mute gemmes i localStorage.
 */

const MUTE_KEY = 'flowtown-muted';

let ctx = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from first user gesture so iOS unlocks audio */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function isMuted() {
  return muted;
}

export function setMuted(on) {
  muted = !!on;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch { /* ignore */ }
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

/**
 * Soft tone: freq Hz, duration s, type, volume 0–1
 */
function tone(freq, dur = 0.08, type = 'sine', vol = 0.08, when = 0) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playUi() {
  tone(520, 0.05, 'sine', 0.05);
}

export function playBuy() {
  tone(392, 0.07, 'triangle', 0.07);
  tone(523, 0.09, 'triangle', 0.06, 0.06);
}

export function playDeliver() {
  tone(523, 0.07, 'sine', 0.07);
  tone(659, 0.09, 'sine', 0.06, 0.07);
  tone(784, 0.11, 'sine', 0.05, 0.14);
}

export function playRoad() {
  tone(180, 0.06, 'triangle', 0.04);
  tone(240, 0.05, 'triangle', 0.03, 0.04);
}

export function playLevelUp() {
  tone(440, 0.08, 'sine', 0.07);
  tone(554, 0.08, 'sine', 0.07, 0.08);
  tone(659, 0.12, 'sine', 0.08, 0.16);
}

export function playJobDone() {
  tone(494, 0.06, 'sine', 0.06);
  tone(740, 0.1, 'sine', 0.07, 0.07);
}

export function playError() {
  tone(160, 0.1, 'square', 0.04);
}
