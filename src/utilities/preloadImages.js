/**
 * Warm the browser cache for every prize image before the first spin so the
 * winner reveal never pops in with a half-loaded picture. Individual failures
 * are swallowed — a missing image should never block the game.
 */
export function preloadImages(prizes) {
  const urls = [...new Set(prizes.map((p) => p.image).filter(Boolean))];
  return Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = src;
        })
    )
  );
}
