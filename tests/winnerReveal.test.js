// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { WinnerReveal } from '../src/components/PrizeWheel/WinnerReveal.js';

const results = {
  normal: { id: 'p1', title: 'Bluetooth Speaker', image: '', isGrandPrize: false, isLoser: false },
  grand: { id: 'p2', title: 'Big Screen TV', image: '', isGrandPrize: true, isLoser: false },
  loser: { id: 'loser', title: 'Try Again', image: '', isGrandPrize: false, isLoser: true }
};

describe('WinnerReveal', () => {
  let reveal;
  afterEach(() => reveal?.hide());

  it('renders the normal tier with a Winner heading', () => {
    reveal = new WinnerReveal(document.body, { normalDuration: 0 });
    reveal.show(results.normal);
    const overlay = document.querySelector('.wr');
    expect(overlay.classList.contains('wr--normal')).toBe(true);
    expect(overlay.querySelector('.wr__heading').textContent).toBe('Winner!');
    expect(overlay.querySelector('.wr__title').textContent).toBe('Bluetooth Speaker');
  });

  it('renders the grand tier with GRAND PRIZE banner and rays', () => {
    reveal = new WinnerReveal(document.body, { grandDuration: 0 });
    reveal.show(results.grand);
    const overlay = document.querySelector('.wr');
    expect(overlay.classList.contains('wr--grand')).toBe(true);
    expect(overlay.querySelector('.wr__banner').textContent).toBe('GRAND PRIZE');
    expect(overlay.querySelector('.wr__rays')).not.toBeNull();
    expect(overlay.querySelector('.wr__heading').textContent).toBe('JACKPOT!');
  });

  it('renders the loser tier without celebration', () => {
    reveal = new WinnerReveal(document.body);
    reveal.show(results.loser);
    const overlay = document.querySelector('.wr');
    expect(overlay.classList.contains('wr--loser')).toBe(true);
    expect(overlay.querySelector('.wr__banner')).toBeNull();
  });

  it('fires the matching sound hook per tier', () => {
    const sounds = [];
    reveal = new WinnerReveal(document.body, {
      onSound: (name) => sounds.push(name),
      normalDuration: 0,
      grandDuration: 0
    });
    reveal.show(results.normal);
    reveal.show(results.grand);
    reveal.show(results.loser);
    expect(sounds).toEqual(['win', 'grandWin', 'lose']);
  });

  it('resolves show() when dismissed and calls onDismiss', async () => {
    let dismissed = null;
    reveal = new WinnerReveal(document.body, {
      normalDuration: 0,
      onDismiss: (r) => { dismissed = r.id; }
    });
    const done = reveal.show(results.normal);
    document.querySelector('.wr__dismiss').click();
    await done;
    expect(dismissed).toBe('p1');
    expect(document.querySelector('.wr')).toBeNull();
  });

  it('replaces a previous overlay instead of stacking', () => {
    reveal = new WinnerReveal(document.body, { normalDuration: 0, grandDuration: 0 });
    reveal.show(results.normal);
    reveal.show(results.grand);
    expect(document.querySelectorAll('.wr')).toHaveLength(1);
  });
});
