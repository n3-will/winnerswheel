import { createPrizePanel } from './PrizePanel.js';
import { createSpinPlan, offsetAt, isDone, normalizeOffset } from './wheelPhysics.js';

/**
 * Vertical prize drum (Price Is Right / casino style). Purely visual +
 * interactive: it renders panels, handles swipe/keyboard input, and can
 * animate to a given prize id. It NEVER selects winners — the host app does:
 *
 *   const result = selectPrize(prizes, settings);
 *   await wheel.spinTo(result.id, { velocity });
 *   showWinner(result);
 *
 * The reel is a true 3D cylinder: each panel gets a STATIC
 * rotateX(...) translateZ(radius) placement and the spin animates a single
 * rotateX on the container — one transform write per frame, no layout, no
 * paint. Perspective makes rows widest at the center line and naturally
 * narrower toward the top and bottom, exactly like a physical drum.
 *
 * Panels repeat REPEATS times around the cylinder so ~8-9 rows are visible
 * at once. All spin math runs in DEGREES (panelSize = degrees per segment).
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
    this.offset = 0; // degrees of drum rotation (forward = reel moves down)
    this.step = 0; // degrees per segment
    this.panelHeight = 100; // px, derived from drum radius
    this._raf = 0;
    this._failsafe = 0;
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
        <div class="pw__viewport">
          <ul class="pw__reel"></ul>
          <div class="pw__shade pw__shade--top" aria-hidden="true"></div>
          <div class="pw__shade pw__shade--bottom" aria-hidden="true"></div>
          <div class="pw__window" aria-hidden="true">
            <span class="pw__glow"></span>
            <span class="pw__dots"></span>
            <span class="pw__pointer pw__pointer--left"></span>
            <span class="pw__pointer pw__pointer--right"></span>
          </div>
        </div>
      </div>`;

    this.root = root;
    this.viewport = root.querySelector('.pw__viewport');
    this.reel = root.querySelector('.pw__reel');
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

  /**
   * Drum geometry. The radius is half the viewport height, so the drum's
   * silhouette fills the window; each segment's panel height is the chord
   * for its arc: panelH = 2 * R * tan(step/2).
   */
  _measure() {
    const h = this.viewport.clientHeight || 300;
    const segments = Math.max(this.panels.length * REPEATS, 1);
    this.step = 360 / segments;
    // Perspective shrinks the drum rim (it sits deeper in Z than the front
    // face), so pick the radius that makes the PROJECTED silhouette fill the
    // viewport: rim projects at R * p / (p + R) = h / 2.
    const perspective = h * 1.5;
    const radius = (h * perspective) / (2 * perspective - h);
    const rad = (this.step / 2) * (Math.PI / 180);
    this.panelHeight = Math.max(2 * radius * Math.tan(rad), 1);
    this._radius = radius;
    this._viewportHeight = h;

    this.viewport.style.setProperty('--pw-panel-size', `${this.panelHeight.toFixed(2)}px`);
    this.viewport.style.setProperty('--pw-perspective', `${Math.round(perspective)}px`);
    this._layoutPanels();
  }

  /** Static 3D placement of every segment around the cylinder. */
  _layoutPanels() {
    const lis = this.reel.children;
    for (let s = 0; s < lis.length; s++) {
      lis[s].style.transform =
        `rotateX(${(-s * this.step).toFixed(4)}deg) translateZ(${this._radius.toFixed(2)}px)`;
    }
  }

  _onResize() {
    if (this.state !== 'idle') {
      this._pendingMeasure = true;
      return;
    }
    this._measure();
    this._render();
  }

  _render() {
    if (this.panels.length === 0) return;
    // Forward offset = drum surface moves DOWN past the window.
    const angle = normalizeOffset(this.offset, 360);
    this.reel.style.transform =
      `translateZ(${-this._radius.toFixed(2)}px) rotateX(${(-angle).toFixed(4)}deg)`;
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
    // Downward pull rotates the drum with the finger (damped); upward is inert.
    const degPerPx = this.step / this.panelHeight;
    this.offset = drag.startOffset + Math.max(dy, 0) * DRAG_RESISTANCE * degPerPx;
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
    if (Math.abs(delta) < 0.01) {
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
   * Animate the drum so the panel for `prizeId` lands on the winner line.
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

    // Panels are placed at rotateX(-s*step) so config order reads top to
    // bottom; the physics target index is mirrored accordingly.
    const count = this.panels.length;
    const physicsIndex = (count - domIndex) % count;

    const plan = createSpinPlan({
      currentOffset: this.offset,
      targetIndex: physicsIndex,
      panelCount: this.panels.length,
      panelSize: this.step, // degrees per segment
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
