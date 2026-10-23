// The token builder's controls (0.5.25), shared by the Token Builder window and the Character Creator's Token step:
// a live preview, build and skin, every part category with a picture of each choice on your own figure, colours,
// presets, randomise and reset. Plain HTML (no template) so both windows can host it.
import {svgFor, dataUri} from './kit.mjs';
import {normaliseRecipe, randomRecipe, applyPreset, partsIn, partOf} from './compose.mjs';

/** Which colour slot each category's swatches set. */
export const SLOT_OF = Object.freeze({hair: 'hair', hat: 'hat', top: 'top', outerwear: 'outer', legs: 'legs', shoes: 'shoes', back: 'bag', trim: 'acc', neck: 'acc', prop: 'acc', face: 'acc'});
const OPTIONAL = new Set(['hair', 'hat', 'face', 'outerwear', 'gloves', 'trim', 'neck', 'back', 'prop']);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function newPanelState(kit, recipe, {npc = false, category = 'hair'} = {}) {
  const r = normaliseRecipe(recipe, kit.catalogue);
  return {kit, recipe: r, start: structuredClone(r), category, touched: new Set(), npc, portrait: false};
}
const paletteFor = (state, slot) => {
  const p = state.kit.catalogue.palettes;
  return slot === 'hair' ? p.hair : slot === 'acc' ? p.accent : p.cloth;
};
/** The controls as HTML. */
export function panelHTML(state, {idPrefix = 'tb'} = {}) {
  const {kit, recipe: r} = state, cat = kit.catalogue;
  const big = dataUri(svgFor(r, kit, {size: 320, idPrefix: `${idPrefix}big`}));
  const categories = cat.categories.filter(c => !['body', 'skin'].includes(c.key));
  const groups = [...new Set(categories.map(c => c.group))];
  const active = categories.find(c => c.key === state.category) ?? categories[0];
  const list = partsIn(cat, active.key, {npc: state.npc || game?.user?.isGM});
  const options = [...(OPTIONAL.has(active.key) ? [{id: 'none', label: active.none ?? 'None'}] : []), ...list].map((p, i) => {
    const trial = {...r, [active.key]: p.id};
    const slot = SLOT_OF[active.key];
    if (slot && p.default && !state.touched.has(slot) && p.id !== r[active.key]) trial.colours = {...r.colours, [slot]: p.default};
    return {id: p.id, label: p.label, on: r[active.key] === p.id, img: dataUri(svgFor(trial, kit, {size: 96, idPrefix: `${idPrefix}o${i}`, shadow: false}))};
  });
  const slot = SLOT_OF[active.key], current = slot ? r.colours[slot] : null;
  const swatches = slot ? paletteFor(state, slot).map(c => `<button type="button" class="tb-swatch${c.colour === current ? ' on' : ''}" data-tb-colour="${h(c.colour)}" title="${h(c.label)}" style="background:${h(c.colour)}"></button>`).join('') : '';
  const ringNow = r.ring === false ? 'off' : r.ring ?? 'trim';
  return `<div class="tb-panel">
  <div class="tb-preview">
    <img class="tb-big" src="${big}" alt="Token preview">
    <div class="tb-row"><span class="tb-label">Build</span>${cat.builds.map(b => `<button type="button" data-tb-build="${h(b.id)}" class="${b.id === r.body ? 'on' : ''}">${h(b.label)}</button>`).join('')}</div>
    <div class="tb-row"><span class="tb-label">Skin</span>${cat.skins.map(s => `<button type="button" class="tb-swatch skin${s.id === r.skin ? ' on' : ''}" data-tb-skin="${h(s.id)}" title="${h(s.label)}" style="background:${h(s.colour)}"></button>`).join('')}</div>
    <div class="tb-row"><span class="tb-label">Ring</span><button type="button" data-tb-ring="trim" class="${ringNow === 'trim' ? 'on' : ''}" title="The ring takes your faction trim colour">Trim colour</button><button type="button" data-tb-ring="off" class="${ringNow === 'off' ? 'on' : ''}">No ring</button>${cat.palettes.accent.slice(0, 12).map(c => `<button type="button" class="tb-swatch${ringNow === c.colour ? ' on' : ''}" data-tb-ring="${h(c.colour)}" title="${h(c.label)}" style="background:${h(c.colour)}"></button>`).join('')}</div>
    <div class="tb-row tb-actions">
      <button type="button" data-tb-random title="A whole new look (keeps nothing)"><i class="fa-solid fa-dice"></i> Randomise</button>
      <button type="button" data-tb-random-clothes title="New clothes and kit, same person"><i class="fa-solid fa-shirt"></i> New clothes</button>
      <button type="button" data-tb-reset title="Back to how it was when you opened this"><i class="fa-solid fa-rotate-left"></i> Reset</button>
      <select data-tb-preset aria-label="Style presets"><option value="">— style presets —</option>${cat.presets.filter(p => !p.npc || state.npc || game?.user?.isGM).map(p => `<option value="${h(p.id)}">${h(p.label)}${p.npc ? ' (NPC)' : ''}</option>`).join('')}</select>
    </div>
  </div>
  <div class="tb-side">
    <nav class="tb-cats">${groups.map(g => `<div class="tb-group"><span class="tb-label">${h(g)}</span>${categories.filter(c => c.group === g).map(c => `<button type="button" data-tb-cat="${h(c.key)}" class="${c.key === active.key ? 'on' : ''}">${h(c.label)}</button>`).join('')}</div>`).join('')}</nav>
    <div class="tb-options">${options.map(o => `<button type="button" class="tb-option${o.on ? ' on' : ''}" data-tb-part="${h(o.id)}" title="${h(o.label)}"><img src="${o.img}" alt=""><span>${h(o.label)}</span></button>`).join('')}</div>
    ${slot ? `<div class="tb-row tb-colours"><span class="tb-label">Colour</span>${swatches}<input type="color" data-tb-colour-pick value="${h(current)}" title="Any colour"></div>` : ''}
    ${r.top === 'football' && active.key === 'top' ? `<div class="tb-row"><span class="tb-label">Shirt number</span><input type="text" maxlength="2" size="3" data-tb-number value="${h(r.number)}"></div>` : ''}
  </div>
</div>`;
}
/** Wire the controls inside `root`; `rerender` redraws whoever hosts the panel. */
export function wirePanel(root, state, rerender) {
  const cat = state.kit.catalogue;
  const set = fn => { fn(); state.recipe = normaliseRecipe(state.recipe, cat); rerender(); };
  const on = (sel, fn, ev = 'click') => root.querySelectorAll(sel).forEach(n => n.addEventListener(ev, e => { if (ev === 'click') e.preventDefault(); try { fn(n); } catch (err) { ui.notifications?.warn?.(err.message); } }));
  on('[data-tb-build]', n => set(() => { state.recipe.body = n.dataset.tbBuild; }));
  on('[data-tb-skin]', n => set(() => { state.recipe.skin = n.dataset.tbSkin; }));
  on('[data-tb-ring]', n => set(() => { const v = n.dataset.tbRing; state.recipe.ring = v === 'off' ? false : v === 'trim' ? null : v; }));
  on('[data-tb-cat]', n => { state.category = n.dataset.tbCat; rerender(); });
  on('[data-tb-part]', n => set(() => {
    const k = state.category, id = n.dataset.tbPart, slot = SLOT_OF[k], part = partOf(cat, k, id);
    state.recipe[k] = id;
    if (slot && part?.default && !state.touched.has(slot)) state.recipe.colours[slot] = part.default;
    if (k === 'hat' && id === 'hood' && !partOf(cat, 'top', state.recipe.top)?.hood && !partOf(cat, 'outerwear', state.recipe.outerwear)?.hood) state.recipe.top = 'hoodie';
  }));
  const colour = v => set(() => { const slot = SLOT_OF[state.category]; if (!slot) return; state.recipe.colours[slot] = v; state.touched.add(slot); });
  on('[data-tb-colour]', n => colour(n.dataset.tbColour));
  on('[data-tb-colour-pick]', n => colour(n.value), 'change');
  on('[data-tb-number]', n => set(() => { state.recipe.number = n.value; }), 'change');
  on('[data-tb-random]', () => set(() => { state.recipe = randomRecipe(cat, Math.random, {npc: state.npc}); state.touched.clear(); }));
  on('[data-tb-random-clothes]', () => set(() => {
    const fresh = randomRecipe(cat, Math.random, {npc: state.npc}), keep = state.recipe;
    state.recipe = {...fresh, body: keep.body, skin: keep.skin, hair: keep.hair, colours: {...fresh.colours, hair: keep.colours.hair}};
  }));
  on('[data-tb-reset]', () => set(() => { state.recipe = structuredClone(state.start); state.touched.clear(); }));
  on('[data-tb-preset]', n => { const p = cat.presets.find(x => x.id === n.value); if (p) set(() => { state.recipe = applyPreset(state.recipe, p, cat); }); }, 'change');
}
