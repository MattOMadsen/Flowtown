/**
 * Første-gangs tutorial – korte trin.
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
    id: 'cross',
    title: '2 · Kryds: bro eller lys',
    body: 'Tegner du hen over en anden vej, vælger du bro (dyrere, fri bane) eller kryds med trafiklys (billigere). Flere kryds? Vælg pr. kryds – eller «bro alle» / «lys alle».',
    hint: '🌉 Bro · 🚦 Lys · synkroniseret i kryds'
  },
  {
    id: 'buy',
    title: '3 · Køb en bil',
    body: 'Tryk midt i en by (kort tryk) for at åbne shop. Køb en bil – den stationeres der.',
    hint: '🏙️ Tryk midt i byen'
  },
  {
    id: 'jobs',
    title: '4 · Lever opgaver',
    body: 'Biler kører selv til opgaver. Åbn «Opgaver» og tryk en mission for vejviser. Tjen $ og XP!',
    hint: '📋 Opgaver · tryk = vejviser'
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
