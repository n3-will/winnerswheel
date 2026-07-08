# Digital Prize Wheel

A beautiful, polished **vertical prize wheel** inspired by the Price Is Right — built as a reusable, dependency-free JavaScript component. Players swipe down to spin; the reel moves with convincing momentum, glides past the winner line, and springs back with a satisfying snap. Winners get a tiered celebration, and a configured **Grand Prize** gets the full jackpot moment.

Designed to run smoothly everywhere from a small phone to a 100-inch Android tablet.

## Features

- 🎡 **True 3D drum** — rows are widest at the winner line and taper toward the top and bottom, ~8–9 rows visible, silver-railed panels like a casino cabinet; exact-landing spin physics
- 📦 **Inventory-based odds** — chance of winning each door prize is proportional to how many are physically left; depleted prizes drop off the reel automatically
- ⚙️ **Operator settings popup** — set each spot's label, image, and inventory live; config persists in localStorage
- 🔐 **Inventory lockout** — when no prize has stock left (even if the losing spot is enabled), the wheel refuses to spin and asks for an inventory reload
- 🎯 **Winner hit moment** — the rest of the wheel darkens for ~2 s so the landed spot reads clearly before the celebration animates in
- 👆 **Touch, mouse, pen** (Pointer Events) + **keyboard-accessible** spin (Space/Enter)
- 🏆 **Grand Prize tier** — GRAND PRIZE banner, rotating light rays, screen shake, double confetti + streamers, longer reveal, distinct sound hook
- 🎉 **Normal win tier** — prize card + canvas confetti burst
- 😅 **Optional losing slot** — toggle globally; when disabled it's removed from the reel entirely, so displayed possibilities always match the outcome logic
- ⚖️ **Weighted, equal, or inventory-driven probabilities**, deterministic/server-selected winners
- 🔒 **Result locking** — input is ignored mid-spin; double-spins are impossible
- 📱 **Responsive** portrait-first layout, landscape supported, scales fluidly from 320 px phones to 4K wallboards
- ⚡ **GPU-friendly** — only `transform`/`opacity` animate; single composited reel layer; confetti on a DPR-capped canvas with a hard particle budget
- ♿ **Reduced-motion support** — short snap spin, no particles/shake
- 🧩 **Zero runtime dependencies**, plain ES modules

## Quick start

```bash
npm install
npm run dev      # demo at http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # production bundle in dist/
```

## Architecture: selection ≠ animation

Prize logic lives in `src/utilities/selectPrize.js`. The wheel component only knows how to *display* panels and *spin to an id*:

```js
import { prizes, defaultSettings } from './config/prizes.js';
import { selectPrize, getActivePrizes } from './utilities/selectPrize.js';
import { PrizeWheel } from './components/PrizeWheel/PrizeWheel.js';
import { WinnerReveal } from './components/PrizeWheel/WinnerReveal.js';

const wheel = new PrizeWheel(document.getElementById('wheel-root'), {
  panels: getActivePrizes(prizes, defaultSettings),
  onSpinRequest: async (velocity) => {
    const result = selectPrize(prizes, defaultSettings); // logic
    await wheel.spinTo(result.id, { velocity });         // animation
    reveal.show(result);                                 // celebration
  }
});

const reveal = new WinnerReveal(document.body, {
  onSound: (name) => audio.play(name) // 'win' | 'grandWin' | 'lose'
});
```

Because the wheel never chooses winners, the same component works for random giveaways, server-selected winners, guaranteed-prize campaigns, weighted inventories, and future WordPress/Discord/stream-overlay integrations.

### Server-selected (deterministic) winners

```js
const result = selectPrize(prizes, {
  ...defaultSettings,
  forcedPrizeId: await api.drawWinner() // server decides; wheel just performs
});
await wheel.spinTo(result.id);
```

## Prize configuration

Eight prize slots; **at most one** may set `isGrandPrize: true` (validated — two throws an error). The Grand Prize is not a ninth slot, it's a designation on an existing prize.

```js
{
  id: 'prize-1',
  title: 'Mystery Gift',
  image: '/assets/prizes/mystery-gift.webp',
  enabled: true,
  isGrandPrize: false,
  weight: 1,       // optional per-item multiplier
  inventory: 10    // how many are physically left — drives the odds
}
```

### Door-prize inventory

Odds are **based on inventory, not pure random**: with `inventory` set, a prize's chance is proportional to its remaining stock (`weight` acts as an optional multiplier). After handing a prize out, record it:

```js
prizes = consumePrize(prizes, result.id);          // decrements inventory
wheel.setPanels(getActivePrizes(prizes, settings)); // depleted prizes vanish from the reel
```

A prize at `inventory: 0` is excluded from both the draw and the reel, so the wheel never shows something you can't give away. Omit `inventory` entirely for plain weighted/equal odds.

The losing slot is global:

```js
settings.allowLosingResult = true;   // loser panel on reel and in the draw
settings.allowLosingResult = false;  // loser removed from reel entirely
```

See [docs/configuration.md](docs/configuration.md) for every option (spin duration, loop counts, strength, loser weight, reveal durations, callbacks).

## Events & callbacks

| Hook | Fired |
| --- | --- |
| `onSpinRequest(velocity)` | user swiped/pressed to spin — run your selection and call `spinTo` |
| `onSpinStart(prizeId)` | reel starts moving |
| `onSpinEnd(prizeId)` | reel has settled on the winner line |
| `WinnerReveal onSound(name)` | `'win'`, `'grandWin'`, `'lose'` — wire your audio here |
| `WinnerReveal onDismiss(result)` | reveal closed (button or auto-timeout) |

## Performance notes (large displays)

Built for giant Android tablets driving huge pixel counts on mid-range GPUs:

- The reel animates a single `translate3d` transform — no layout, no paint
- Confetti renders on one `<canvas>` capped at `devicePixelRatio` 1.5 with a hard particle budget (~160), so a 4K panel costs the same per frame as a laptop
- No CSS blurs or animated box-shadows; glows are pre-baked gradients
- A failsafe timer finalizes spins even if the tab is backgrounded and `requestAnimationFrame` is suspended

## Project structure

```
digital-prize-wheel/
├── public/assets/prizes/     # prize artwork
├── src/
│   ├── components/PrizeWheel/
│   │   ├── PrizeWheel.js     # reel rendering, input, spin animation
│   │   ├── PrizeWheel.css
│   │   ├── PrizePanel.js     # single panel renderer
│   │   ├── WinnerReveal.js   # tiered celebration overlay
│   │   ├── WinnerReveal.css
│   │   └── wheelPhysics.js   # pure spin math (fully unit-tested)
│   ├── config/prizes.js      # prize + settings definitions
│   ├── utilities/
│   │   ├── selectPrize.js    # validation + weighted/deterministic draw
│   │   └── preloadImages.js
│   ├── main.js               # demo wiring
│   └── styles.css            # demo stage layout
├── tests/                    # vitest suites
└── docs/configuration.md
```

## License

[MIT](LICENSE) © Bill Crandell
