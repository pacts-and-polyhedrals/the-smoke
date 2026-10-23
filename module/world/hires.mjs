// Hired hands (0.5.25): from Rep 13 ("Top Boy") a character can put people on the payroll — one for each stat, so a
// crew can cover what its players are weak at. A hand is an NPC the employer's player owns and runs (in the Combat
// Console, behind the wheel, on a job). Two at Rep 13, three from Rep 20, four from Rep 27. The fee is paid up front;
// a dismissed hand walks off for good. Each gets a token from the Token Builder's kit, dressed for the job.
import {NS} from '../config.mjs';
import {registerHandler, request, card, esc} from './net.mjs';
import {HIRE_TYPES, hireType, hireSlots, hireProblem, hireName, hireActorData, HIRE_REP} from '../rules/hires-core.mjs';
import {placeToken, tokenCentre} from './spawn.mjs';

const FOLDER = 'The Smoke — Hired Hands';
/** The hands on `employer`'s payroll. */
export const handsOf = employer => (game.actors?.filter?.(a => a.type === 'npc' && a.getFlag?.(NS, 'hire')?.employer === employer?.id) ?? []);
const ownerIds = actor => game.users.filter(u => !u.isGM && actor.testUserPermission?.(u, 'OWNER')).map(u => u.id);
const tokenOf = actor => globalThis.canvas?.scene?.tokens?.find?.(t => t.actorId === actor.id) ?? game.scenes?.find?.(s => s.tokens.some(t => t.actorId === actor.id))?.tokens.find(t => t.actorId === actor.id) ?? null;

registerHandler('hire.take', async ({actorId, type, userId}) => {
  const employer = game.actors.get(actorId), user = game.users.get(userId), t = hireType(type);
  if (!employer || employer.type !== 'character') throw new Error('Pick a character.');
  if (!user?.isGM && !employer.testUserPermission?.(user, 'OWNER')) throw new Error('Not your character.');
  const problem = hireProblem(employer.system, t, handsOf(employer).length); if (problem) throw new Error(problem);
  await employer.update({'system.cash': Number(employer.system.cash || 0) - t.fee});
  const name = hireName(Math.random, handsOf(employer).map(a => a.name));
  let folder = game.folders.find(f => f.type === 'Actor' && f.name === FOLDER);
  folder ??= await Folder.implementation.create({name: FOLDER, type: 'Actor', color: '#ff7fb0'});
  const owners = Object.fromEntries(ownerIds(employer).map(id => [id, 3]));
  const hand = await Actor.implementation.create({...hireActorData(t, {name, employer, ownership: owners}), folder: folder.id});
  const lib = (await fetch(`systems/${NS}/data/london-items.json`).then(r => r.json()).catch(() => ({items: []}))).items;
  const kit = t.kit.map(n => lib.find(i => i.name === n)).filter(Boolean).map(i => foundry.utils.deepClone(i));
  if (kit.length) await hand.createEmbeddedDocuments('Item', kit);
  // Dress them for the job with the Token Builder; any failure keeps the plain token (the GM can build one later).
  try { const {quickLook, applyRecipeHere} = await import('../tokens/kit.mjs'); await applyRecipeHere(hand, await quickLook(hand.id, t.preset)); }
  catch (error) { console.warn('The Smoke | hired hand token', error); }
  const near = tokenOf(employer);
  if (near?.parent) {
    const g = near.parent.grid.size, [cx, cy] = tokenCentre(near);
    await placeToken(near.parent, game.actors.get(hand.id), cx + g * 1.5, cy + g * 0.5, {flags: {hire: true}}).catch(error => console.warn('The Smoke | placing a hired hand', error));
  }
  await card('YOUR CREW', `${employer.name} hires ${name}`, `<p><b>${esc(t.label)}</b> (${esc(t.blurb)}) · £${t.fee} up front.</p><p class="smoke-dim">${esc(name)} answers to ${esc(employer.name)}'s player. Open their sheet from the Actors tab; they act on their own speed dice in a fight.</p>`, 'crew');
  return {id: hand.id, name};
});
registerHandler('hire.dismiss', async ({handId, userId}) => {
  const hand = game.actors.get(handId), user = game.users.get(userId), boss = game.actors.get(hand?.getFlag?.(NS, 'hire')?.employer);
  if (!hand?.getFlag?.(NS, 'hire')) throw new Error('That isn\'t a hired hand.');
  if (!user?.isGM && !boss?.testUserPermission?.(user, 'OWNER')) throw new Error('Not your crew.');
  for (const scene of game.scenes ?? []) { const ids = scene.tokens.filter(t => t.actorId === hand.id).map(t => t.id); if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids); }
  const name = hand.name; await hand.delete();
  await card('YOUR CREW', `${name} walks`, `<p>${esc(name)} takes the money and doesn't look back.</p>`, 'crew');
  return true;
});

/** What the Blower shows for `actor`'s crew. */
export function crewCard(actor) {
  const stage = Number(actor?.system?.stage || 1);
  if (!actor || actor.type !== 'character') return null;
  if (stage < HIRE_REP) return {locked: true, rep: HIRE_REP};
  const hands = handsOf(actor), slots = hireSlots(stage), cash = Number(actor.system.cash || 0);
  return {locked: false, slots, used: hands.length, hands: hands.map(h => ({id: h.id, name: h.name, img: h.prototypeToken?.texture?.src || h.img, role: hireType(h.getFlag(NS, 'hire')?.role)?.label ?? 'Hand'})),
    types: HIRE_TYPES.map(t => ({key: t.key, label: t.label, fee: t.fee, stat: t.stat, blurb: t.blurb, can: !hireProblem(actor.system, t, hands.length), why: hireProblem(actor.system, t, hands.length) || `£${t.fee}: ${t.blurb}`})),
    full: hands.length >= slots, cash};
}
export const hiresAPI = {types: HIRE_TYPES, of: handsOf, hire: (actor, type) => request('hire.take', {actorId: actor.id, type}), dismiss: hand => request('hire.dismiss', {handId: hand.id ?? hand})};
