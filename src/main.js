/**
 * Demo wiring — shows the intended integration pattern:
 *
 *   const result = selectPrize(prizes, settings);   // logic
 *   await wheel.spinTo(result.id, { velocity });    // animation
 *   await wheel.highlightHit(2000);                 // let the hit read
 *   reveal.show(result);                            // celebration
 *
 * The wheel never knows how winners are chosen; swap selectPrize for a
 * server call (settings.forcedPrizeId) without touching the component.
 *
 * Door-prize inventory rules:
 *  - odds are proportional to remaining inventory per spot
 *  - a spot at 0 inventory can't be landed on and leaves the reel
 *  - when NO spot has inventory left (even if the loser is enabled),
 *    the wheel locks and asks the operator to reload inventory
 */

import './styles.css';
import './components/PrizeWheel/PrizeWheel.css';
import './components/PrizeWheel/WinnerReveal.css';
import './components/ConfigPanel/ConfigPanel.css';

import { prizes as defaultPrizes, defaultSettings } from './config/prizes.js';
import { selectPrize, getActivePrizes, consumePrize } from './utilities/selectPrize.js';
import { preloadImages } from './utilities/preloadImages.js';
import { PrizeWheel } from './components/PrizeWheel/PrizeWheel.js';
import { WinnerReveal } from './components/PrizeWheel/WinnerReveal.js';
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel.js';

const STORAGE_KEY = 'digital-prize-wheel-config';

/* ------------------------------------------------ state --------------- */

let { prizes, settings } = loadConfig();
let forcedPrizeId = null;

const wheelRoot = document.getElementById('wheel-root');
const hint = document.getElementById('stage-hint');

/* ------------------------------------------------ components ---------- */

const reveal = new WinnerReveal(document.body, {
  onSound: (name) => {
    // Wire real audio here, e.g. new Audio(`/sounds/${name}.mp3`).play()
    console.log(`[sound] ${name}`);
  }
});

const wheel = new PrizeWheel(wheelRoot, {
  panels: getActivePrizes(prizes, settings),
  spinDuration: settings.spinDuration,
  minLoops: settings.minLoops,
  maxLoops: settings.maxLoops,
  spinStrength: settings.spinStrength,
  onSpinRequest: (velocity) => runSpin(velocity),
  onSpinStart: () => {
    hint.textContent = 'Good luck…';
  }
});

const config = new ConfigPanel({
  getConfig: () => ({ prizes, settings }),
  onSave: (next) => {
    if (wheel.state !== 'idle') return 'Wait for the current spin to finish.';
    prizes = next.prizes;
    settings = next.settings;
    saveConfig();
    rebuildReel();
    preloadImages([...prizes, settings.loserPrize]);
  }
});

/* ------------------------------------------------ spin flow ----------- */

function hasWinnableStock() {
  try {
    // Out-of-stock spots stay on the reel with weight 0, so lock on WEIGHT,
    // not on panel count.
    return getActivePrizes(prizes, { ...settings, allowLosingResult: false }).some(
      (p) => p.weight > 0
    );
  } catch {
    return false;
  }
}

/**
 * Lock the wheel when there is nothing left to win — including the case
 * where only the losing spot remains. Operators reload inventory via ⚙.
 */
function refreshLockState() {
  const locked = !hasWinnableStock();
  wheel.root.classList.toggle('pw--locked', locked);
  if (locked) {
    hint.textContent = 'Out of prizes! Open ⚙ Settings and reload inventory.';
  }
  return locked;
}

function rebuildReel() {
  wheel.setPanels(getActivePrizes(prizes, settings));
  if (!refreshLockState()) hint.textContent = 'Swipe down to spin!';
}

async function runSpin(velocity) {
  if (refreshLockState()) {
    config.open();
    return;
  }

  let result;
  try {
    result = selectPrize(prizes, {
      ...settings,
      forcedPrizeId: forcedPrizeId ?? undefined
    });
  } catch (err) {
    console.error(err);
    return;
  }
  forcedPrizeId = null;

  try {
    await wheel.spinTo(result.id, { velocity });
  } catch {
    return; // spin already in progress — locked
  }

  // Let the hit read clearly for a moment before the celebration.
  await wheel.highlightHit(2000);
  await reveal.show(result);

  // Hand one out, then rebuild so depleted spots vanish and the odds always
  // reflect what's physically left.
  if (!result.isLoser) {
    prizes = consumePrize(prizes, result.id);
    saveConfig();
  }
  rebuildReel();
}

/* ------------------------------------------------ persistence --------- */

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.prizes) && saved.settings) {
        return {
          prizes: saved.prizes,
          settings: { ...defaultSettings, ...saved.settings }
        };
      }
    }
  } catch {
    /* corrupted storage — fall through to defaults */
  }
  return { prizes: defaultPrizes.map((p) => ({ ...p })), settings: { ...defaultSettings } };
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ prizes, settings }));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/* ------------------------------------------------ page controls ------- */

document.getElementById('open-config').addEventListener('click', () => config.open());

document.getElementById('force-grand').addEventListener('click', () => {
  // Simulates a server-selected (deterministic) winner.
  const grand = prizes.find((p) => p.isGrandPrize);
  if (!grand) return;
  forcedPrizeId = grand.id;
  runSpin(1.5);
});

preloadImages([...prizes, settings.loserPrize]);
refreshLockState();
