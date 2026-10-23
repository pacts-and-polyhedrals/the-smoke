// THE SMOKE — a character is one person, wherever their token stands (0.5.27).
// Foundry makes a new actor's token unlinked unless the system says otherwise, and an unlinked token keeps its own copy
// of the character. Cash or kit added through that token's sheet (double-clicking the token) went into the copy, while
// the shops, the Tag Studio, the missions and the Blower all use the character itself: ten cans of Spray Paint on the
// token, and the Tag Studio still said "buy one from a shop". Characters are now always linked. Anything already added
// to an unlinked copy is moved onto the character first (kit added or changed, and more cash or stash), then the token
// is linked, so nothing the GM gave is lost.
import {isLeader, card, esc} from './net.mjs';

const isCharacter = actor => actor?.type === 'character';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Move what an unlinked token's copy has that the character doesn't onto the character. Returns what moved. */
export async function foldTokenCopy(token) {
  const base = game.actors.get(token?.actorId), copy = token?.actor;
  if (!isCharacter(base) || token.actorLink || !copy || copy === base) return {items: [], money: []};
  const moved = {items: [], money: []}, patch = {};
  // money: the copy's is the GM's latest word when it is higher (missions and shops only ever paid the character)
  for (const key of ['cash', 'stash']) {
    const mine = Number(base.system?.[key] || 0), theirs = Number(copy.system?.[key] || 0);
    if (theirs > mine) { patch[`system.${key}`] = theirs; moved.money.push(`${key} £${mine} → £${theirs}`); }
  }
  if (Object.keys(patch).length) await base.update(patch, {smokeFold: true});
  // kit: added on the token, or changed there (a stack of ten instead of one); nothing on the character is removed
  const add = [], update = [];
  for (const item of copy.items ?? []) {
    const data = item.toObject(), own = base.items.get(item.id);
    if (!own) { add.push(data); moved.items.push(`${item.name}${Number(data.system?.quantity ?? 1) > 1 ? ` ×${data.system.quantity}` : ''}`); continue; }
    const o = own.toObject();
    if (!same(o.system, data.system) || o.name !== data.name) { update.push({_id: own.id, name: data.name, system: data.system}); moved.items.push(`${item.name} (as on the token)`); }
  }
  if (add.length) await base.createEmbeddedDocuments('Item', add, {keepId: true, smokeFold: true});
  if (update.length) await base.updateEmbeddedDocuments('Item', update, {smokeFold: true});
  return moved;
}

/** GM, once per load: every character's prototype is linked and every placed character token is linked, after its
 *  copy is folded in. Tells the GM what moved. */
export async function linkCharacterTokens() {
  if (!isLeader() || !game.user?.isGM) return {actors: 0, tokens: 0, moved: []};
  let actors = 0, tokens = 0; const moved = [];
  for (const actor of game.actors?.contents ?? [...(game.actors ?? [])]) {
    if (!isCharacter(actor) || actor.prototypeToken?.actorLink) continue;
    await actor.update({'prototypeToken.actorLink': true}); actors++;
  }
  for (const scene of game.scenes?.contents ?? [...(game.scenes ?? [])]) {
    for (const token of [...(scene.tokens ?? [])]) {
      if (token.actorLink || !isCharacter(game.actors.get(token.actorId))) continue;
      try {
        const m = await foldTokenCopy(token);
        if (m.items.length || m.money.length) moved.push(`<li><b>${esc(token.name)}</b> on ${esc(scene.name)}: ${esc([...m.money, ...m.items].join(', '))}</li>`);
        await token.update({actorLink: true}); tokens++;
      } catch (error) { console.warn(`The Smoke | could not link ${token.name} on ${scene.name}`, error); }
    }
  }
  if (actors || tokens) await card('THE SMOKE', 'Characters linked to their tokens',
    `<p>${tokens} character token(s) and ${actors} character(s) were unlinked, so cash and kit added on a token's own sheet never reached the character the shops, missions and Tag Studio use. They are linked now.</p>${moved.length ? `<p>Moved onto the characters:</p><ul>${moved.join('')}</ul>` : ''}`,
    '', {whisper: game.users.filter(u => u.isGM).map(u => u.id)});
  return {actors, tokens, moved};
}

/** New characters, and every token dragged out for one, are linked from the start. */
export function installCharacterLinks() {
  Hooks.on('preCreateActor', doc => { if (isCharacter(doc) && !doc.prototypeToken?.actorLink) doc.updateSource({'prototypeToken.actorLink': true}); });
  Hooks.on('preCreateToken', doc => { if (!doc.actorLink && isCharacter(game.actors.get(doc.actorId))) doc.updateSource({actorLink: true}); });
}
export const charactersAPI = {link: linkCharacterTokens, fold: foldTokenCopy};
