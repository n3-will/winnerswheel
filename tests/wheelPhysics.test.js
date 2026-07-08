import { describe, it, expect } from 'vitest';
import {
  easeOutCubic,
  easeOutBackSettle,
  normalizeOffset,
  createSpinPlan,
  offsetAt,
  isDone
} from '../src/components/PrizeWheel/wheelPhysics.js';

describe('easing', () => {
  it('easeOutCubic hits its endpoints', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 10);
    expect(easeOutCubic(1)).toBeCloseTo(1, 10);
  });

  it('easeOutCubic is monotonically increasing', () => {
    let prev = 0;
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('easeOutBackSettle hits its endpoints and overshoots in between', () => {
    expect(easeOutBackSettle(0)).toBeCloseTo(0, 10);
    expect(easeOutBackSettle(1)).toBeCloseTo(1, 6);
    let overshot = false;
    for (let t = 0.5; t < 1; t += 0.01) {
      if (easeOutBackSettle(t) > 1) overshot = true;
    }
    expect(overshot).toBe(true);
  });
});

describe('normalizeOffset', () => {
  it('wraps positive and negative offsets into [0, cycle)', () => {
    expect(normalizeOffset(0, 900)).toBe(0);
    expect(normalizeOffset(900, 900)).toBe(0);
    expect(normalizeOffset(950, 900)).toBe(50);
    expect(normalizeOffset(-50, 900)).toBe(850);
    expect(normalizeOffset(-1850, 900)).toBe(850);
  });
});

describe('createSpinPlan', () => {
  const base = {
    currentOffset: 0,
    targetIndex: 3,
    panelCount: 9,
    panelSize: 100
  };

  it('lands exactly on the target panel at plan end', () => {
    const plan = createSpinPlan({ ...base, velocity: 2 });
    const final = offsetAt(plan, plan.duration);
    const cycle = base.panelCount * base.panelSize;
    expect(normalizeOffset(final, cycle)).toBeCloseTo(base.targetIndex * base.panelSize, 6);
  });

  it('lands exactly regardless of odd starting offsets', () => {
    for (const start of [0, 37.5, 250, 899.999, -123]) {
      const plan = createSpinPlan({ ...base, currentOffset: start, velocity: 1.4 });
      const final = offsetAt(plan, plan.duration);
      expect(normalizeOffset(final, 900)).toBeCloseTo(300, 6);
    }
  });

  it('always travels at least minLoops full cycles', () => {
    const plan = createSpinPlan({ ...base, minLoops: 4, velocity: 0.1 });
    expect(plan.distance).toBeGreaterThanOrEqual(4 * 900);
  });

  it('distance grows with velocity but is clamped', () => {
    const slow = createSpinPlan({ ...base, minLoops: 3, maxLoops: 8, velocity: 0.5 });
    const fast = createSpinPlan({ ...base, minLoops: 3, maxLoops: 8, velocity: 5 });
    const insane = createSpinPlan({ ...base, minLoops: 3, maxLoops: 8, velocity: 500 });
    expect(fast.distance).toBeGreaterThan(slow.distance);
    expect(insane.distance).toBeLessThanOrEqual(9 * 900); // maxLoops + landing delta < maxLoops+1 cycles
  });

  it('a short reduced-motion plan still lands exactly', () => {
    const plan = createSpinPlan({ ...base, minLoops: 1, maxLoops: 1, duration: 500, velocity: 0 });
    expect(plan.duration).toBe(500);
    const final = offsetAt(plan, plan.duration);
    expect(normalizeOffset(final, 900)).toBeCloseTo(300, 6);
  });
});

describe('offsetAt / isDone', () => {
  const plan = createSpinPlan({
    currentOffset: 100,
    targetIndex: 2,
    panelCount: 9,
    panelSize: 100,
    velocity: 2
  });

  it('starts at the start offset', () => {
    expect(offsetAt(plan, 0)).toBeCloseTo(plan.startOffset, 10);
  });

  it('clamps past the end', () => {
    expect(offsetAt(plan, plan.duration + 5000)).toBeCloseTo(
      offsetAt(plan, plan.duration),
      10
    );
  });

  it('isDone flips at duration', () => {
    expect(isDone(plan, plan.duration - 1)).toBe(false);
    expect(isDone(plan, plan.duration)).toBe(true);
  });

  it('moves monotonically forward through the main travel (pre-settle)', () => {
    // The final settle may pull back slightly (overshoot bounce); the first
    // 85% of the spin must never move backwards.
    let prev = -Infinity;
    for (let t = 0; t <= plan.duration * 0.85; t += plan.duration / 200) {
      const v = offsetAt(plan, t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('never regresses more than one panel during the settle bounce', () => {
    const final = offsetAt(plan, plan.duration);
    for (let t = plan.duration * 0.85; t <= plan.duration; t += plan.duration / 400) {
      expect(offsetAt(plan, t)).toBeLessThanOrEqual(final + 100); // ≤ 1 panelSize overshoot
    }
  });
});
