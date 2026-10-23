// The piece engine's letters (data/graffiti-letters.json, ~0.8 MB of glyph outlines) are loaded once, on first use:
// when the Tag Studio opens, and on the GM before a painted piece is regenerated.
let cache = null, pending = null;
export const pieceLetters = () => cache;
export function setPieceLetters(data) { cache = data; return cache; }
export async function loadPieceLetters() {
  if (cache) return cache;
  pending ??= fetch('systems/the-smoke/data/graffiti-letters.json').then(r => { if (!r.ok) throw new Error(`Graffiti letters: HTTP ${r.status}`); return r.json(); })
    .then(setPieceLetters).finally(() => { pending = null; });
  return pending;
}
