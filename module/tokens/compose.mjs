// The token builder's compositor (0.5.25). Pure: no DOM, no Foundry, so the same code renders in the browser and in
// the tests. A recipe names one part per category plus colours; the parts are the hand-drawn SVG pieces in
// assets/tokens/builder (see scripts/tokens/draw_parts.py for the art standard). The figure is drawn facing the top
// edge and turned to face the bottom edge, like every other token in The Smoke.

export const RECIPE_VERSION = 1;
const C = 256;
export const PART_KEYS = Object.freeze(['hair', 'hat', 'face', 'top', 'outerwear', 'legs', 'shoes', 'gloves', 'trim', 'neck', 'back', 'prop']);
export const COLOUR_KEYS = Object.freeze(['hair', 'top', 'outer', 'legs', 'shoes', 'hat', 'bag', 'acc']);
const HEX = /^#[0-9a-f]{6}$/i;

/* ------------------------------------------------------------------ colour */
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour by a fraction. */
export function shade(hex, amt) {
  if (!HEX.test(String(hex))) return hex;
  const n = parseInt(hex.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const out = rgb.map(c => amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${out.map(c => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}
/** Every colour slot a part can ask for, with -dark and -light shades. */
export function slotColours(recipe, catalogue) {
  const r = recipe, skin = catalogue.skins.find(s => s.id === r.skin)?.colour ?? '#c68e64';
  const outerPart = partOf(catalogue, 'outerwear', r.outerwear), topPart = partOf(catalogue, 'top', r.top);
  const glovePart = partOf(catalogue, 'gloves', r.gloves);
  const base = {skin, ...r.colours};
  base.glove = !glovePart ? skin : glovePart.glove === 'acc' ? base.acc : glovePart.glove;
  base.hood = outerPart?.hood ? base.outer : topPart?.hood ? base.top : base.top;
  const out = {ink: '#0a0d10'};
  for (const [k, v] of Object.entries(base)) {
    const c = HEX.test(String(v)) ? v : '#808080';
    out[k] = c; out[`${k}-dark`] = shade(c, -0.32); out[`${k}-light`] = shade(c, 0.28);
  }
  return out;
}

/* ------------------------------------------------------------------ catalogue helpers */
export const partOf = (catalogue, category, id) => (id && id !== 'none') ? catalogue.parts.find(p => p.category === category && p.id === id) ?? null : null;
export const partsIn = (catalogue, category, {npc = true} = {}) => catalogue.parts.filter(p => p.category === category && !p.always && (npc || !p.npc));
const pick = (list, rand) => list[Math.floor(rand() * list.length) % list.length];

/** A complete, valid recipe: unknown parts dropped to defaults, colours checked. */
export function normaliseRecipe(input = {}, catalogue) {
  const r = input && typeof input === 'object' ? input : {};
  const out = {v: RECIPE_VERSION, body: catalogue.builds.some(b => b.id === r.body) ? r.body : 'medium',
    skin: catalogue.skins.some(s => s.id === r.skin) ? r.skin : catalogue.skins[3].id};
  const required = {top: 'tee', legs: 'jeans', shoes: 'trainers'};
  for (const k of PART_KEYS) {
    const id = r[k];
    out[k] = id && id !== 'none' && partOf(catalogue, k, id) ? id : (required[k] ?? 'none');
  }
  const colours = r.colours && typeof r.colours === 'object' ? r.colours : {};
  const fallback = {hair: '#2a2622', top: partOf(catalogue, 'top', out.top)?.default ?? '#d9d3c4', outer: partOf(catalogue, 'outerwear', out.outerwear)?.default ?? '#3a3f46',
    legs: partOf(catalogue, 'legs', out.legs)?.default ?? '#3d5a80', shoes: partOf(catalogue, 'shoes', out.shoes)?.default ?? '#f1ede2', hat: partOf(catalogue, 'hat', out.hat)?.default ?? '#16181c',
    bag: partOf(catalogue, 'back', out.back)?.default ?? '#2f333a', acc: '#ff7fb0'};
  out.colours = Object.fromEntries(COLOUR_KEYS.map(k => [k, HEX.test(String(colours[k])) ? String(colours[k]).toLowerCase() : fallback[k]]));
  out.ring = r.ring === false ? false : HEX.test(String(r.ring)) ? String(r.ring).toLowerCase() : null;   // null: ring takes the accent colour
  out.number = String(r.number ?? '10').replace(/[^0-9A-Za-z]/g, '').slice(0, 2) || '10';
  return out;
}

/** The parts actually drawn, after headwear and face coverings hide what they cover. */
export function visibleParts(recipe, catalogue) {
  const chosen = new Map();
  for (const p of catalogue.parts.filter(p => p.always)) chosen.set(`${p.category}:${p.id}`, {part: p, hideTags: new Set()});
  for (const k of PART_KEYS) { const p = partOf(catalogue, k, recipe[k]); if (p) chosen.set(k, {part: p, hideTags: new Set()}); }
  const hidden = new Set();
  // Headwear first, then the face: a full-face helmet hides the face covering, a balaclava hides the hat.
  for (const k of ['hat', 'face']) {
    const entry = chosen.get(k); if (!entry || hidden.has(k)) continue;
    for (const h of entry.part.hides ?? []) {
      const [cat, tag] = h.split(':');
      if (tag) chosen.get(cat)?.hideTags.add(tag);
      else hidden.add(cat);
    }
  }
  for (const k of hidden) chosen.delete(k);
  return [...chosen.values()];
}
/** The SVG files a recipe needs (for fetching). */
export const filesFor = (recipe, catalogue) => visibleParts(recipe, catalogue).map(v => v.part.file).filter(Boolean);

/* ------------------------------------------------------------------ SVG */
/** Split a part file into its <g data-z> groups. */
export function splitGroups(svgText) {
  const s = String(svgText || ''), out = [];
  const re = /<g data-z="(-?\d+(?:\.\d+)?)"(?: data-tag="([\w-]+)")?>/g;
  let m;
  while ((m = re.exec(s))) {
    // find the matching </g>, allowing nested groups
    let depth = 1, i = re.lastIndex;
    const tag = /<g\b[^>]*>|<\/g>/g; tag.lastIndex = i;
    let t, end = -1;
    while ((t = tag.exec(s))) { depth += t[0] === '</g>' ? -1 : 1; if (!depth) { end = t.index; break; } }
    if (end < 0) break;
    out.push({z: Number(m[1]), tag: m[2] ?? null, body: s.slice(i, end)});
    re.lastIndex = end + 4;
  }
  return out;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
/** Fill var(--slot) placeholders; unknown slots fall back to grey so a bad part can't break the token. */
export const fillSlots = (body, colours) => body.replace(/var\(--([a-z]+(?:-(?:dark|light))?)\)/g, (_, k) => colours[k] ?? '#808080');
/** Counter-rotate text marked data-upright so it reads the right way up once the figure is turned round. */
const upright = body => body.replace(/<text data-upright="1" x="([\d.]+)" y="([\d.]+)"/g, (_, x, y) => `<text transform="rotate(180 ${x} ${Number(y) - 11})" x="${x}" y="${y}"`);

/**
 * The finished token as an SVG string.
 * parts: Map or object of file path -> SVG text. Options: size (pixels), idPrefix (to keep inline copies apart), shadow.
 */
export function composeSVG(recipeIn, catalogue, parts, {size = 512, idPrefix = 'tk', shadow = true} = {}) {
  const recipe = normaliseRecipe(recipeIn, catalogue), colours = slotColours(recipe, catalogue);
  const text = f => (parts instanceof Map ? parts.get(f) : parts?.[f]) ?? '';
  const build = catalogue.builds.find(b => b.id === recipe.body) ?? {sx: 1, sy: 1};
  const groups = [];
  for (const {part, hideTags} of visibleParts(recipe, catalogue)) {
    if (!part.file) continue;
    for (const grp of splitGroups(text(part.file))) if (!grp.tag || !hideTags.has(grp.tag)) groups.push({...grp, cat: part.category});
  }
  groups.sort((a, b) => a.z - b.z);
  const id = n => `${idPrefix}-${n}`;
  const prep = b => upright(fillSlots(b, colours).replaceAll('{{number}}', esc(recipe.number)).replaceAll('url(#glow)', `url(#${id('glow')})`));
  const body = groups.filter(gp => gp.z < 100).map(gp => prep(gp.body)).join('');
  const head = groups.filter(gp => gp.z >= 100).map(gp => prep(gp.body)).join('');
  const ring = recipe.ring === false ? null : recipe.ring ?? recipe.colours.acc;
  const scale = `translate(${C} ${C}) scale(${build.sx} ${build.sy}) translate(${-C} ${-C})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">` +
    `<defs><filter id="${id('glow')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<filter id="${id('shadow')}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="7"/><feOffset dx="9" dy="12" result="o"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<clipPath id="${id('disc')}"><circle cx="${C}" cy="${C}" r="226"/></clipPath></defs>` +
    (ring ? `<circle cx="${C}" cy="${C}" r="232" fill="none" stroke="${ring}" stroke-width="10" opacity=".95" filter="url(#${id('glow')})"/>` : '') +
    `<g clip-path="url(#${id('disc')})">${ring ? `<circle cx="${C}" cy="${C}" r="214" fill="${ring}" opacity=".08"/>` : ''}` +
    `<g${shadow ? ` filter="url(#${id('shadow')})"` : ''}><g transform="rotate(180 ${C} ${C})"><g transform="${scale}">${body}</g>${head}</g></g></g></svg>`;
}

/* ------------------------------------------------------------------ recipes */
/** A short stable key for a recipe (used in the saved file name, so a changed token is never served stale). */
export function recipeKey(recipe) {
  const s = JSON.stringify(recipe, Object.keys(recipe).sort().concat(COLOUR_KEYS));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}
/** A seeded random number generator (mulberry32), so a seed always gives the same look. */
export function seeded(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ODDS = {hat: 0.4, face: 0.22, outerwear: 0.62, gloves: 0.15, trim: 0.45, neck: 0.3, back: 0.4, prop: 0.5};
/** A random but coherent look. Police, paramedic and other service-only pieces only appear with {npc: true}. */
export function randomRecipe(catalogue, rand = Math.random, {npc = false} = {}) {
  const r = {body: pick(catalogue.builds, rand).id, skin: pick(catalogue.skins, rand).id};
  for (const k of PART_KEYS) {
    const list = partsIn(catalogue, k, {npc});
    const optional = k in ODDS;
    if (k === 'hair') r.hair = rand() < 0.07 ? 'none' : pick(list, rand).id;
    else if (optional) r[k] = rand() < ODDS[k] && list.length ? pick(list.filter(p => !p.hivis || rand() < 0.2), rand)?.id ?? 'none' : 'none';
    else r[k] = pick(list, rand).id;
  }
  const cloth = catalogue.palettes.cloth.filter(c => !/Hi-vis/.test(c.label)).map(c => c.colour), hair = catalogue.palettes.hair.map(c => c.colour);
  const natural = hair.slice(0, 8);
  r.colours = {hair: rand() < 0.85 ? pick(natural, rand) : pick(hair, rand), top: pick(cloth, rand), legs: pick(cloth, rand), shoes: pick(cloth, rand), hat: pick(cloth, rand), bag: pick(cloth, rand),
    acc: pick(catalogue.palettes.accent, rand).colour};
  const outerPart = partOf(catalogue, 'outerwear', r.outerwear);
  r.colours.outer = outerPart?.hivis ? pick(['#d8e03a', '#ff8a3d'], rand) : pick(cloth.filter(c => c !== r.colours.top), rand);
  if (r.hat === 'hood' && !partOf(catalogue, 'top', r.top)?.hood && !outerPart?.hood) r.hat = 'none';
  r.number = String(2 + Math.floor(rand() * 98));
  return normaliseRecipe(r, catalogue);
}
/** Put on a style preset's clothes and kit, keeping who you are (build, skin, hair, hair colour). */
export function applyPreset(recipe, preset, catalogue) {
  const base = normaliseRecipe(recipe, catalogue), p = preset?.recipe ?? {};
  const out = {...base, ...Object.fromEntries(PART_KEYS.filter(k => k in p && !['hair'].includes(k)).map(k => [k, p[k]]))};
  out.colours = {...base.colours, ...(p.colours ?? {}), hair: base.colours.hair};
  if ('ring' in p) out.ring = p.ring;
  return normaliseRecipe(out, catalogue);
}
/** The look a character starts with before anyone builds one: stable for the same seed (the actor id). */
export const defaultRecipe = (catalogue, seed = 'smoke') => randomRecipe(catalogue, seeded(seed));
