/**
 * Renders a single prize panel for the drum. Purely presentational —
 * receives an active-pool prize entry and returns a DOM node.
 *
 * Structure: <li class="pw-panel"><div class="pw-panel__inner"> silver frame
 * comes from the li, the blue face from the inner div. The prize image sits
 * BESIDE the title; rows alternate image-left / image-right via CSS
 * nth-child so every other line switches sides.
 */
export function createPrizePanel(prize) {
  const li = document.createElement('li');
  li.className = 'pw-panel';
  li.dataset.prizeId = prize.id;
  if (prize.isGrandPrize) li.classList.add('pw-panel--grand');
  if (prize.isLoser) li.classList.add('pw-panel--loser');
  if (prize.outOfStock) li.classList.add('pw-panel--empty'); // visible, can't hit

  const inner = document.createElement('div');
  inner.className = 'pw-panel__inner';

  const media = document.createElement('div');
  media.className = 'pw-panel__media';
  if (prize.image) {
    const img = document.createElement('img');
    img.className = 'pw-panel__img';
    img.src = prize.image;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    media.appendChild(img);
  }

  const title = document.createElement('div');
  title.className = 'pw-panel__title';
  title.textContent = prize.title;

  if (prize.isGrandPrize) {
    const badge = document.createElement('div');
    badge.className = 'pw-panel__badge';
    badge.textContent = 'GRAND PRIZE';
    inner.appendChild(badge);
  }

  inner.appendChild(media);
  inner.appendChild(title);
  li.appendChild(inner);
  return li;
}
