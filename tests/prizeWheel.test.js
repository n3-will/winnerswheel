// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrizeWheel } from '../src/components/PrizeWheel/PrizeWheel.js';
import { getActivePrizes } from '../src/utilities/selectPrize.js';

function makePrizes() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `prize-${i + 1}`,
    title: `Prize ${i + 1}`,
    image: '',
    enabled: true,
    isGrandPrize: i === 0,
    weight: 1
  }));
}

describe('PrizeWheel', () => {
  let container;
  let wheel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    wheel?.destroy();
    container.remove();
  });

  it('renders each active panel 3x with loser omitted when disabled', () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels });
    expect(container.querySelectorAll('.pw-panel')).toHaveLength(8 * 3);
    expect(container.querySelectorAll('.pw-panel--loser')).toHaveLength(0);
  });

  it('renders the loser panel when enabled', () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: true });
    wheel = new PrizeWheel(container, { panels });
    expect(container.querySelectorAll('.pw-panel')).toHaveLength(9 * 3);
    expect(container.querySelectorAll('.pw-panel--loser')).toHaveLength(3);
  });

  it('marks the grand prize panel', () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels });
    const grand = container.querySelector('.pw-panel--grand');
    expect(grand).not.toBeNull();
    expect(grand.dataset.prizeId).toBe('prize-1');
    expect(grand.querySelector('.pw-panel__badge').textContent).toBe('GRAND PRIZE');
  });

  it('spinTo resolves, sets the winner id and highlights the panel', async () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    const events = [];
    wheel = new PrizeWheel(container, {
      panels,
      spinDuration: 80,
      minLoops: 1,
      maxLoops: 1,
      onSpinStart: (id) => events.push(`start:${id}`),
      onSpinEnd: (id) => events.push(`end:${id}`)
    });
    await wheel.spinTo('prize-4', { velocity: 1 });
    expect(wheel.root.dataset.winnerId).toBe('prize-4');
    expect(wheel.state).toBe('idle');
    expect(events).toEqual(['start:prize-4', 'end:prize-4']);
    expect(container.querySelectorAll('.pw-panel--winner')).toHaveLength(3);
  });

  it('locks out a second spin while spinning (double-spin prevention)', async () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels, spinDuration: 120, minLoops: 1, maxLoops: 1 });
    const first = wheel.spinTo('prize-2');
    await expect(wheel.spinTo('prize-5')).rejects.toThrow(/already in progress/i);
    await first;
    expect(wheel.root.dataset.winnerId).toBe('prize-2');
  });

  it('rejects spinning to a prize that is not on the reel', async () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels });
    await expect(wheel.spinTo('nope')).rejects.toThrow(/not on the reel/i);
  });

  it('refuses panel changes mid-spin', async () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels, spinDuration: 120, minLoops: 1, maxLoops: 1 });
    const spin = wheel.spinTo('prize-3');
    expect(() => wheel.setPanels(panels)).toThrow(/mid-spin/i);
    await spin;
  });

  it('highlightHit toggles the hit dim and resolves', async () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    wheel = new PrizeWheel(container, { panels });
    const done = wheel.highlightHit(30);
    expect(wheel.root.dataset.hit).toBe('1');
    await done;
    expect(wheel.root.dataset.hit).toBeUndefined();
  });

  it('keyboard Space triggers onSpinRequest', () => {
    const panels = getActivePrizes(makePrizes(), { allowLosingResult: false });
    let requested = null;
    wheel = new PrizeWheel(container, {
      panels,
      onSpinRequest: (v) => { requested = v; }
    });
    wheel.root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(requested).not.toBeNull();
  });
});
