// The token builder in Foundry (0.5.25): loads the part library, renders a recipe to a WebP, saves it and puts it on
// the character. The recipe is kept on the actor (system.identity.tokenParts) so the token can be rebuilt or tweaked
// later, and so improved art can re-render old tokens. Saving goes through the leader GM (players usually can't
// upload files); with no GM online, a player who may upload saves it themselves.
import {NS} from '../config.mjs';
import {registerHandler, request, leaderGM, card, esc} from '../world/net.mjs';
import {composeSVG, normaliseRecipe, recipeKey, defaultRecipe, randomRecipe, applyPreset, seeded} from './compose.mjs';

const VERSION_TAG = () => { try { return game.system.version; } catch (_e) { return 'dev'; } };
let KIT = null;
/** The catalogue and the text of every part file (fetched once, in parallel). */
export function loadKit() {
  KIT ??= (async () => {
    const v = VERSION_TAG();
    const catalogue = await fetch(`systems/${NS}/data/token-builder.json?v=${v}`).then(r => { if (!r.ok) throw new Error(`Token parts catalogue: ${r.status}`); return r.json(); });
    const files = [...new Set(catalogue.parts.map(p => p.file).filter(Boolean))];
    const parts = new Map(await Promise.all(files.map(async f => [f, await fetch(`systems/${NS}/${f}?v=${v}`).then(r => r.ok ? r.text() : '').catch(() => '')])));
    return {catalogue, parts};
  })().catch(error => { KIT = null; throw error; });
  return KIT;
}
/** The recipe on an actor, or a stable default for it. */
export function recipeOf(actor, catalogue) {
  const saved = actor?.system?.identity?.tokenParts;
  return saved && Object.keys(saved).length ? normaliseRecipe(saved, catalogue) : defaultRecipe(catalogue, actor?.id ?? 'smoke');
}
export const svgFor = (recipe, kit, options = {}) => composeSVG(recipe, kit.catalogue, kit.parts, options);
export const dataUri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Draw the SVG onto a canvas and encode it (WebP where the browser can, PNG otherwise). */
export async function rasterise(svg, size = 512, quality = 0.92) {
  const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) throw new Error('This browser could not draw the token.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
const blobToDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(?:webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('That is not a token image.');
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type: m[1]});
}

/* ------------------------------------------------------------------ saving */
const FilePickerImpl = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
/** Where built tokens go: the world's own folder, or the Forge assets library on The Forge. */
export function tokenFolder() {
  const forge = typeof globalThis.ForgeVTT !== 'undefined' && globalThis.ForgeVTT?.usingTheForge;
  return forge ? {source: 'forgevtt', dir: 'the-smoke-tokens'} : {source: 'data', dir: `worlds/${game.world.id}/smoke-tokens`};
}
async function uploadToken(blob, name) {
  const FP = FilePickerImpl(), {source, dir} = tokenFolder();
  try { await FP.browse(source, dir); } catch (_e) { try { await FP.createDirectory(source, dir, {}); } catch (error) { if (!/exist/i.test(String(error?.message))) throw error; } }
  const file = new File([blob], name, {type: blob.type || 'image/webp'});
  const res = await FP.upload(source, dir, file, {}, {notify: false});
  const path = res?.path ?? (res?.status === 'success' ? `${dir}/${name}` : null);
  if (!path) throw new Error(`Could not save the token (${res?.message ?? 'upload refused'}).`);
  return path;
}
/** Put a saved token on the character: the recipe, the prototype token, every placed token, and the portrait if asked. */
async function applyToken(actor, recipe, path, portrait) {
  const update = {'system.identity.tokenParts': {...recipe, file: path}, 'prototypeToken.texture.src': path};
  const plainPortrait = !actor.img || actor.img === 'icons/svg/mystery-man.svg' || String(actor.img).includes('smoke-tokens/') || String(actor.img).includes('the-smoke-tokens/');
  if (portrait || plainPortrait) update.img = path;
  await actor.update(update);
  for (const scene of game.scenes ?? []) {
    const ups = scene.tokens.filter(t => t.actorId === actor.id).map(t => ({_id: t.id, 'texture.src': path}));
    if (ups.length) await scene.updateEmbeddedDocuments('Token', ups).catch(error => console.warn('The Smoke | token texture', error));
  }
  return path;
}
registerHandler('token.save', async ({actorId, recipe, dataUrl, portrait = false, userId}) => {
  const actor = game.actors.get(actorId), user = game.users.get(userId);
  if (!actor) throw new Error('That character has gone.');
  if (!user?.isGM && !actor.testUserPermission?.(user, 'OWNER')) throw new Error('Not your character.');
  if (String(dataUrl || '').length > 3_000_000) throw new Error('That token image is far too big.');
  const kit = await loadKit(), norm = normaliseRecipe(recipe, kit.catalogue);
  const blob = dataUrlToBlob(dataUrl), name = `${actor.id}-${recipeKey(norm)}.${blob.type === 'image/png' ? 'png' : 'webp'}`;
  const path = await uploadToken(blob, name);
  await applyToken(actor, norm, path, Boolean(portrait));
  return path;
});

/** On the leader (or a user who may upload): render, upload and apply without a request — for handlers that make
 * people themselves (a nested request from inside a handler would wait on its own queue). */
export async function applyRecipeHere(actor, recipe, {portrait = true} = {}) {
  const kit = await loadKit(), norm = normaliseRecipe(recipe, kit.catalogue);
  const blob = await rasterise(svgFor(norm, kit, {size: 512}), 512);
  return applyToken(actor, norm, await uploadToken(blob, `${actor.id}-${recipeKey(norm)}.${blob.type === 'image/png' ? 'png' : 'webp'}`), portrait);
}
/** Render, save and apply a recipe to `actor`. Resolves with the image path. */
export async function saveToken(actor, recipe, {portrait = false, quiet = false} = {}) {
  if (!actor) throw new Error('Pick a character first.');
  const kit = await loadKit(), norm = normaliseRecipe(recipe, kit.catalogue);
  const blob = await rasterise(svgFor(norm, kit, {size: 512}), 512);
  let path;
  if (leaderGM()) path = await request('token.save', {actorId: actor.id, recipe: norm, dataUrl: await blobToDataUrl(blob), portrait});
  else if (game.user.can?.('FILES_UPLOAD') && actor.isOwner) path = await applyToken(actor, norm, await uploadToken(blob, `${actor.id}-${recipeKey(norm)}.webp`), portrait);
  else throw new Error('A GM must be connected to save a token.');
  if (!quiet) ui.notifications.info(`${actor.name}: new token saved.`);
  return path;
}
/** A finished look for someone the game makes (hired hands, quick NPCs): a preset's clothes on a random person. */
export async function quickLook(seed, presetId = null, {npc = false} = {}) {
  const kit = await loadKit(), rand = seeded(seed);
  let r = randomRecipe(kit.catalogue, rand, {npc});
  const preset = kit.catalogue.presets.find(p => p.id === presetId);
  if (preset) r = applyPreset(r, preset, kit.catalogue);
  return r;
}
/** GM tool: give every character without a built token a random look (does not touch tokens already built). */
export async function randomiseMissing({type = 'character'} = {}) {
  if (!game.user.isGM) throw new Error('GM only.');
  const kit = await loadKit(); let done = 0;
  for (const a of game.actors.filter(x => x.type === type && !Object.keys(x.system?.identity?.tokenParts ?? {}).length)) {
    await saveToken(a, randomRecipe(kit.catalogue, seeded(a.id)), {quiet: true}); done++;
  }
  if (done) await card('TOKENS', `${done} new token${done === 1 ? '' : 's'}`, `<p>Random looks for ${done} character${done === 1 ? '' : 's'} without one. Open the Token Builder from any sheet to change them.</p>`, 'crew');
  return done;
}
export const tokenAPI = {load: loadKit, save: saveToken, recipeOf, quickLook, randomiseMissing, svg: (recipe, options) => loadKit().then(kit => svgFor(recipe, kit, options)), esc};
