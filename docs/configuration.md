# Configuration reference

## Prize object

Each of the 8 prize slots in `src/config/prizes.js`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | — | Unique id. Duplicates throw at validation. |
| `title` | string | — | Display name on the panel and in the reveal. |
| `image` | string | — | Path/URL to the prize image. Preload with `preloadImages()`. |
| `enabled` | boolean | `true` | `false` removes the prize from the reel and the draw. |
| `isGrandPrize` | boolean | `false` | Marks THE Grand Prize. At most one prize may set this; two throws. Zero is fine. |
| `weight` | number | `1` | Relative selection probability, or a per-item multiplier when `inventory` is set. At `0` the spot stays on the reel but can never be landed on. |
| `inventory` | number | — | Door-prize stock remaining. When set, odds are proportional to `weight × inventory`. At `0` the spot stays visible on the reel (marked `outOfStock` / `pw-panel--empty`) but can never be hit. Decrement with `consumePrize(prizes, id)` after each win. |

## Settings (`selectPrize` / `getActivePrizes`)

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `allowLosingResult` | boolean | — | `true`: loser slot appears on the reel and in the draw. `false`: removed entirely so the reel only shows winnable prizes. |
| `loserPrize` | object | built-in "Try Again" | Override id/title/image of the losing slot. |
| `loserWeight` | number | `1` | Selection weight of the losing slot. |
| `forcedPrizeId` | string | — | Deterministic winner (e.g., server-selected). Throws if the id is not in the active pool. |
| `rng` | function | `Math.random` | Injectable random source for testing/seeding. |

## PrizeWheel options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `panels` | array | — | Active pool from `getActivePrizes(prizes, settings)`. |
| `visiblePanels` | number | `3` | Panels visible in the window; the middle one is the winner line. |
| `spinDuration` | number | `5200` | Spin length in ms (reduced-motion users get ~600 ms). |
| `minLoops` | number | `4` | Minimum full reel cycles per spin. |
| `maxLoops` | number | `8` | Maximum full reel cycles (caps swipe velocity influence). |
| `spinStrength` | number | `1` | Multiplier applied to swipe velocity before mapping to loops. |
| `onSpinRequest` | function | — | `(velocity)` — user wants to spin. Select a prize and call `spinTo`. |
| `onSpinStart` | function | — | `(prizeId)` — reel started. |
| `onSpinEnd` | function | — | `(prizeId)` — reel settled. |

### Methods

- `spinTo(prizeId, { velocity }) → Promise` — resolves when settled; rejects if a spin is in progress or the id isn't on the reel.
- `highlightHit(ms = 2000) → Promise` — dims everything except the winner row for `ms`, so the hit reads clearly before the reveal.
- `setPanels(panels)` — rebuild the reel (idle only; throws mid-spin).
- `destroy()` — remove DOM and listeners.

## WinnerReveal options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `onSound` | function | — | `('win' \| 'grandWin' \| 'lose')` — wire audio here; no sounds are bundled. |
| `onDismiss` | function | — | `(result)` — reveal closed. |
| `normalDuration` | number | `4000` | Auto-dismiss ms for normal wins (`0` = manual only). |
| `grandDuration` | number | `7000` | Auto-dismiss ms for the Grand Prize moment. |

### Celebration tiers

| Tier | Trigger | Treatment |
| --- | --- | --- |
| Loser | `result.isLoser` | Subdued "So close!" card, quick dismiss, `lose` sound hook. |
| Normal | any other prize | Prize image + title card, confetti burst, `win` sound hook. |
| Grand | `result.isGrandPrize` | GRAND PRIZE banner, JACKPOT heading, hero image, rotating light rays, screen shake, 2× confetti + streamers, longer presentation, `grandWin` sound hook. |

All celebration motion respects `prefers-reduced-motion`.
