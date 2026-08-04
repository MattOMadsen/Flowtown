/**
 * Første-gangs tutorial – 3 korte trin.
 */

const DONE_KEY = 'flowtown-tutorial-done';

export const TUTORIAL_STEPS = [
  {
    id: 'road',
    title: '1 · Tegn en vej',
    body: 'Træk med fingeren fra én by til en anden. Vej koster lidt $, men forbinder dig til jobs.',
    hint: '✏️ Træk fra by-kant'
  },
  {
    id: 'buy',
    title: '2 · Køb en bil',
    body: 'Tryk midt i en by (kort tryk) for at åbne shop. Køb en bil – den stationeres der.',
    hint: '🏙️ Tryk midt i byen'
  },
  {
    id: 'jobs',
    title: '3 · Lever opgaver',
    body: 'Biler kører selv til opgaver. Åbn «Opgaver» i toppen for at se ruter. Tjen $ og XP!',
    hint: '📋 Se Opgaver-panelet'
  }
];

export function isTutorialDone() {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTutorialDone() {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch { /* ignore */ }
}

export function shouldShowTutorial() {
  return !isTutorialDone();
}
