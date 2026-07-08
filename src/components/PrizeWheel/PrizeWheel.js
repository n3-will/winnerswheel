import { createPrizePanel } from './PrizePanel.js';
import { createSpinPlan, offsetAt, isDone, normalizeOffset } from './wheelPhysics.js';

/**
 * Vertical prize reel (Price Is Right style). Purely visual + interactive:
 * it renders panels, handles swipe/keyboard input, and can animate to a
 * given prize id. It NEVER selects winners — the host app does:
 *
 *   const result = selectPrize(prizes, settings);
 *   await wheel.spinTo(result.id, { velocity });
 *   showWinner(result);
 *
 * Panels are rendered 3× and the reel wraps seamlessly by keeping the
 * translate within the middle copy. Only `transform` is animated (single
 * composited layer — critical for very large, low-GPU displays).
 */

const REPEATS = 3;
const SWIPE_MIN_DISTANCE = 60; // px of downward drag to count as a spin
const SWIPE_MIN_VELOCITY = 0.25; // px/ms
const DRAG_RESISTANCE = 0.55;
const VELOCITY_WINDOW_MS = 90;

const noop = () => {};

export class PrizeWheel {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {Array}  options.panels        active pool entries (from getActivePrizes)
   * @param {number} [options.visiblePanels=3]
   * @param {number} [options.spinDuration=5200] ms
   * @param {number} [options.minLoops=4]
   * @param {number} [options.maxLoops=8]
   * @param {number} [options.spinStrength=1]  multiplier applied to swipe velocity
   * @param {Function} [options.onSpinRequest] (velocity) => void — user asked to spin
   * @param {Function} [options.onSpinStart]   (prizeId) => void
   * @param {Function} [options.onSpinEnd]     (prizeId) => void
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      visiblePanels: 3,
      spinDuration: 5200,
      minLoops: 4,
      maxLoops: 8,
      spinStrength: 1,
      onSpinRequest: noop,
      onSpinStart: noop,
      onSpinEnd: noop,
      ...options
    };

    this.panels = options.panels || [];
    this.state = 'idle'; // idle | spinning
    this.offset = 0;
    this.panelSize = 100;
    this._raf = 0;
    this._drag = null;
    this._pendingMeasure = false;

    this._reducedMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    this._buildDom();
    this.setPanels(this.panels);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      this._resizeObserver.observe(this.root);
    }
  }

  _buildDom() {
    const root = document.createElement('div');
    root.className = 'pw';
    root.dataset.state = 'idle';
    root.tabIndex = 0;
    root.setAttribute('role', 'button');
    root.setAttribute('aria-label', 'Prize wheel. Press Enter or Space, or swipe down, to spin.');

    root.innerHTML = `
      <div class="pw__frame">
        <div class="pw__lights" aria-hidden="true"></div>
        <div class="pw__viewport">
          <ul class="pw__reel"></ul>
          <div class="pw__shade pw__shade--top" aria-hidden="true"></div>
          <div class="pw__shade pw__shade--bottom" aria-hidden="true"></div>
          <div class="pw__window" aria-hidden="true">
            <span class="pw__pointer pw__pointer--left"></span>
            <span class="pw__pointer pw__pointer--right"></span>
          </div>
        </div>
      </div>`;

    this.root = root;
    this.viewport = root.querySelector('.pw__viewport');
    this.reel = root.querySelector('.pw__reel');
    this.lights = root.querySelector('.pw__lights');
    this.container.appendChild(root);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    this.viewport.addEventListener('pointerdown', this._onPointerDown);
    this.viewport.addEventListener('pointermove', this._onPointerMove);
    this.viewport.addEventListener('pointerup', this._onPointerUp);
    this.viewport.addEventListener('pointercancel', this._onPointerUp);
    root.addEventListener('keydown', this._onKeyDown);

    this._buildLights();
  }

  _buildLights() {
    // Static DOM dots (no shadow animation) — cheap on huge displays.
    const COUNT = 14;
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < COUNT; i++) {
        const dot = document.createElement('span');
        dot.className = 'pw__bulb';
        if (side === 1) dot.classList.add('pw__bulb--right');
        if (i % 2 === 1) dot.classList.add('pw__bulb--alt');
        dot.style.setProperty('--i', String(i));
        this.lights.appendChild(dot);
      }
    }
  }

  /** Replace the reel contents with a new active pool. Idle only. */
  setPanels(panels) {
    if (this.state !== 'idle') throw new Error('Cannot change panels mid-spin.');
    this.panels = panels || [];
    this.reel.textContent = '';
    for (let r = 0; r < REPEATS; r++) {
      for (const prize of this.panels) {
        this.reel.appendChild(createPrizePanel(prize));
      }
    }
    delete this.root.dataset.winnerId;
    this._measure();
    this.offset = 0;
    this._render();
  }

  _measure() {
    const h = this.viewport.clientHeight || 300;
    this.panelSize = h / this.options.visiblePanels;
    this.viewport.style.setProperty('--pw-panel-size', `${this.panelSize}px`);
    this._viewportHeight = h;
  }

  _onResize() {
    if (this.state !== 'idle') {
      this._pendingMeasure = true;
      return;
    }
    // Keep the same panel centered across the resize.
    const cycle = this.panels.length * this.panelSize;
    const progress = cycle > 0 ? normalizeOffset(this.offset, cycle) / this.panelSize : 0;
    this._measure();
    this.offset = progress * this.panelSize;
    this._render();
  }

  _render() {
    const count = this.panels.length;
    if (count === 0) return;
    const cycle = count * this.panelSize;
    const centered = this._viewportHeight / 2 - this.panelSize / 2;
    const ty = centered - 2 * cycle + normalizeOffset(this.offset, cycle);
    this.reel.style.transform = `translate3d(0, ${ty.toFixed(3)}px, 0)`;
  }

  /* ------------------------------------------------ input ------------- */

  _onPointerDown(e) {
    if (this.state !== 'idle' || this.panels.length === 0) return;
    this.viewport.setPointerCapture?.(e.pointerId);
    this._drag = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: this.offset,
      samples: [{ t: e.timeStamp, y: e.clientY }]
    };
    this.root.classList.add('pw--dragging');
  }

  _onPointerMove(e) {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    // Downward pull moves the reel with the finger (damped); upward is inert.
    this.offset = drag.startOffset + Math.max(dy, 0) * DRAG_RESISTANCE;
    this._render();
    drag.samples.push({ t: e.timeStamp, y: e.clientY });
    const cutoff = e.timeStamp - VELOCITY_WINDOW_MS;
    while (drag.samples.length > 2 && drag.samples[0].t < cutoff) drag.samples.shift();
  }

  _onPointerUp(e) {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this._drag = null;
    this.root.classList.remove('pw--dragging');

    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const dt = Math.max(last.t - first.t, 1);
    const velocity = (last.y - first.y) / dt; // px/ms, + is downward
    const distance = e.clientY - drag.startY;

    if (distance >= SWIPE_MIN_DISTANCE || velocity >= SWIPE_MIN_VELOCITY) {
      this.options.onSpinRequest(Math.max(velocity, SWIPE_MIN_VELOCITY));
    } else {
      this._snapBack(drag.startOffset);
    }
  }

  _onKeyDown(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (this.state !== 'idle') return;
    this.options.onSpinRequest(1); // comfortable default velocity
  }

  _snapBack(toOffset) {
    // Short eased return when the pull wasn't enough to spin.
    const from = this.offset;
    const delta = toOffset - from;
    if (Math.abs(delta) < 0.5) {
      this.offset = toOffset;
      this._render();
      return;
    }
    const started = performance.now();
    const DURATION = 220;
    const step = (now) => {
      const t = Math.min((now - started) / DURATION, 1);
      const ease = 1 - (1 - t) * (1 - t);
      this.offset = from + delta * ease;
      this._render();
      if (t < 1 && this.state === 'idle') this._raf = requestFrame(step);
    };
    this._raf = requestFrame(step);
  }

  /* ------------------------------------------------ spinning ---------- */

  /**
   * Animate the reel so the panel for `prizeId` lands on the winner line.
   * Resolves when the reel has settled. Rejects if a spin is already in
   * progress (result locking / double-spin prevention) or the id is not on
   * the reel.
   */
  spinTo(prizeId, { velocity = 1 } = {}) {
    if (this.state !== 'idle') {
      return Promise.reject(new Error('Spin already in progress.'));
    }
    const domIndex = this.panels.findIndex((p) => p.id === prizeId);
    if (domIndex === -1) {
      return Promise.reject(new Error(`Prize "${prizeId}" is not on the reel.`));
    }

    const count = this.panels.length;
    // Reel content moves DOWN as offset grows, so the physics target index
    // is mirrored relative to the DOM order.
    const physicsIndex = (count - domIndex) % count;

    const plan = createSpinPlan({
      currentOffset: this.offset,
      targetIndex: physicsIndex,
      panelCount: count,
      panelSize: this.panelSize,
      velocity: Math.max(velocity, 0) * this.options.spinStrength,
      minLoops: this._reducedMotion ? 1 : this.options.minLoops,
      maxLoops: this._reducedMotion ? 1 : this.options.maxLoops,
      duration: this._reducedMotion ? 600 : this.options.spinDuration
    });

    this.state = 'spinning';
    this.root.dataset.state = 'spinning';
    delete this.root.dataset.winnerId;
    this._clearWinnerHighlight();
    this.options.onSpinStart(prizeId);

    return new Promise((resolve) => {
      const started = performance.now();
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(this._failsafe);
        this.offset = normalizeOffset(offsetAt(plan, plan.duration), plan.cycle);
        this._render();
        this.state = 'idle';
        this.root.dataset.state = 'idle';
        this.root.dataset.winnerId = prizeId;
        this._highlightWinner(prizeId);
        if (this._pendingMeasure) {
          this._pendingMeasure = false;
          this._onResize();
        }
        this.options.onSpinEnd(prizeId);
        resolve();
      };

      const step = (now) => {
        if (finished) return;
        const elapsed = now - started;
        this.offset = offsetAt(plan, elapsed);
        this._render();
        if (!isDone(plan, elapsed)) {
          this._raf = requestFrame(step);
        } else {
          finish();
        }
      };

      this._raf = requestFrame(step);
      // rAF suspends in hidden/backgrounded tabs; without this the wheel
      // would stay locked in 'spinning' forever. The timer finalizes the
      // spin (and resolves) on schedule regardless of frame delivery.
      this._failsafe = setTimeout(finish, plan.duration + 150);
    });
  }

  _highlightWinner(prizeId) {
    for (const el of this.reel.querySelectorAll(`[data-prize-id="${cssEscape(prizeId)}"]`)) {
      el.classList.add('pw-panel--winner');
    }
  }

  _clearWinnerHighlight() {
    for (const el of this.reel.querySelectorAll('.pw-panel--winner')) {
      el.classList.remove('pw-panel--winner');
    }
  }

  destroy() {
    cancelFrame(this._raf);
    clearTimeout(this._failsafe);
    this._resizeObserver?.disconnect();
    this.viewport.removeEventListener('pointerdown', this._onPointerDown);
    this.viewport.removeEventListener('pointermove', this._onPointerMove);
    this.viewport.removeEventListener('pointerup', this._onPointerUp);
    this.viewport.removeEventListener('pointercancel', this._onPointerUp);
    this.root.removeEventListener('keydown', this._onKeyDown);
    this.root.remove();
  }
}

/* rAF with a timer fallback so the component works under jsdom tests. */
function requestFrame(cb) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16);
}
function cancelFrame(id) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}
function cssEscape(value) {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/["\\\]]/g, '\\$&');
}
