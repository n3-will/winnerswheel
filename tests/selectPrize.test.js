import { describe, it, expect } from 'vitest';
import {
  validatePrizes,
  getActivePrizes,
  selectPrize,
  consumePrize,
  LOSER_ID
} from '../src/utilities/selectPrize.js';

function makePrizes(overrides = []) {
  const prizes = Array.from({ length: 8 }, (_, i) => ({
    id: `prize-${i + 1}`,
    title: `Prize ${i + 1}`,
    image: `/assets/prizes/prize-${i + 1}.svg`,
    enabled: true,
    isGrandPrize: false,
    weight: 1
  }));
  for (const o of overrides) Object.assign(prizes[o.index], o.patch);
  return prizes;
}

describe('validatePrizes', () => {
  it('accepts a valid 8-prize config with one grand prize', () => {
    const prizes = makePrizes([{ index: 0, patch: { isGrandPrize: true } }]);
    expect(() => validatePrizes(prizes)).not.toThrow();
  });

  it('throws when two prizes are marked as the Grand Prize', () => {
    const prizes = makePrizes([
      { index: 0, patch: { isGrandPrize: true } },
      { index: 3, patch: { isGrandPrize: true } }
    ]);
    expect(() => validatePrizes(prizes)).toThrow(/grand prize/i);
  });

  it('throws on duplicate prize ids', () => {
    const prizes = makePrizes([{ index: 1, patch: { id: 'prize-1' } }]);
    expect(() => validatePrizes(prizes)).toThrow(/duplicate/i);
  });

  it('throws when no prizes are enabled', () => {
    const prizes = makePrizes().map((p) => ({ ...p, enabled: false }));
    expect(() => validatePrizes(prizes)).toThrow(/no enabled/i);
  });
});

describe('getActivePrizes', () => {
  it('excludes disabled prizes', () => {
    const prizes = makePrizes([{ index: 2, patch: { enabled: false } }]);
    const active = getActivePrizes(prizes, { allowLosingResult: false });
    expect(active).toHaveLength(7);
    expect(active.find((p) => p.id === 'prize-3')).toBeUndefined();
  });

  it('omits the loser slot when allowLosingResult is false', () => {
    const active = getActivePrizes(makePrizes(), { allowLosingResult: false });
    expect(active.some((p) => p.isLoser)).toBe(false);
  });

  it('includes the loser slot when allowLosingResult is true', () => {
    const active = getActivePrizes(makePrizes(), { allowLosingResult: true });
    expect(active).toHaveLength(9);
    const loser = active.find((p) => p.isLoser);
    expect(loser).toBeDefined();
    expect(loser.id).toBe(LOSER_ID);
  });

  it('uses a custom loser prize definition when provided', () => {
    const active = getActivePrizes(makePrizes(), {
      allowLosingResult: true,
      loserPrize: { id: 'loser', title: 'Better Luck!', image: '/x.svg' }
    });
    expect(active.find((p) => p.isLoser).title).toBe('Better Luck!');
  });

  it('keeps zero-weight prizes on the reel but marks them out of stock', () => {
    const prizes = makePrizes([{ index: 4, patch: { weight: 0 } }]);
    const active = getActivePrizes(prizes, { allowLosingResult: false });
    const spot = active.find((p) => p.id === 'prize-5');
    expect(spot).toBeDefined();
    expect(spot.weight).toBe(0);
    expect(spot.outOfStock).toBe(true);
  });
});

describe('selectPrize', () => {
  it('returns a result object with id, title, image, flags and prize', () => {
    const result = selectPrize(makePrizes(), { allowLosingResult: false });
    expect(result).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      image: expect.any(String),
      isGrandPrize: false,
      isLoser: false
    });
    expect(result.prize).toBeDefined();
  });

  it('never returns the loser when allowLosingResult is false', () => {
    const prizes = makePrizes();
    for (let i = 0; i < 200; i++) {
      const result = selectPrize(prizes, { allowLosingResult: false });
      expect(result.isLoser).toBe(false);
    }
  });

  it('honors forcedPrizeId regardless of rng', () => {
    const result = selectPrize(makePrizes(), {
      allowLosingResult: true,
      forcedPrizeId: 'prize-6',
      rng: () => 0.0001
    });
    expect(result.id).toBe('prize-6');
  });

  it('throws when forcedPrizeId is not in the active pool', () => {
    const prizes = makePrizes([{ index: 5, patch: { enabled: false } }]);
    expect(() =>
      selectPrize(prizes, { allowLosingResult: false, forcedPrizeId: 'prize-6' })
    ).toThrow(/not in the active pool/i);
    expect(() =>
      selectPrize(prizes, { allowLosingResult: false, forcedPrizeId: 'nope' })
    ).toThrow(/not in the active pool/i);
  });

  it('selects by weight boundaries with an injected rng', () => {
    // weights: prize-1 has 3, everything else 1 => total 10 (8 prizes, no loser)
    const prizes = makePrizes([{ index: 0, patch: { weight: 3 } }]);
    const settings = { allowLosingResult: false };
    // rng just below 0.3 => within prize-1's band [0, 3/10)
    expect(selectPrize(prizes, { ...settings, rng: () => 0.29 }).id).toBe('prize-1');
    // rng at 0.3 => first weight-1 prize (prize-2's band [3/10, 4/10))
    expect(selectPrize(prizes, { ...settings, rng: () => 0.3 }).id).toBe('prize-2');
    // rng just below 1 => last prize
    expect(selectPrize(prizes, { ...settings, rng: () => 0.999999 }).id).toBe('prize-8');
  });

  it('never selects a prize with weight 0', () => {
    const prizes = makePrizes([{ index: 0, patch: { weight: 0 } }]);
    for (let i = 0; i < 200; i++) {
      expect(selectPrize(prizes, { allowLosingResult: false }).id).not.toBe('prize-1');
    }
  });

  it('is deterministic with the same rng sequence', () => {
    const makeRng = (seed) => () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const prizes = makePrizes([{ index: 2, patch: { weight: 5 } }]);
    const a = selectPrize(prizes, { allowLosingResult: true, rng: makeRng(42) });
    const b = selectPrize(prizes, { allowLosingResult: true, rng: makeRng(42) });
    expect(a.id).toBe(b.id);
  });

  it('marks grand prize results', () => {
    const prizes = makePrizes([{ index: 0, patch: { isGrandPrize: true } }]);
    const result = selectPrize(prizes, {
      allowLosingResult: false,
      forcedPrizeId: 'prize-1'
    });
    expect(result.isGrandPrize).toBe(true);
  });

  it('bases odds on remaining inventory when inventory is set', () => {
    // inventories: prize-1: 6, prize-2: 3, prize-3: 1, rest disabled => total 10
    const prizes = makePrizes([
      { index: 0, patch: { inventory: 6 } },
      { index: 1, patch: { inventory: 3 } },
      { index: 2, patch: { inventory: 1 } },
      ...[3, 4, 5, 6, 7].map((i) => ({ index: i, patch: { enabled: false } }))
    ]);
    const settings = { allowLosingResult: false };
    expect(selectPrize(prizes, { ...settings, rng: () => 0.59 }).id).toBe('prize-1');
    expect(selectPrize(prizes, { ...settings, rng: () => 0.6 }).id).toBe('prize-2');
    expect(selectPrize(prizes, { ...settings, rng: () => 0.91 }).id).toBe('prize-3');
  });

  it('keeps zero-inventory spots visible on the reel but never lands on them', () => {
    const prizes = makePrizes([{ index: 0, patch: { inventory: 0 } }]);
    const active = getActivePrizes(prizes, { allowLosingResult: false });
    const spot = active.find((p) => p.id === 'prize-1');
    expect(spot).toBeDefined(); // still displayed
    expect(spot.outOfStock).toBe(true);
    for (let i = 0; i < 100; i++) {
      expect(selectPrize(prizes, { allowLosingResult: false }).id).not.toBe('prize-1');
    }
  });

  it('refuses to force a prize that is out of stock', () => {
    const prizes = makePrizes([{ index: 0, patch: { inventory: 0 } }]);
    expect(() =>
      selectPrize(prizes, { allowLosingResult: false, forcedPrizeId: 'prize-1' })
    ).toThrow(/out of stock/i);
  });

  it('multiplies weight and inventory when both are set', () => {
    // prize-1: w2*inv3=6, prize-2: w1*inv4=4, rest off => total 10
    const prizes = makePrizes([
      { index: 0, patch: { weight: 2, inventory: 3 } },
      { index: 1, patch: { inventory: 4 } },
      ...[2, 3, 4, 5, 6, 7].map((i) => ({ index: i, patch: { enabled: false } }))
    ]);
    const settings = { allowLosingResult: false };
    expect(selectPrize(prizes, { ...settings, rng: () => 0.59 }).id).toBe('prize-1');
    expect(selectPrize(prizes, { ...settings, rng: () => 0.61 }).id).toBe('prize-2');
  });

  it('throws when every prize is out of stock and losing is not allowed', () => {
    const prizes = makePrizes().map((p) => ({ ...p, inventory: 0 }));
    expect(() => selectPrize(prizes, { allowLosingResult: false })).toThrow(/no prizes available/i);
  });

  it('consumePrize decrements inventory immutably and ignores the loser', () => {
    const prizes = makePrizes([{ index: 0, patch: { inventory: 2 } }]);
    const next = consumePrize(prizes, 'prize-1');
    expect(next.find((p) => p.id === 'prize-1').inventory).toBe(1);
    expect(prizes.find((p) => p.id === 'prize-1').inventory).toBe(2); // untouched
    const depleted = consumePrize(next, 'prize-1');
    expect(depleted.find((p) => p.id === 'prize-1').inventory).toBe(0);
    // consuming below zero or non-inventory prizes is a no-op
    expect(consumePrize(depleted, 'prize-1').find((p) => p.id === 'prize-1').inventory).toBe(0);
    expect(consumePrize(prizes, LOSER_ID)).toEqual(prizes);
    expect(consumePrize(prizes, 'prize-2').find((p) => p.id === 'prize-2').inventory).toBeUndefined();
  });

  it('can return the loser via loserWeight when allowed', () => {
    const result = selectPrize(makePrizes(), {
      allowLosingResult: true,
      loserWeight: 1,
      rng: () => 0.9999 // loser slot appended last
    });
    expect(result.isLoser).toBe(true);
  });
});
