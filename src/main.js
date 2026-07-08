/**
 * Demo wiring — shows the intended integration pattern:
 *
 *   const result = selectPrize(prizes, settings);   // logic
 *   await wheel.spinTo(result.id, { velocity });    // animation
 *   reveal.show(result);                            // celebration
 *
 * The wheel never knows how winners are chosen; swap selectPrize for a
 * server call (settings.forcedPrizeId) without touching the component.
 */

import './styles.css';
import './components/PrizeWheel/PrizeWheel.css';
import './components/PrizeWheel/WinnerReveal.css';

import { prizes as initialPrizes, defaultSettings } from './config/prizes.js';
import { selectPrize, getActivePrizes, consumePrize } from './utilities/selectPrize.js';
import { preloadImages } from './utilities/preloadImages.js';
import { PrizeWheel } from './components/PrizeWheel/PrizeWheel.js';
import { WinnerReveal } from './components/PrizeWheel/WinnerReveal.js';

const settings = { ...defaultSettings };
let prizes = initialPrizes; // live inventory state — decremented per win
let forcedPrizeId = null;

const wheelRoot = document.getElementById('wheel-root');
const hint = document.getElementById('stage-hint');

const reveal = new WinnerReveal(document.body, {
  onSound: (name) => {
    // Wire real audio here, e.g. new Audio(`/sounds/${name}.mp3`).play()
    console.log(`[sound] ${name}`);
  }
});

const wheel = new PrizeWheel(wheelRoot, {
  panels: getActivePrizes(initialPrizes, settings),
  spinDuration: settings.spinDuration,
  minLoops: settings.minLoops,
  maxLoops: settings.maxLoops,
  spinStrength: settings.spinStrength,
  onSpinRequest: (velocity) => runSpin(velocity),
  onSpinStart: () => {
    hint.textContent = 'Good luck…';
  }
});

async function runSpin(velocity) {
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

  await reveal.show(result);

  // Door-prize inventory: hand one out, then rebuild the reel so depleted
  // prizes vanish and the odds always reflect what's physically left.
  if (!result.isLoser) {
    prizes = consumePrize(prizes, result.id);
    try {
      wheel.setPanels(getActivePrizes(prizes, settings));
    } catch (err) {
      hint.textContent = 'All prizes have been claimed!';
      console.warn(err);
      return;
    }
  }
  hint.textContent = 'Swipe down to spin!';
}

preloadImages([...initialPrizes, settings.loserPrize]);

/* ------------------------------------------------ demo controls ------- */

document.getElementById('toggle-loser').addEventListener('change', (e) => {
  settings.allowLosingResult = e.target.checked;
  try {
    wheel.setPanels(getActivePrizes(prizes, settings));
  } catch {
    e.target.checked = settings.allowLosingResult = !e.target.checked;
  }
});

document.getElementById('force-grand').addEventListener('click', () => {
  // Simulates a server-selected (deterministic) winner.
  const grand = prizes.find((p) => p.isGrandPrize);
  if (!grand) return;
  forcedPrizeId = grand.id;
  runSpin(1.5);
});
