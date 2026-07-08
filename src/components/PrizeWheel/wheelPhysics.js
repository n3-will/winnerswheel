/**
 * Pure spin physics for the vertical prize reel. No DOM, no clocks — every
 * function is a pure mapping so it can be unit-tested and driven by any
 * animation loop. Offsets are in pixels of reel travel; one "cycle" is
 * panelCount * panelSize (a full loop of the reel).
 */

export function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fraction of the spin spent traveling; the remainder is the settle bounce. */
const TRAVEL_PHASE = 0.85;

/**
 * Piecewise "momentum, bounce, and snap" progress curve:
 *  - phase 1 (0 → 0.85): cubic deceleration that glides slightly PAST the
 *    target (monotonic — the reel never stutters backwards mid-spin)
 *  - phase 2 (0.85 → 1): smooth spring back from the overshoot onto the line
 *
 * `amplitude` is the overshoot as a fraction of total travel.
 */
function settleProgress(t, amplitude) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < TRAVEL_PHASE) {
    return (1 + amplitude) * easeOutCubic(t / TRAVEL_PHASE);
  }
  const p = (t - TRAVEL_PHASE) / (1 - TRAVEL_PHASE);
  return 1 + amplitude * (1 - easeInOutCubic(p));
}

/**
 * Normalized easing form of the settle curve. `overshoot` uses the familiar
 * back-ease convention where 1.15 is a gentle bounce.
 */
export function easeOutBackSettle(t, overshoot = 1.15) {
  return settleProgress(t, (overshoot - 1) * 0.1);
}

/** Wrap any offset into [0, cycle). */
export function normalizeOffset(offset, cycle) {
  return ((offset % cycle) + cycle) % cycle;
}

const DEFAULTS = {
  minLoops: 4,
  maxLoops: 8,
  duration: 5200,
  velocity: 1,
  // px/ms of swipe velocity that maps onto extra loops of travel
  velocityToLoops: 1.2,
  // overshoot distance as a fraction of ONE panel (keeps the bounce readable
  // at any spin length instead of scaling with total distance)
  overshootPanels: 0.3
};

/**
 * Build an immutable spin plan that is guaranteed to land the target panel
 * exactly on the winner line.
 *
 * @param {object} opts
 * @param {number} opts.currentOffset  reel offset right now (any real number)
 * @param {number} opts.targetIndex    index of the winning panel in the active list
 * @param {number} opts.panelCount     number of active panels on the reel
 * @param {number} opts.panelSize      panel height in px
 * @param {number} [opts.velocity]     swipe velocity (px/ms), scales loop count
 * @param {number} [opts.minLoops]     minimum full cycles to travel
 * @param {number} [opts.maxLoops]     maximum full cycles to travel
 * @param {number} [opts.duration]     spin duration in ms
 * @param {number} [opts.overshootPanels] settle bounce, in panel heights
 */
export function createSpinPlan(opts) {
  const o = { ...DEFAULTS, ...opts };
  const cycle = o.panelCount * o.panelSize;
  const startOffset = o.currentOffset;

  const extraLoops = Math.min(
    Math.max(o.velocity, 0) * o.velocityToLoops,
    o.maxLoops - o.minLoops
  );
  // Whole loops only — a fractional loop would shift the landing position.
  const loops = Math.round(Math.min(o.maxLoops, o.minLoops + extraLoops));

  const target = o.targetIndex * o.panelSize;
  const current = normalizeOffset(startOffset, cycle);
  // Forward distance from the current position to the target position.
  const delta = normalizeOffset(target - current, cycle);
  const distance = loops * cycle + delta;

  return Object.freeze({
    startOffset,
    distance,
    duration: o.duration,
    cycle,
    overshootPx: o.overshootPanels * o.panelSize
  });
}

/** Reel offset at `elapsedMs` into the plan (clamped at the end). */
export function offsetAt(plan, elapsedMs) {
  const t = Math.min(Math.max(elapsedMs / plan.duration, 0), 1);
  const amplitude = plan.distance > 0 ? plan.overshootPx / plan.distance : 0;
  return plan.startOffset + plan.distance * settleProgress(t, amplitude);
}

export function isDone(plan, elapsedMs) {
  return elapsedMs >= plan.duration;
}
