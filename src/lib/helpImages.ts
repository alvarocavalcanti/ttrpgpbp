// Shared by the marketing pages that show the committed help captures
// (`public/help-images/*.png`, 360x780 CSS at 3x). Cards render them at
// 80-96px, so they serve the 320px WebP thumbnails from
// `public/help-images/thumbs/`; the full PNGs stay for the enlarged viewer and
// the help docs. Derivation (not a hand-typed field) keeps a card from ever
// pointing at the wrong file.
export function thumbSrc(shot: string): string {
  return shot.replace('/help-images/', '/help-images/thumbs/').replace(/\.png$/, '.webp')
}
