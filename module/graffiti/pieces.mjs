// The piece engine (0.5.26): graffiti pieces as pure vector SVG — throw-ups, bubbles, old skool block, blockbusters,
// deep 3D, new skool, wildstyle, semi-wild, stencils, wet paint, fat-cap spray, straight letters and street tags —
// with fills, outlines, keylines, clouds, 3D, highlights, arrows, spikes, cuts, drips, overspray and characters.
// No Foundry APIs: the same code renders the Tag Studio preview, the GM's trusted decal and the shipped preset art.
// Letters come from data/graffiti-letters.json (outlines of OFL/Apache fonts; see GRAFFITI-FONT-LICENCES.md).
import {CHARACTERS, drawCharacter} from './characters.mjs';

/* ------------------------------------------------------------------ styles */
// Sizes are in "cap units": the letters' cap height is 100. fat = paint added round each letter (puffs it up),
// outline = the dark line beyond that, cloud = a second coloured band round everything, keyline = thin line round
// that. depth = 3D extrusion length; dir = its angle (degrees, 0 = right, 90 = down).
const S = (o) => Object.freeze({fat: 0, outline: 7, cloud: 0, keyline: 0, depth: 0, dir: 45, stack: false, rot: 4, bounce: 6,
  size: [1, 1], skew: 0, overlap: 0.02, fill: 'solid', shine: false, inline: false, arrows: 0, spikes: 0, cuts: 0, drips: 0,
  glow: false, overspray: 0.5, thin: false, ...o});
export const PIECE_STYLES = Object.freeze({
  tagline:     S({label: 'Tag · Street hand',          group: 'Tags',    font: 'sedgwick',   outline: 4.5, fat: 2, rot: 7, bounce: 12, size: [0.9, 1.14], skew: -6, overlap: -0.02, drips: 1, overspray: 0.4, thin: true}),
  marker:      S({label: 'Tag · Fat marker',           group: 'Tags',    font: 'marker',     outline: 4, fat: 3, rot: 5, bounce: 8, size: [0.94, 1.08], skew: -4, overlap: 0, drips: 2, overspray: 0.3, thin: true}),
  throwup:     S({label: 'Throw-up · Fat & quick',     group: 'Throw-ups', font: 'cherry',   fat: 7, outline: 8, keyline: 4, cloud: 7, stack: true, rot: 7, bounce: 10, size: [0.94, 1.1], skew: -5, overlap: 0.09, shine: true, drips: 1}),
  bubble:      S({label: 'Bubble · Puffy',             group: 'Throw-ups', font: 'sniglet',  fat: 9, outline: 8, keyline: 4, cloud: 6, depth: 8, dir: 60, stack: true, rot: 8, bounce: 12, size: [0.92, 1.12], overlap: 0.1, fill: 'fade', shine: true}),
  oldskool:    S({label: 'Old Skool · Block 3D',       group: 'Pieces',  font: 'bungee',     fat: 10, outline: 6, keyline: 4, cloud: 6, depth: 22, dir: 40, rot: 2, bounce: 3, overlap: 0.04, fill: 'split', inline: true, shine: true}),
  blockbuster: S({label: 'Blockbuster · Roller',       group: 'Pieces',  font: 'bowlby',     fat: 6, outline: 7, keyline: 3, cloud: 0, depth: 10, dir: 90, rot: 0, bounce: 0, overlap: 0.02, fill: 'bricks', inline: true}),
  deep3d:      S({label: '3D · Deep block',            group: 'Pieces',  font: 'russo',      fat: 8, outline: 6, keyline: 4, cloud: 7, depth: 38, dir: 35, rot: 3, bounce: 4, overlap: 0.02, fill: 'fade', shine: true}),
  newskool:    S({label: 'New Skool · Bounce & flare', group: 'Pieces',  font: 'knewave',    fat: 12, outline: 7, keyline: 4, cloud: 10, depth: 16, dir: 70, rot: 10, bounce: 16, size: [0.86, 1.16], skew: -4, overlap: 0.08, fill: 'drops', shine: true, arrows: 2, spikes: 2, glow: true}),
  burner:      S({label: 'Burner · Full colour',       group: 'Pieces',  font: 'shrikhand',  fat: 12, outline: 7, keyline: 4, cloud: 12, depth: 20, dir: 50, rot: 6, bounce: 10, size: [0.9, 1.12], overlap: 0.06, fill: 'bubbles', shine: true, inline: true, arrows: 1, glow: true}),
  wildstyle:   S({label: 'Wildstyle · Arrows & locks', group: 'Wild',    font: 'russo',      fat: 7, outline: 6, keyline: 4, cloud: 8, depth: 14, dir: 55, rot: 12, bounce: 16, size: [0.84, 1.2], skew: -10, overlap: 0.14, fill: 'stripes', shine: true, arrows: 5, spikes: 4, cuts: 2}),
  semiwild:    S({label: 'Semi-Wild · Sharp',          group: 'Wild',    font: 'squada',     fat: 6, outline: 6, keyline: 3, cloud: 6, depth: 12, dir: 45, rot: 8, bounce: 10, size: [0.9, 1.14], skew: -12, overlap: 0.08, fill: 'fade', shine: true, arrows: 3, spikes: 3, cuts: 1}),
  beastly:     S({label: 'Spikes · Beastly',           group: 'Wild',    font: 'beastly',    fat: 0, outline: 4, keyline: 3, cloud: 6, depth: 10, dir: 45, rot: 6, bounce: 8, overlap: -0.02, fill: 'fade'}),
  stencil:     S({label: 'Stencil · Cut plate',        group: 'Stencils & paint', font: 'wallpoet', fat: 0, outline: 0, rot: 0, bounce: 0, overlap: 0, overspray: 1.4, thin: true}),
  wetpaint:    S({label: 'Drip · Wet paint',           group: 'Stencils & paint', font: 'wetpaint', fat: 2, outline: 5, keyline: 0, rot: 2, bounce: 3, overlap: 0, fill: 'fade', drips: 2}),
  fatcap:      S({label: 'Fat Cap · Sprayed',          group: 'Stencils & paint', font: 'spray',    fat: 0, outline: 5, rot: 3, bounce: 5, overlap: 0.02, fill: 'fade', overspray: 1.2}),
  straight:    S({label: 'Straight Letter · Clean',    group: 'Pieces',  font: 'londrina',   fat: 6, outline: 6, keyline: 3, cloud: 5, depth: 12, dir: 50, rot: 1, bounce: 2, overlap: 0.02, fill: 'split', shine: true})
});
export const FILL_MODES = Object.freeze({solid: 'Solid', fade: 'Fade', split: 'Two-tone', stripes: 'Stripes', bubbles: 'Bubbles', stars: 'Stars', drops: 'Drop top', bricks: 'Bricks', flames: 'Flames', cracks: 'Cracks'});
export const isPieceStyle = key => Object.hasOwn(PIECE_STYLES, key);

/* ------------------------------------------------------------------ quality */
// Proper Mess: shaky, patchy, runs. Legendary: everything, plus a glow and a crown.
const QUALITY = Object.freeze({
  severeFailure:      {wobble: 2.2, depth: 0, cloud: 0, keyline: 0, pattern: false, shine: false, patchy: 0.45, runs: 5, outline: 0.7, extras: 0},
  costlyFailure:      {wobble: 1.5, depth: 0, cloud: 0, keyline: 0, pattern: false, shine: false, patchy: 0.2, runs: 3, outline: 0.85, extras: 0},
  narrowSuccess:      {wobble: 1.1, depth: 0.6, cloud: 0, keyline: 1, pattern: false, shine: false, patchy: 0, runs: 1, outline: 0.95, extras: 0},
  fullSuccess:        {wobble: 1, depth: 1, cloud: 1, keyline: 1, pattern: true, shine: true, patchy: 0, runs: 0, outline: 1, extras: 1},
  strongSuccess:      {wobble: 0.9, depth: 1, cloud: 1, keyline: 1, pattern: true, shine: true, patchy: 0, runs: 0, outline: 1.04, extras: 2},
  exceptionalSuccess: {wobble: 0.8, depth: 1.1, cloud: 1.15, keyline: 1, pattern: true, shine: true, patchy: 0, runs: 0, outline: 1.08, extras: 3}
});

/* ------------------------------------------------------------------ small helpers */
const xml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
const f1 = n => { const r = Math.round(n * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; };
function rng(seed) { let n = seed >>> 0 || 1; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
export function shade(hex, amt) {
  const s = String(hex || '').replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(s)) return hex;
  const c = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)), f = Math.max(-1, Math.min(1, amt));
  return '#' + c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, '0')).join('');
}
const mix = (a, b, t) => { const p = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

/* ------------------------------------------------------------------ paths */
// Glyph outlines use M L H V Q C Z (absolute, with implicit repeats). They are parsed once per glyph and transformed
// into piece space, so strokes stay even however each letter is turned, sized or slanted.
const parsed = new Map();
function parse(d) {
  if (parsed.has(d)) return parsed.get(d);
  const tok = String(d).match(/[MLHVQCZmlhvqcz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const segs = []; let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const up = cmd.toUpperCase(), rel = cmd !== up;
    if (up === 'Z') { segs.push(['Z']); x = sx; y = sy; continue; }
    if (up === 'M') { const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); segs.push(['M', nx, ny]); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; continue; }
    if (up === 'L') { const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); segs.push(['L', nx, ny]); x = nx; y = ny; continue; }
    if (up === 'H') { const nx = num() + (rel ? x : 0); segs.push(['L', nx, y]); x = nx; continue; }
    if (up === 'V') { const ny = num() + (rel ? y : 0); segs.push(['L', x, ny]); y = ny; continue; }
    if (up === 'Q') { const a = num() + (rel ? x : 0), b = num() + (rel ? y : 0), nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); segs.push(['Q', a, b, nx, ny]); x = nx; y = ny; continue; }
    if (up === 'C') { const a = num() + (rel ? x : 0), b = num() + (rel ? y : 0), c = num() + (rel ? x : 0), e = num() + (rel ? y : 0), nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); segs.push(['C', a, b, c, e, nx, ny]); x = nx; y = ny; continue; }
    i++;   // anything else is skipped
  }
  parsed.set(d, segs); return segs;
}
// 2D affine [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const T = (x, y) => [1, 0, 0, 1, x, y], R = deg => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
const K = deg => [1, 0, Math.tan(deg * Math.PI / 180), 1, 0, 0], Sc = (x, y = x) => [x, 0, 0, y, 0, 0];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** Transform a glyph: the path in piece space, its contours as point lists (for drips, arrows and shine) and its box. */
function place(d, m) {
  let out = '', contours = [], cur = null, px = 0, py = 0;
  for (const s of parse(d)) {
    if (s[0] === 'Z') { out += 'Z'; if (cur) contours.push(cur); cur = null; continue; }
    if (s[0] === 'M') { const [x, y] = ap(m, s[1], s[2]); out += `M${f1(x)} ${f1(y)}`; if (cur) contours.push(cur); cur = [[x, y]]; px = s[1]; py = s[2]; continue; }
    if (s[0] === 'L') { const [x, y] = ap(m, s[1], s[2]); out += `L${f1(x)} ${f1(y)}`; cur?.push([x, y]); px = s[1]; py = s[2]; continue; }
    if (s[0] === 'Q') {
      const [a, b] = ap(m, s[1], s[2]), [x, y] = ap(m, s[3], s[4]); out += `Q${f1(a)} ${f1(b)} ${f1(x)} ${f1(y)}`;
      const [mx, my] = ap(m, 0.25 * px + 0.5 * s[1] + 0.25 * s[3], 0.25 * py + 0.5 * s[2] + 0.25 * s[4]); cur?.push([mx, my], [x, y]); px = s[3]; py = s[4]; continue;
    }
    if (s[0] === 'C') {
      const [a, b] = ap(m, s[1], s[2]), [c, e] = ap(m, s[3], s[4]), [x, y] = ap(m, s[5], s[6]); out += `C${f1(a)} ${f1(b)} ${f1(c)} ${f1(e)} ${f1(x)} ${f1(y)}`;
      const [mx, my] = ap(m, 0.125 * px + 0.375 * s[1] + 0.375 * s[3] + 0.125 * s[5], 0.125 * py + 0.375 * s[2] + 0.375 * s[4] + 0.125 * s[6]); cur?.push([mx, my], [x, y]); px = s[5]; py = s[6];
    }
  }
  if (cur) contours.push(cur);
  const pts = contours.flat(); const box = bounds(pts);
  return {d: out, contours, pts, box};
}
function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
}
const poly = pts => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';

/* ------------------------------------------------------------------ decorations (piece space) */
/** A curved, tapering arrow growing out of a letter at (px, py): the classic wildstyle arrow. */
function swoosh(px, py, ang, len, w, bend) {
  const u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
  const P0 = [px - u[0] * w, py - u[1] * w], P2 = [px + u[0] * len, py + u[1] * len], P1 = [px + u[0] * len * 0.5 + n[0] * bend * len, py + u[1] * len * 0.5 + n[1] * bend * len];
  const at = t => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
  const tan = t => { const dx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]), l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const L = [], Rt = [], N = 8, tEnd = 0.8;
  for (let i = 0; i <= N; i++) { const t = tEnd * i / N, [x, y] = at(t), [tx, ty] = tan(t), hw = w * (0.62 - 0.26 * t / tEnd); L.push([x - ty * hw, y + tx * hw]); Rt.push([x + ty * hw, y - tx * hw]); }
  const [ex, ey] = at(tEnd), [tx, ty] = tan(tEnd), hw = w * 1.15, tip = at(1), tip2 = [ex + tx * w * 2.1, ey + ty * w * 2.1];
  const head = [[ex - ty * hw, ey + tx * hw], [tip2[0] * 0.5 + tip[0] * 0.5, tip2[1] * 0.5 + tip[1] * 0.5], [ex + ty * hw, ey - tx * hw]];
  const pts = [...L, head[0], head[1], head[2], ...Rt.reverse()];
  return {d: poly(pts), pts};
}
function spikeShape(px, py, ang, len, w) {
  const u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
  const pts = [[px - n[0] * w / 2 - u[0] * w * 0.5, py - n[1] * w / 2 - u[1] * w * 0.5], [px + u[0] * len, py + u[1] * len], [px + n[0] * w / 2 - u[0] * w * 0.5, py + n[1] * w / 2 - u[1] * w * 0.5]];
  return {d: poly(pts), pts};
}
function dripShape(x, y, len, w) {
  const r = w * 0.72, b = y + len;
  return {d: `M${f1(x - w / 2)} ${f1(y - w)}L${f1(x - w / 2)} ${f1(b - r * 0.4)}Q${f1(x - r)} ${f1(b)} ${f1(x - r)} ${f1(b + r * 0.2)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(x + r)} ${f1(b + r * 0.2)}Q${f1(x + r)} ${f1(b)} ${f1(x + w / 2)} ${f1(b - r * 0.4)}L${f1(x + w / 2)} ${f1(y - w)}Z`,
    pts: [[x - r, y - w], [x + r, b + r * 1.2]]};
}
function star(cx, cy, r, points = 5, inner = 0.45) {
  const p = []; for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / points, rr = i % 2 ? r * inner : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return poly(p);
}
function sparkle(cx, cy, r) { const k = r * 0.22; return `M${f1(cx)} ${f1(cy - r)}Q${f1(cx + k)} ${f1(cy - k)} ${f1(cx + r)} ${f1(cy)}Q${f1(cx + k)} ${f1(cy + k)} ${f1(cx)} ${f1(cy + r)}Q${f1(cx - k)} ${f1(cy + k)} ${f1(cx - r)} ${f1(cy)}Q${f1(cx - k)} ${f1(cy - k)} ${f1(cx)} ${f1(cy - r)}Z`; }

/** The points of a letter's outline nearest a direction (unit vector), for arrows, spikes and drips. */
function extreme(letter, ux, uy, skip = 0) {
  const scored = letter.pts.map(p => [p, p[0] * ux + p[1] * uy]).sort((a, b) => b[1] - a[1]);
  return scored[Math.min(skip, scored.length - 1)]?.[0] ?? [letter.box.cx, letter.box.cy];
}

/* ------------------------------------------------------------------ fill patterns (masked to the letters) */
function pattern(mode, box, c1, c2, outline, rand) {
  const {x0, y0, x1, y1, w, h} = box; let o = '';
  switch (mode) {
    case 'stripes': for (let x = x0 - h; x < x1 + h; x += 22) o += `<path d="M${f1(x)} ${f1(y1 + 10)}L${f1(x + h + 20)} ${f1(y0 - 10)}" stroke="${c2}" stroke-width="7" fill="none"/>`; return o;
    case 'bubbles': for (let i = 0; i < Math.round(w / 9); i++) { const r = 3 + rand() * 11, cx = x0 + rand() * w, cy = y0 + h * (0.45 + rand() * 0.6); o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${c2}"/><circle cx="${f1(cx - r * 0.35)}" cy="${f1(cy - r * 0.35)}" r="${f1(r * 0.28)}" fill="#fff" opacity=".8"/>`; } return o;
    case 'stars': for (let i = 0; i < Math.round(w / 18); i++) o += `<path d="${star(x0 + rand() * w, y0 + rand() * h, 4 + rand() * 7)}" fill="${c2}"/>`; return o;
    case 'drops': {
      let d = `M${f1(x0 - 10)} ${f1(y0 - 20)}L${f1(x1 + 10)} ${f1(y0 - 20)}L${f1(x1 + 10)} ${f1(y0 + h * 0.3)}`;
      for (let x = x1 + 10; x > x0 - 10; x -= 16) { const dy = h * (0.26 + rand() * 0.22); d += `Q${f1(x - 4)} ${f1(y0 + dy + 12)} ${f1(x - 8)} ${f1(y0 + dy)}Q${f1(x - 12)} ${f1(y0 + h * 0.28)} ${f1(x - 16)} ${f1(y0 + h * 0.3)}`; }
      return `<path d="${d}Z" fill="${c2}"/>`;
    }
    case 'bricks': for (let y = y0, r = 0; y < y1; y += 14, r++) { o += `<path d="M${f1(x0)} ${f1(y)}H${f1(x1)}" stroke="${shade(c1, -0.35)}" stroke-width="2.2"/>`; for (let x = x0 + (r % 2 ? 14 : 0); x < x1; x += 28) o += `<path d="M${f1(x)} ${f1(y)}V${f1(y + 14)}" stroke="${shade(c1, -0.35)}" stroke-width="2.2"/>`; } return o;
    case 'flames': {
      let d = `M${f1(x0 - 10)} ${f1(y1 + 30)}`;
      for (let x = x0 - 10; x < x1 + 10; x += 20) { const t = y1 - h * (0.3 + rand() * 0.38); d += `Q${f1(x + 2)} ${f1(t + 22)} ${f1(x + 10)} ${f1(t)}Q${f1(x + 12)} ${f1(t + 28)} ${f1(x + 20)} ${f1(y1 - h * 0.18)}`; }
      return `<path d="${d}L${f1(x1 + 10)} ${f1(y1 + 30)}Z" fill="${c2}"/>`;
    }
    case 'cracks': for (let i = 0; i < Math.round(w / 30); i++) { let x = x0 + rand() * w, y = y0 - 5, d = `M${f1(x)} ${f1(y)}`; while (y < y1 + 5) { y += 8 + rand() * 12; x += (rand() - 0.5) * 18; d += `L${f1(x)} ${f1(y)}`; } o += `<path d="${d}" stroke="${outline}" stroke-width="2.4" fill="none" stroke-linejoin="bevel"/>`; } return o;
    default: return '';
  }
}

/* ------------------------------------------------------------------ the renderer */
const CLEAN = /[^A-Z0-9 !?&._-]/g;
/**
 * Render a piece. `d` is a sanitised design: {text, style, fill, fill2, outline, shadow, accent, skin, fillMode,
 * character, charSide, quality, blinder, extras{...}, width, height, background}. `letters` is the parsed
 * data/graffiti-letters.json. Returns a self-contained SVG string.
 */
export function renderPiece(d, letters) {
  const st = PIECE_STYLES[d.style] ?? PIECE_STYLES.throwup, q = QUALITY[d.quality] ?? QUALITY.fullSuccess;
  const font = letters?.fonts?.[st.font]; if (!font) throw new Error(`Graffiti letters for ${st.font} are not loaded.`);
  const W = d.width || 860, H = d.height || 420, id = (hash(`${d.text}|${d.style}|${d.quality}|${d.fillMode}|${d.character}`) % 1e8).toString(36);
  const rand = rng(hash(`${d.text}${d.style}${d.quality}${d.blinder}`));
  const extras = d.extras || {}, lvl = q.extras + (d.blinder || 0);
  const text = String(d.text || 'TAG').toUpperCase().replace(CLEAN, '').slice(0, 18) || 'TAG';
  const cap = font.cap, s0 = 100 / cap;
  const fat = st.fat, ol = Math.max(st.thin ? 2.5 : 3, st.outline * q.outline);
  const depth = st.depth * q.depth, cloud = st.cloud * q.cloud, key = st.keyline && q.keyline ? st.keyline : 0;
  const reach = fat + 2 * ol;   // stroke width that draws the outline round each letter
  const c = {fill: d.fill, fill2: d.fill2 || shade(d.fill, -0.3), line: d.outline, deep: d.shadow, acc: d.accent, skin: d.skin || '#8d5a3b'};

  // 1 · lay the letters out on a baseline at y = 0, cap height 100. Two words of eight letters or more go on two
  //     lines (NIGHT / MARKET), the way long names are painted, so the piece stays tall enough to read.
  const lines = (() => {
    const t = text.trim(); if (t.length < 8 || !t.includes(' ')) return [t];
    let best = -1, gap = Infinity; [...t].forEach((ch, i) => { if (ch === ' ' && Math.abs(i - t.length / 2) < gap) { gap = Math.abs(i - t.length / 2); best = i; } });
    return [t.slice(0, best).trim(), t.slice(best + 1).trim()].filter(Boolean);
  })();
  const sizeAt = (i, ch) => st.size[0] + (st.size[1] - st.size[0]) * (0.5 + 0.5 * Math.sin(i * 2.1 + 0.7)) * (ch === ' ' ? 0 : 1);
  const advOf = (ch, i) => { const g = font.glyphs[ch] ?? font.glyphs['?']; if (!g) return 0; const sc = s0 * sizeAt(i, ch); return ch === ' ' || !g[1] ? g[0] * sc * 0.6 : g[0] * sc * (1 - st.overlap) + fat * 0.15; };
  let gi = 0; const widths = lines.map(line => [...line].reduce((sum, ch) => sum + advOf(ch, gi++), 0)), widest = Math.max(...widths);
  const lineGap = 100 + fat + 2 * ol + 14 + st.bounce;
  const placed = []; gi = 0;
  lines.forEach((line, li) => {
    let x = (widest - widths[li]) / 2;
    [...line].forEach(ch => {
      const i = gi++, g = font.glyphs[ch] ?? font.glyphs['?']; if (!g) return;
      const wob = q.wobble, wave = Math.sin((i + 1) * 1.37 + rand() * 0.6);
      const rot = st.rot * wave * (i % 2 ? 1 : -0.7) + (rand() - 0.5) * 6 * (wob - 0.8);
      const lift = li * lineGap - st.bounce * Math.cos(i * 1.9 + 0.4) + (rand() - 0.5) * 10 * (wob - 0.8);
      const sc = s0 * sizeAt(i, ch);
      if (ch === ' ' || !g[1]) { x += g[0] * sc * 0.6; return; }
      const m = mul(T(x, lift), mul(R(rot), mul(K(st.skew), Sc(sc, -sc))));
      const p = place(g[1], m); p.ch = ch; p.i = placed.length; p.line = li; placed.push(p);
      x += g[0] * sc * (1 - st.overlap) + fat * 0.15;
    });
  });
  if (!placed.length) throw new Error('Nothing to paint.');
  const all = bounds(placed.flatMap(p => p.pts));

  // 2 · decorations that join the letters (same fill and outline): arrows, spikes, drips, runs
  const deco = placed.map(() => []);
  const arrows = Math.round(st.arrows + (extras.arrow ? 1 : 0)), spikes = st.spikes;
  if (arrows) {
    // spread round the word: up off the middle letters, out of the ends, down under it
    const plan = [[0.62, -1, 1], [1, -0.3, -1], [-1, 0.5, 0], [0.4, 1, -1], [-0.5, -1, 1], [1, 0.55, 0]];
    for (let k = 0; k < arrows; k++) {
      const [ux, uy] = plan[k % plan.length], n = Math.hypot(ux, uy);
      const L = ux > 0.9 ? placed.at(-1) : ux < -0.9 ? placed[0] : placed[(k * 2 + 1) % placed.length];
      const [px, py] = extreme(L, ux / n, uy / n, k % 2);
      const ang = Math.atan2(uy, ux) + (rand() - 0.5) * 0.35, bend = (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.18);
      deco[L.i].push(swoosh(px, py, ang, 40 + rand() * 28, 10 + fat * 0.25, bend));
    }
  }
  for (let k = 0; k < spikes; k++) {
    const L = placed[(k * 2) % placed.length], ang = -Math.PI / 2 + (rand() - 0.5) * 2.4, [px, py] = extreme(L, Math.cos(ang), Math.sin(ang));
    deco[L.i].push(spikeShape(px, py, ang, 18 + rand() * 18, 12 + fat * 0.3));
  }
  const dripCount = (st.drips + (extras.drips ? 2 : 0)) * (q.runs ? 0 : 1) + q.runs;
  for (let k = 0; k < dripCount; k++) {
    const pool = q.runs ? placed : placed.filter(p => p.line === lines.length - 1), L = pool[Math.floor(rand() * pool.length)], [px, py] = extreme(L, (rand() - 0.5) * 0.6, 1, Math.floor(rand() * 4));
    deco[L.i].push(dripShape(px + (rand() - 0.5) * 6, py + fat * 0.3, (q.runs ? 40 : 22) + rand() * (q.runs ? 60 : 34), Math.max(5, 4 + fat * 0.22)));
  }
  const reachAll = bounds([...placed.flatMap(p => p.pts), ...deco.flat().flatMap(dd => dd.pts)]);

  // 3 · the character
  const ch = d.character && CHARACTERS[d.character] ? CHARACTERS[d.character] : null;
  let charSvg = '', charBox = null;
  if (ch) {
    const hgt = Math.max(205, all.h * 1.05), scl = hgt / ch.h, flip = d.charSide !== 'left';   // characters are drawn facing right; on the right they turn to face the letters
    const cx = flip ? all.x1 + reach * 0.3 - ch.w * scl * 0.06 : all.x0 - reach * 0.3 - ch.w * scl * 0.94, cy = all.cy - hgt * 0.56;
    charBox = {x0: cx, y0: cy, x1: cx + ch.w * scl, y1: cy + hgt};
    charSvg = `<g transform="translate(${f1(flip ? cx + ch.w * scl : cx)} ${f1(cy)}) scale(${((flip ? -1 : 1) * scl).toFixed(4)} ${scl.toFixed(4)})">${drawCharacter(d.character, {o: c.line, p: c.fill2, s: c.acc, a: c.fill, k: c.skin, flip})}</g>`;
  }

  // 4 · defs: one group per letter (glyph + its decorations), the whole word, paints
  const LID = i => `l${id}-${i}`, WID = `w${id}`;
  let defs = placed.map((p, i) => `<g id="${LID(i)}"><path d="${p.d}"/>${deco[i].map(dd => `<path d="${dd.d}"/>`).join('')}</g>`).join('');
  defs += `<g id="${WID}">${placed.map((_, i) => `<use href="#${LID(i)}"/>`).join('')}</g>`;
  const box = all;
  const mode = q.pattern ? (d.fillMode || st.fill) : (['fade', 'split'].includes(d.fillMode || st.fill) ? (d.fillMode || st.fill) : 'solid');
  const fillId = `f${id}`;
  if (mode === 'fade') defs += `<linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(box.y0)}" x2="0" y2="${f1(box.y1)}"><stop offset="0" stop-color="${xml(shade(c.fill, 0.18))}"/><stop offset=".45" stop-color="${xml(c.fill)}"/><stop offset="1" stop-color="${xml(c.fill2)}"/></linearGradient>`;
  else if (mode === 'split') defs += `<linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(box.y0)}" x2="0" y2="${f1(box.y1)}"><stop offset="0" stop-color="${xml(shade(c.fill, 0.12))}"/><stop offset=".54" stop-color="${xml(c.fill)}"/><stop offset=".54" stop-color="${xml(c.fill2)}"/><stop offset="1" stop-color="${xml(shade(c.fill2, -0.12))}"/></linearGradient>`;
  else defs += `<linearGradient id="${fillId}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(box.y0)}" x2="0" y2="${f1(box.y1)}"><stop offset="0" stop-color="${xml(shade(c.fill, 0.14))}"/><stop offset=".6" stop-color="${xml(c.fill)}"/><stop offset="1" stop-color="${xml(shade(c.fill, -0.1))}"/></linearGradient>`;
  const paint = `url(#${fillId})`;
  const patterned = q.pattern && !['solid', 'fade', 'split'].includes(mode);
  if (patterned || q.patchy || q.shine) defs += placed.map((_, i) => `<mask id="m${id}-${i}" maskUnits="userSpaceOnUse" x="-5000" y="-5000" width="10000" height="10000"><use href="#${LID(i)}" fill="#fff" stroke="#fff" stroke-width="${f1(fat)}" stroke-linejoin="round"/></mask>`).join('');
  if (q.patchy) {
    let holes = ''; for (let i = 0; i < Math.round(box.w / 7); i++) holes += `<circle cx="${f1(box.x0 + rand() * box.w)}" cy="${f1(box.y0 + rand() * box.h)}" r="${f1(3 + rand() * 9 * q.patchy * 2)}" fill="#000"/>`;
    defs += `<mask id="p${id}" maskUnits="userSpaceOnUse" x="-5000" y="-5000" width="10000" height="10000"><rect x="-5000" y="-5000" width="10000" height="10000" fill="#fff"/>${holes}</mask>`;
  }

  // 5 · layers, bottom to top
  const join = 'stroke-linejoin="round" stroke-linecap="round"';
  const use = (href, attrs) => `<use href="#${href}" ${attrs}/>`;
  const dv = [Math.cos(st.dir * Math.PI / 180), Math.sin(st.dir * Math.PI / 180)];
  const steps = depth ? Math.max(4, Math.round(depth / 2.2)) : 0;
  let body = '';
  const glow = (st.glow && lvl >= 1) || extras.halo || lvl >= 3;
  // cloud and keyline wrap the face and the 3D
  const hull = [0, ...(steps ? [Math.round(steps / 2), steps] : [])].map(k => [k * depth / Math.max(1, steps) * dv[0], k * depth / Math.max(1, steps) * dv[1]]);
  if (cloud || key) {
    const cw = reach + 2 * cloud, kw = cw + 2 * key;
    if (key) body += `<g stroke="${xml(c.line)}" fill="${xml(c.line)}" stroke-width="${f1(kw)}" ${join}>${hull.map(([hx, hy]) => use(WID, `x="${f1(hx)}" y="${f1(hy)}"`)).join('')}</g>`;
    if (cloud) body += `<g stroke="${xml(c.acc)}" fill="${xml(c.acc)}" stroke-width="${f1(cw)}" ${join}>${hull.map(([hx, hy]) => use(WID, `x="${f1(hx)}" y="${f1(hy)}"`)).join('')}</g>`;
  }
  if (steps) {
    let a = '', b = '';
    for (let k = steps; k >= 1; k--) {
      const ox = f1(k * depth / steps * dv[0]), oy = f1(k * depth / steps * dv[1]);
      a += use(WID, `x="${ox}" y="${oy}"`);
      b += use(WID, `x="${ox}" y="${oy}" fill="${xml(mix(shade(c.deep, 0.12), shade(c.deep, -0.35), k / steps))}" stroke="${xml(mix(shade(c.deep, 0.12), shade(c.deep, -0.35), k / steps))}"`);
    }
    body += `<g stroke="${xml(c.line)}" fill="${xml(c.line)}" stroke-width="${f1(reach)}" ${join}>${a}</g><g stroke-width="${f1(Math.max(fat, 1))}" ${join}>${b}</g>`;
  }
  // the letters: outline then fill, letter by letter (stacked) or all together (one joined shape)
  const maskOn = q.patchy ? ` mask="url(#p${id})"` : '';
  const faceOf = (i, href) => {   // a patchy (failed) piece lets the wall show through the outline and the fill
    let out = `<g stroke="${xml(c.line)}" fill="${xml(c.line)}" stroke-width="${f1(reach)}" ${join}>${use(href, '')}</g>`;
    out += `<g fill="${paint}" stroke="${paint}" stroke-width="${f1(Math.max(fat, 0.01))}" ${join}>${use(href, '')}</g>`;
    return maskOn ? `<g${maskOn}>${out}</g>` : out;
  };
  const decor = i => {
    let out = '';
    if (patterned) out += `<g mask="url(#m${id}-${i})">${pattern(mode, placed[i].box, xml(c.fill), xml(c.fill2), xml(c.line), rand)}</g>`;
    if (st.inline && fat >= 6 && q.shine) out += `<g fill="none" stroke="${xml(shade(c.fill, 0.7))}" stroke-width="2.6" opacity=".9" ${join}><path d="${placed[i].d}"/></g>`;
    if (st.cuts && q.pattern) {
      const b = placed[i].box; let cuts = '';
      for (let k = 0; k < st.cuts; k++) { const yy = b.y0 + b.h * (0.3 + 0.35 * k + rand() * 0.1); cuts += `<path d="M${f1(b.x0 - 10)} ${f1(yy + 14)}L${f1(b.x1 + 10)} ${f1(yy - 14)}" stroke="${xml(c.line)}" stroke-width="4"/>`; }
      out += `<g mask="url(#m${id}-${i})">${cuts}</g>`;
    }
    if (st.shine && q.shine && !st.thin) {
      const p = placed[i], [hx, hy] = extreme(p, -0.7, -0.7), toC = Math.atan2(p.box.cy - hy, p.box.cx - hx);
      const inset = Math.max(0, 7 - fat / 2), sx = hx + Math.cos(toC) * inset, sy = hy + Math.sin(toC) * inset, sw = Math.max(3, fat * 0.3 + 2.5);
      out += `<g mask="url(#m${id}-${i})"><path d="M${f1(sx)} ${f1(sy + 16)}Q${f1(sx + 1)} ${f1(sy + 2)} ${f1(sx + 16)} ${f1(sy)}" fill="none" stroke="#fffdf4" stroke-width="${f1(sw)}" stroke-linecap="round" opacity=".92"/><circle cx="${f1(sx + 24)}" cy="${f1(sy + 1)}" r="${f1(sw * 0.55)}" fill="#fffdf4" opacity=".92"/></g>`;
    }
    return out;
  };
  if (st.stack) placed.forEach((_, i) => { body += faceOf(i, LID(i)) + decor(i); });
  else { body += faceOf(0, WID); placed.forEach((_, i) => { body += decor(i); }); }
  // overspray: paint mist round the edges
  const mist = Math.round(st.overspray * (q.patchy ? 1.8 : 1) * all.w / 4);
  if (mist) {
    let dots = '';
    for (let k = 0; k < mist; k++) {
      const p = placed[Math.floor(rand() * placed.length)], [px, py] = p.pts[Math.floor(rand() * p.pts.length)], a = Math.atan2(py - p.box.cy, px - p.box.cx), r = reach / 2 + 2 + rand() * (10 + st.overspray * 10);
      dots += `<circle cx="${f1(px + Math.cos(a) * r)}" cy="${f1(py + Math.sin(a) * r)}" r="${f1(0.6 + rand() * 1.8)}" opacity="${(0.2 + rand() * 0.5).toFixed(2)}"/>`;
    }
    body += `<g fill="${xml(st.outline ? c.line : c.fill)}">${dots}</g>`;
  }
  // extras on top: underline swoosh, sparkles, crown
  let top = '';
  if (extras.underline && lvl >= 1) top += `<path d="M${f1(all.x0 - 10)} ${f1(all.y1 + reach + 14)}Q${f1(all.cx)} ${f1(all.y1 + reach + 40)} ${f1(all.x1 + 30)} ${f1(all.y1 + reach + 4)}" fill="none" stroke="${xml(c.line)}" stroke-width="${f1(10 + ol)}" stroke-linecap="round"/><path d="M${f1(all.x0 - 10)} ${f1(all.y1 + reach + 14)}Q${f1(all.cx)} ${f1(all.y1 + reach + 40)} ${f1(all.x1 + 30)} ${f1(all.y1 + reach + 4)}" fill="none" stroke="${xml(c.acc)}" stroke-width="10" stroke-linecap="round"/>`;
  if (extras.spark || lvl >= 2) {
    const spots = [[all.x0 - 4, all.y0 - 6, 15], [all.x1 + 8, all.y0 + 4, 12], [all.cx + all.w * 0.2, all.y1 + 8, 9], [all.x0 + all.w * 0.3, all.y0 - 14, 8]];
    top += `<g fill="#fffdf4" stroke="${xml(c.line)}" stroke-width="2.5" stroke-linejoin="round">${spots.slice(0, 2 + Math.min(2, lvl)).map(([sx, sy, r]) => `<path d="${sparkle(sx, sy, r)}"/>`).join('')}</g>`;
  }
  if (extras.crown || lvl >= 4 || (d.quality === 'exceptionalSuccess')) {
    const L0 = placed[0], cxw = L0.box.cx + 6, cyw = L0.box.y0 - reach / 2 - 4;
    top += `<g transform="translate(${f1(cxw)} ${f1(cyw)}) rotate(-12)"><path d="M-30 0L-34 -30L-17 -14L0 -38L17 -14L34 -30L30 0Z" fill="${xml(c.acc)}" stroke="${xml(c.line)}" stroke-width="4.5" stroke-linejoin="round"/><circle cx="0" cy="-38" r="4.5" fill="#fffdf4" stroke="${xml(c.line)}" stroke-width="2.5"/><circle cx="-34" cy="-30" r="3.6" fill="#fffdf4" stroke="${xml(c.line)}" stroke-width="2.5"/><circle cx="34" cy="-30" r="3.6" fill="#fffdf4" stroke="${xml(c.line)}" stroke-width="2.5"/></g>`;
  }

  // 6 · fit everything into the canvas
  const pad = reach / 2 + cloud + key + 6, hasCrown = top.includes('rotate(-12)');
  const ext = {x0: reachAll.x0 - pad + Math.min(0, depth * dv[0]), y0: reachAll.y0 - pad + Math.min(0, depth * dv[1]) - (hasCrown ? 46 : 0) - (lvl >= 2 ? 16 : 0),
    x1: reachAll.x1 + pad + Math.max(0, depth * dv[0]) + (lvl >= 2 ? 16 : 0), y1: reachAll.y1 + pad + Math.max(0, depth * dv[1]) + (extras.underline && lvl >= 1 ? 40 : 0)};
  if (charBox) { ext.x0 = Math.min(ext.x0, charBox.x0); ext.x1 = Math.max(ext.x1, charBox.x1); ext.y0 = Math.min(ext.y0, charBox.y0); ext.y1 = Math.max(ext.y1, charBox.y1); }
  if (glow) {   // a soft can-glow behind the piece, fading out before the edge of the decal
    const gx = (ext.x0 + ext.x1) / 2, gy = (ext.y0 + ext.y1) / 2, ex = (ext.x1 - ext.x0) * 0.04, ey = (ext.y1 - ext.y0) * 0.04;
    ext.x0 -= ex; ext.x1 += ex; ext.y0 -= ey; ext.y1 += ey;
    defs += `<radialGradient id="g${id}"><stop offset="0" stop-color="${xml(c.acc)}" stop-opacity=".5"/><stop offset=".55" stop-color="${xml(c.acc)}" stop-opacity=".2"/><stop offset="1" stop-color="${xml(c.acc)}" stop-opacity="0"/></radialGradient>`;
    body = `<ellipse cx="${f1(gx)}" cy="${f1(gy)}" rx="${f1((ext.x1 - ext.x0) / 2)}" ry="${f1((ext.y1 - ext.y0) / 2)}" fill="url(#g${id})"/>` + body;
  }
  const ew = ext.x1 - ext.x0, eh = ext.y1 - ext.y0, k = Math.min(W * 0.96 / ew, H * 0.94 / eh);
  const tx = (W - ew * k) / 2 - ext.x0 * k, ty = (H - eh * k) / 2 - ext.y0 * k;
  const bg = d.background === 'solid' ? `<rect width="100%" height="100%" rx="18" fill="#ece7d7"/>` : '';
  const chFirst = ch && d.charSide === 'left';   // a character on the left sits behind the first letter's cloud
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${xml(text)} graffiti piece"><defs>${defs}</defs>${bg}<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${k.toFixed(4)})">${chFirst ? charSvg : ''}${body}${chFirst ? '' : charSvg}${top}</g></svg>`;
}
