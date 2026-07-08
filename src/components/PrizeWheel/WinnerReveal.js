/**
 * Winner reveal overlay with three celebration tiers:
 *   loser  → gentle "so close" card
 *   normal → prize card + confetti burst
 *   grand  → GRAND PRIZE jackpot moment: banner, light rays, screen shake,
 *            double confetti + streamers, longer presentation
 *
 * Confetti is drawn on a single <canvas> (not DOM nodes) with the backing
 * store capped at devicePixelRatio 1.5 and a particle budget scaled to
 * viewport size — tuned for very large Android displays.
 */

const noop = () => {};

const COLORS = ['#ffd75e', '#e5384c', '#4ecdc4', '#7ec8ff', '#c47eff', '#7be07b', '#ff9d5c'];

export class WinnerReveal {
  /**
   * @param {HTMLElement} [host=document.body]
   * @param {object} [options]
   * @param {Function} [options.onSound]   (name: 'win'|'grandWin'|'lose') => void
   * @param {Function} [options.onDismiss] (result) => void
   * @param {number}   [options.normalDuration=4000] auto-dismiss ms (0 = manual)
   * @param {number}   [options.grandDuration=7000]
   */
  constructor(host = document.body, options = {}) {
    this.host = host;
    this.options = {
      onSound: noop,
      onDismiss: noop,
      normalDuration: 4000,
      grandDuration: 7000,
      ...options
    };
    this._raf = 0;
    this._timer = 0;
    this._particles = [];
    this._reducedMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
  }

  /** Show the reveal for a selectPrize() result. Resolves on dismiss. */
  show(result) {
    this.hide();
    const tier = result.isLoser ? 'loser' : result.isGrandPrize ? 'grand' : 'normal';

    const overlay = document.createElement('div');
    overlay.className = `wr wr--${tier}`;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', tier === 'loser' ? 'Result' : 'You won!');

    const canvas = document.createElement('canvas');
    canvas.className = 'wr__canvas';
    canvas.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'wr__card';

    if (tier === 'grand') {
      const rays = document.createElement('div');
      rays.className = 'wr__rays';
      rays.setAttribute('aria-hidden', 'true');
      card.appendChild(rays);

      const banner = document.createElement('div');
      banner.className = 'wr__banner';
      banner.textContent = 'GRAND PRIZE';
      card.appendChild(banner);
    }

    const heading = document.createElement('div');
    heading.className = 'wr__heading';
    heading.textContent =
      tier === 'loser' ? 'So close!' : tier === 'grand' ? 'JACKPOT!' : 'Winner!';
    card.appendChild(heading);

    if (result.image) {
      const img = document.createElement('img');
      img.className = 'wr__image';
      img.src = result.image;
      img.alt = result.title;
      img.draggable = false;
      card.appendChild(img);
    }

    const title = document.createElement('div');
    title.className = 'wr__title';
    title.textContent = result.title;
    card.appendChild(title);

    if (tier === 'loser') {
      const sub = document.createElement('div');
      sub.className = 'wr__sub';
      sub.textContent = 'Better luck next time';
      card.appendChild(sub);
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'wr__dismiss';
    dismiss.textContent = tier === 'loser' ? 'OK' : 'Awesome!';
    card.appendChild(dismiss);

    overlay.appendChild(canvas);
    overlay.appendChild(card);
    this.host.appendChild(overlay);
    this.overlay = overlay;

    if (tier === 'grand' && !this._reducedMotion) {
      // Transform-only shake on the host's first child stage if present,
      // otherwise the card itself.
      overlay.classList.add('wr--shake');
    }

    this.options.onSound(tier === 'grand' ? 'grandWin' : tier === 'loser' ? 'lose' : 'win');

    if (!this._reducedMotion && tier !== 'loser') {
      this._startConfetti(canvas, tier === 'grand' ? 2 : 1);
    }

    dismiss.focus?.();

    return new Promise((resolve) => {
      const finish = () => {
        this.hide();
        this.options.onDismiss(result);
        resolve(result);
      };
      dismiss.addEventListener('click', finish, { once: true });
      const auto =
        tier === 'grand'
          ? this.options.grandDuration
          : tier === 'normal'
            ? this.options.normalDuration
            : 2500;
      if (auto > 0) this._timer = setTimeout(finish, auto);
    });
  }

  hide() {
    clearTimeout(this._timer);
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this._particles = [];
    this.overlay?.remove();
    this.overlay = null;
  }

  /* ---------------------------------------------- confetti ------------ */

  _startConfetti(canvas, intensity) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = (canvas.width = Math.floor(canvas.clientWidth * dpr) || 1);
    const h = (canvas.height = Math.floor(canvas.clientHeight * dpr) || 1);

    // Particle budget scales with area but is hard-capped: a 4K 100" panel
    // gets the same count as a laptop — density differs, frame cost doesn't.
    const budget = Math.min(Math.round((w * h) / 18000), 160) * intensity;

    const rand = (a, b) => a + Math.random() * (b - a);
    this._particles = Array.from({ length: budget }, () => ({
      x: rand(0, w),
      y: rand(-h * 0.6, 0),
      vx: rand(-0.06, 0.06) * w * 0.01,
      vy: rand(0.1, 0.28) * h * 0.004,
      size: rand(0.008, 0.016) * Math.min(w, h),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.12, 0.12),
      streamer: intensity > 1 && Math.random() < 0.25
    }));

    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(now - last, 40);
      last = now;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of this._particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt * 0.06;
        if (p.y < h + p.size * 4) alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.streamer) {
          ctx.fillRect(-p.size * 0.2, -p.size * 2.5, p.size * 0.4, p.size * 5);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        }
        ctx.restore();
      }
      if (alive > 0 && this.overlay) {
        this._raf = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    this._raf = requestAnimationFrame(step);
  }
}
