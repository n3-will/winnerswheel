/**
 * Prize selection logic — pure, framework-free, and fully separate from the
 * wheel visuals. The wheel component never imports this module; the host app
 * calls selectPrize() and hands the winning id to wheel.spinTo().
 */

export const LOSER_ID = 'loser';

const DEFAULT_LOSER = Object.freeze({
  id: LOSER_ID,
  title: 'Try Again',
  image: '',
  enabled: true,
  isGrandPrize: false,
  weight: 1
});

/**
 * Validate a prize list. Throws with a descriptive message on:
 *  - more than one prize marked isGrandPrize
 *  - duplicate ids
 *  - zero enabled prizes
 */
export function validatePrizes(prizes) {
  if (!Array.isArray(prizes) || prizes.length === 0) {
    throw new Error('Prize config must be a non-empty array.');
  }
  const ids = new Set();
  for (const prize of prizes) {
    if (ids.has(prize.id)) {
      throw new Error(`Duplicate prize id: "${prize.id}".`);
    }
    ids.add(prize.id);
  }
  const grandCount = prizes.filter((p) => p.isGrandPrize).length;
  if (grandCount > 1) {
    throw new Error(`Only one prize may be the Grand Prize (found ${grandCount}).`);
  }
  if (!prizes.some((p) => p.enabled !== false)) {
    throw new Error('No enabled prizes in config.');
  }
  return true;
}

/**
 * Selection weight for a prize. Door-prize inventories drive the odds: when
 * `inventory` is set, the chance of winning a prize is proportional to how
 * many are physically left (times any per-item `weight` multiplier), and a
 * depleted prize (inventory 0) drops out of the draw AND the reel.
 */
function effectiveWeight(prize) {
  const weight = prize.weight ?? 1;
  if (prize.inventory !== undefined) return weight * Math.max(prize.inventory, 0);
  return weight;
}

/**
 * The active pool: enabled, in-stock prizes with a positive weight, plus the
 * loser slot (appended last) when settings.allowLosingResult is true. This
 * same list drives both selection and the visual reel, so what the player
 * sees always matches what they can actually win.
 */
export function getActivePrizes(prizes, settings = {}) {
  validatePrizes(prizes);
  const active = prizes
    .filter((p) => p.enabled !== false && effectiveWeight(p) > 0)
    .map((p) => ({ ...p, weight: effectiveWeight(p), isLoser: false }));

  if (settings.allowLosingResult) {
    const loser = { ...DEFAULT_LOSER, ...(settings.loserPrize || {}) };
    active.push({
      ...loser,
      weight: settings.loserWeight ?? loser.weight ?? 1,
      isGrandPrize: false,
      isLoser: true
    });
  }
  return active;
}

function toResult(prize) {
  return {
    id: prize.id,
    title: prize.title,
    image: prize.image,
    isGrandPrize: Boolean(prize.isGrandPrize),
    isLoser: Boolean(prize.isLoser),
    prize
  };
}

/**
 * Select a winner from the active pool.
 *
 * settings:
 *  - allowLosingResult {boolean} include the loser slot in the pool
 *  - loserPrize {object}         override the default loser slot definition
 *  - loserWeight {number}        selection weight for the loser slot
 *  - forcedPrizeId {string}      deterministic/server-selected winner
 *  - rng {() => number}          injectable random source (default Math.random)
 */
export function selectPrize(prizes, settings = {}) {
  const pool = getActivePrizes(prizes, settings);
  if (pool.length === 0) {
    throw new Error('No prizes available: every prize is disabled or out of stock.');
  }

  if (settings.forcedPrizeId != null) {
    const forced = pool.find((p) => p.id === settings.forcedPrizeId);
    if (!forced) {
      throw new Error(
        `forcedPrizeId "${settings.forcedPrizeId}" is not in the active pool.`
      );
    }
    return toResult(forced);
  }

  const rng = settings.rng || Math.random;
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  let ticket = rng() * totalWeight;
  for (const prize of pool) {
    ticket -= prize.weight;
    if (ticket < 0) return toResult(prize);
  }
  // Floating-point edge (rng() returned exactly 1 or accumulated rounding).
  return toResult(pool[pool.length - 1]);
}

/**
 * Record that one unit of a prize was handed out. Returns a NEW prize array
 * with that prize's inventory decremented (never below 0). Prizes without an
 * inventory field, unknown ids, and the loser slot are left untouched.
 */
export function consumePrize(prizes, prizeId) {
  return prizes.map((p) =>
    p.id === prizeId && p.inventory !== undefined
      ? { ...p, inventory: Math.max(p.inventory - 1, 0) }
      : p
  );
}
