# Digital Prize Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A polished, reusable vertical prize wheel (Price Is Right style) — swipe down to spin, momentum physics, tiered winner celebrations, Grand Prize jackpot mode — packaged as a GitHub-ready Vite project.

**Architecture:** Strict separation between prize selection (pure logic in `src/utilities/selectPrize.js`) and wheel animation (`PrizeWheel` component that only knows how to `spinTo(prizeId)`). Physics is a pure module (`wheelPhysics.js`) so it is unit-testable without a DOM. The reel renders active panels 3× stacked for seamless wraparound and animates a single GPU-friendly `translate3d` transform via rAF.

**Tech Stack:** Vanilla JS (ES modules), Vite 6, Vitest 3 (jsdom for component smoke tests). Zero runtime dependencies.

## Global Constraints

- 8 prize slots + 1 optional losing slot; 0 or 1 Grand Prize (`isGrandPrize: true` on at most one prize — validation error otherwise).
- `allowLosingResult: false` ⇒ loser panel removed from the active reel entirely (displayed possibilities always match outcome logic).
- Prize config shape: `{ id, title, image, enabled, isGrandPrize, weight }`.
- No prize logic embedded in the visual component. Integration pattern: `const result = selectPrize(prizes, settings); await wheel.spinTo(result.id); showWinner(result);`
- Pointer Events for touch/mouse/pen; keyboard-accessible spin (Space/Enter on focused wheel); `prefers-reduced-motion` support (short crossfade snap instead of long spin).
- Result locking once a spin starts; no double-spins.
- Deterministic support: `selectPrize` accepts injectable `rng` and settings may include `forcedPrizeId` (server-selected winner).
- GPU-friendly: only `transform`/`opacity` animate; `will-change: transform` on the reel.
- No `Date.now` coupling in physics — pure functions of elapsed time.
- MIT LICENSE, GitHub-ready README, docs/configuration.md.
- **Primary deployment target: 100-inch Android tablet** (huge pixel count, mid-range mobile GPU). Hard rules: animate `transform`/`opacity` only; single composited layer for the reel; confetti on `<canvas>` with `devicePixelRatio` capped at 1.5 and particle budget scaled to viewport; no CSS `filter: blur()`, no animated large `box-shadow` glows (use pre-baked radial gradients); passive touch listeners except the drag surface; no layout reads inside the rAF loop (measure once per resize).
- **Responsive range: small phone → 100" tablet, portrait-first, landscape fully supported.** All wheel dimensions derive from one scale unit (container-query `cqmin`-based custom property, `ResizeObserver` fallback) so the wheel is proportionally identical at 320px and 4K. Portrait: wheel fills width, reveal overlays. Landscape: wheel column + side stage for branding/reveal. Type/spacing via `clamp()`; no fixed px breakpoint forks for core geometry.

---

### Task 1: Project scaffold

**Files:** Create `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `LICENSE` (MIT, Bill Crandell).

- [ ] npm scripts: `dev`, `build`, `preview`, `test` (`vitest run`), `test:watch`.
- [ ] devDependencies: `vite ^6`, `vitest ^3`, `jsdom`.
- [ ] `vite.config.js`: root default, `test: { environment: 'jsdom' }`.
- [ ] `npm install` succeeds; commit "chore: scaffold vite project".

### Task 2: selectPrize utility (TDD)

**Files:** Create `src/utilities/selectPrize.js`, `tests/selectPrize.test.js`.

**Produces:**
- `validatePrizes(prizes)` → throws on: >1 `isGrandPrize`, duplicate ids, empty active pool.
- `getActivePrizes(prizes, settings)` → enabled prizes; includes the loser slot (`isLoser: true` entry) only when `settings.allowLosingResult`.
- `selectPrize(prizes, settings)` → `{ id, title, image, isGrandPrize, isLoser, prize }`. Options in `settings`: `allowLosingResult`, `forcedPrizeId`, `rng` (default `Math.random`). Weighted selection by `weight` (default 1; weight ≤ 0 treated as excluded).

Test cases (write first, verify fail, implement, verify pass, commit):
- throws when two prizes have `isGrandPrize: true`
- throws on duplicate ids / empty active pool
- excludes `enabled: false` prizes and the loser when `allowLosingResult: false`
- includes loser in pool when `allowLosingResult: true`
- `forcedPrizeId` returns that prize regardless of rng; throws if forced id not in active pool
- weighted distribution: with rng stubbed at boundary values, correct prize picked; weight 0 never picked
- deterministic: same seeded rng sequence → same result

### Task 3: wheelPhysics (TDD)

**Files:** Create `src/components/PrizeWheel/wheelPhysics.js`, `tests/wheelPhysics.test.js`.

**Produces (pure functions):**
- `easeOutCubic(t)`, `easeOutBackSettle(t, overshoot=1.15)` — composite ease that overshoots the target slightly then settles (the "bounce & snap").
- `normalizeOffset(offset, cycle)` → offset wrapped into `[0, cycle)`.
- `createSpinPlan({ currentOffset, targetIndex, panelCount, panelSize, minLoops=4, extraLoops=0..2 via strength, duration, velocity })` → `{ startOffset, distance, duration }` where `startOffset + distance` lands the target panel exactly at the winner line (`distance = loops*cycle + delta`, always ≥ minLoops·cycle, scaled by swipe velocity/strength within configured bounds).
- `offsetAt(plan, elapsedMs)` → current offset (clamped at end); `isDone(plan, elapsedMs)`.

Tests: wrap math; landing exactness (`offsetAt(plan, plan.duration) % cycle === targetIndex*panelSize` within 1e-6); monotonic distance growth with velocity, clamped to bounds; easing endpoints (0→0, 1→1); reduced-duration plan still lands exactly.

### Task 4: PrizePanel + PrizeWheel rendering + CSS

**Files:** Create `src/components/PrizeWheel/PrizePanel.js`, `PrizeWheel.js` (render half), `PrizeWheel.css`.

- `createPrizePanel(prize)` → `<li class="pw-panel" data-prize-id>` with image + title, `pw-panel--grand` / `pw-panel--loser` modifiers.
- `PrizeWheel` class: `new PrizeWheel(container, { prizes, settings, callbacks })`; `setPrizes()` rebuilds reel from `getActivePrizes` (loser omitted when disabled). Renders frame, winner window (center highlight + side pointers), reel `<ul>` with panels repeated ×3, applies `translate3d(0, y, 0)`.
- CSS: portrait & landscape responsive (container queries/aspect media), carnival frame with lightbulb dots, gradient panels, `will-change: transform`, `:focus-visible` ring, `@media (prefers-reduced-motion: reduce)` hooks.
- jsdom smoke test: renders 8 panels ×3 when loser disabled, 9×3 when enabled; grand prize panel has modifier class. Commit.

### Task 5: Interaction + spin animation

**Files:** Modify `PrizeWheel.js`.

- Pointer Events drag: track downward swipe, live-drag the reel (rubber-band), on release compute velocity (px/ms over last 80ms); ignore upward/short swipes.
- `spinTo(prizeId, { velocity })` → Promise; builds plan via `createSpinPlan`, rAF loop, resolves on settle. State machine `idle → spinning → settled`; all input ignored while not idle (result locking / double-spin prevention). Keyboard: Space/Enter triggers `onSpinRequest` with default velocity.
- Callbacks: `onSpinRequest(velocity)` (host runs selectPrize then calls spinTo), `onSpinStart(result)`, `onSpinEnd(result)`. Wheel never selects prizes itself.
- Reduced motion: plan duration forced short (~600ms, 1 loop) + crossfade class.
- Settings: `spinDuration`, `spinStrength`, `minLoops`.
- Tests: state locking (second spinTo while spinning rejects/no-ops), spinTo resolves and reel data-winner set. Commit.

### Task 6: WinnerReveal + preloading

**Files:** Create `src/components/PrizeWheel/WinnerReveal.js`, `src/utilities/preloadImages.js`.

- `preloadImages(prizes)` → Promise, `new Image()` per prize image, resolves when settled (never rejects on individual failure).
- `WinnerReveal.show(result)` overlay:
  - **Loser tier:** gentle "So close!" card, subdued styling, quick dismiss.
  - **Normal tier:** prize image, title, confetti burst (~80 DOM/canvas particles), ~4s auto-advance, dismiss button.
  - **Grand tier:** "GRAND PRIZE" banner, prize image hero-sized, gold light rays, screen shake (respecting reduced-motion), 2× confetti + streamers, longer presentation (~7s), distinct sound hook via `onSound('grandWin')` callback (no bundled audio; host wires sounds).
- Canvas confetti with rAF, capped particle count, cleaned up on hide. Reduced motion: static celebratory card, no particles/shake.
- Commit.

### Task 7: Demo app + assets

**Files:** Create `src/main.js`, `src/config/prizes.js`, `public/assets/prizes/*.svg` (9 placeholder SVGs incl. loser + grand), demo controls in `index.html`.

- `src/config/prizes.js`: 8 prizes (one `isGrandPrize: true`) + `loserPrize` + `defaultSettings { allowLosingResult: true, spinDuration: 5200, minLoops: 4, spinStrength: 1 }`.
- `main.js`: preload → construct wheel → wire `onSpinRequest` → `selectPrize` → `spinTo` → `WinnerReveal.show`. Demo toggles: allowLosingResult checkbox, force-grand button (uses `forcedPrizeId` to demo determinism).
- Verify `npm run build` passes and dev server renders. Commit.

### Task 8: Docs + final verification

**Files:** Create `README.md`, `docs/configuration.md`; final test/build run.

- README: hero description, features, quickstart, config reference, integration example (the three-line pattern), server-selected winners, events, accessibility notes, license.
- docs/configuration.md: every prize field + every setting documented with defaults.
- `npm test` all green; `npm run build` clean; browser check via dev server. Final commit.

## Self-Review

- Spec coverage: all bullets in Global Constraints map to Tasks 2 (selection/weights/determinism/grand-prize validation/loser), 3 (momentum/easing/bounce/snap/landing), 4 (responsive/GPU/visuals/loser omitted from reel), 5 (touch/mouse/pointer/keyboard/locking/double-spin/config strength+duration/callbacks/reduced motion), 6 (celebration tiers, grand prize treatment, preloading, sound hook), 7 (demo, config module, assets), 8 (README/docs/LICENSE — LICENSE in Task 1). ✓
- Interfaces consistent: `selectPrize(prizes, settings)`, `spinTo(prizeId)`, `createSpinPlan/offsetAt/isDone` used identically across tasks. ✓
