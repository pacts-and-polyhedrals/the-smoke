// Menus that fit the screen. The Token HUD (right-click a token) gets a column of Smoke buttons on top of Foundry's
// own; on a vehicle or for the GM that column can run off the top or bottom of the screen. The Smoke buttons in each
// column are gathered into one group, and when the column is taller than the screen, only that group scrolls —
// Foundry's buttons and their pop-out palettes are never clipped. Pop-up menus over the map stay on screen too.
const MARGIN = 8;
const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** Gather this column's Smoke buttons into one group (once). Returns the group, or null if the column has none. */
export function groupSmokeButtons(col) {
  let group = col.querySelector(':scope > .smoke-hud-group');
  const loose = [...col.children].filter(b => b.classList?.contains('control-icon') && [...b.classList].some(c => c.startsWith('smoke-')));
  if (!group && !loose.length) return null;
  if (!group) { group = document.createElement('div'); group.className = 'smoke-hud-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'The Smoke'); }
  for (const b of loose) group.append(b);
  col.append(group);
  return group;
}

/** Where a column's buttons start and end on screen, in screen pixels (null if it shows none). */
function extent(col) {
  // A scrolling group counts as its own box (buttons scrolled out of it are reachable); otherwise its buttons count.
  const group = col.querySelector(':scope > .smoke-hud-group'), scrolling = group?.classList.contains('scrolls');
  const boxes = [...col.children].flatMap(e => e === group ? (scrolling ? [group] : [...group.children]) : [e]).filter(visible).map(e => e.getBoundingClientRect());
  if (!boxes.length) return null;
  return {top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom))};
}
const scaleOf = el => { const h = el.offsetHeight; return h ? (el.getBoundingClientRect().height / h) || 1 : 1; };

/**
 * Make every column of this Token HUD fit the screen. A column that fits but hangs off the top or bottom (a token at
 * the edge of the view) slides onto the screen; one taller than the screen scrolls its Smoke group.
 */
export function fitTokenHud(root) {
  if (!root?.querySelectorAll) return;
  for (const col of root.querySelectorAll('.col')) {
    const group = groupSmokeButtons(col);
    col.style.translate = ''; if (group) { group.classList.remove('scrolls'); group.style.maxHeight = ''; }
    let dy = 0;
    for (let i = 0; i < 6; i++) {
      const e = extent(col); if (!e) break;
      const room = globalThis.innerHeight - 2 * MARGIN, tall = e.bottom - e.top;
      if (tall > room + 1 && group) {
        group.classList.add('scrolls');
        const r = group.getBoundingClientRect(), one = Math.min(r.height, group.firstElementChild?.getBoundingClientRect().height || 40);
        const next = Math.max(one, r.height - (tall - room) - 1);
        group.style.maxHeight = `${Math.floor(next / scaleOf(group))}px`;
        if (next > one) continue;
      }
      const shift = e.top < MARGIN ? MARGIN - e.top : e.bottom > globalThis.innerHeight - MARGIN ? globalThis.innerHeight - MARGIN - e.bottom : 0;
      if (Math.abs(shift) < 1) break;
      dy += shift / scaleOf(col); col.style.translate = `0 ${Math.round(dy)}px`;
    }
  }
}

/** Keep a pop-up menu (fixed position) on screen: move it up if it runs off the bottom, and cap its height. */
export function keepOnScreen(el) {
  if (!el?.getBoundingClientRect) return;
  const room = globalThis.innerHeight - 2 * MARGIN;
  el.style.maxHeight = `${Math.max(120, Math.min(room, parseFloat(getComputedStyle(el).maxHeight) || room))}px`;
  el.style.overflowY = 'auto';
  const r = el.getBoundingClientRect();
  if (r.bottom > globalThis.innerHeight - MARGIN) el.style.top = `${Math.max(MARGIN, globalThis.innerHeight - MARGIN - r.height)}px`;
}

let installed = false;
export function installMenuFit() {
  if (installed) return; installed = true;
  const hudRoot = () => { const h = globalThis.canvas?.hud?.token; return h?.rendered ? (h.element instanceof HTMLElement ? h.element : h.element?.[0]) : null; };
  // After every other renderTokenHUD hook has added its buttons.
  const later = root => setTimeout(() => { try { fitTokenHud(root ?? hudRoot()); } catch (error) { console.warn('The Smoke | fitting the token HUD', error); } }, 0);
  Hooks.on('renderTokenHUD', (_hud, html) => later(html instanceof HTMLElement ? html : html?.[0]));
  let panTimer = null;
  Hooks.on('canvasPan', () => { if (!hudRoot()) return; clearTimeout(panTimer); panTimer = setTimeout(() => later(hudRoot()), 120); });
  globalThis.addEventListener?.('resize', () => { if (hudRoot()) later(hudRoot()); });
}
