/**
 * Prize configuration — the single place to define what's on the wheel.
 * Exactly 8 prize slots; at most ONE may set isGrandPrize: true.
 * The optional losing slot is configured separately (loserPrize) and is
 * only added to the reel when settings.allowLosingResult is true.
 */

export const prizes = [
  {
    id: 'prize-1',
    title: 'Mystery Gift',
    image: './assets/prizes/mystery-gift.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-2',
    title: 'Headphones',
    image: './assets/prizes/headphones.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-3',
    title: 'Gift Card',
    image: './assets/prizes/gift-card.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-4',
    title: 'Big Screen TV',
    image: './assets/prizes/grand-tv.svg',
    enabled: true,
    isGrandPrize: true,
    weight: 0.25
  },
  {
    id: 'prize-5',
    title: 'BT Speaker',
    image: './assets/prizes/speaker.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-6',
    title: 'Plush Toy',
    image: './assets/prizes/plush-toy.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-7',
    title: 'Movie Night',
    image: './assets/prizes/movie-night.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  },
  {
    id: 'prize-8',
    title: 'Snack Pack',
    image: './assets/prizes/snack-pack.svg',
    enabled: true,
    isGrandPrize: false,
    weight: 1
  }
];

export const loserPrize = {
  id: 'loser',
  title: 'Try Again',
  image: './assets/prizes/try-again.svg'
};

export const defaultSettings = {
  allowLosingResult: true,
  loserPrize,
  loserWeight: 1,
  // wheel feel
  spinDuration: 5200,
  minLoops: 4,
  maxLoops: 8,
  spinStrength: 1
};
