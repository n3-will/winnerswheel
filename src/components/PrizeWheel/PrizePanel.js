/**
 * Renders a single prize panel for the reel. Purely presentational —
 * receives an active-pool prize entry and returns a DOM node.
 */
export function createPrizePanel(prize) {
  const li = document.createElement('li');
  li.className = 'pw-panel';
  li.dataset.prizeId = prize.id;
  if (prize.isGrandPrize) li.classList.add('pw-panel--grand');
  if (prize.isLoser) li.classList.add('pw-panel--loser');

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
    li.appendChild(badge);
  }

  li.appendChild(media);
  li.appendChild(title);
  return li;
}
