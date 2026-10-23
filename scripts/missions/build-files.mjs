// THE SMOKE — the DM mission files (0.5.25). Turns the authored files in scripts/missions/files/*.mjs and the cast
// voices in scripts/missions/voices/*.mjs into a full GM page for every mission: the brief, read-aloud boxes,
// scene-by-scene running notes with checks, who's who, DM notes and the places, ahead of the campaign plan notes the
// page already had. London missions keep their pages (same IDs, so the Mission Board links still work); the graffiti
// commissions and radio wars get two new journals. Writes data/content.json, data/london-guides.json, the Guides
// LevelDB pack, data/guide-history.json and the mission data, so all of them agree.
// Usage (from the system folder, with the world closed): node scripts/missions/build-files.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {textHash} from '../../module/text-hash.mjs';
import {STATS} from '../../module/config.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), NS = 'the-smoke', EDITION = '0.5.25';   // the mission-file journals' edition (page text can change within it)
const CHECK_ONLY = process.argv.includes('--check');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const W = (f, d, pretty = 1) => fs.writeFileSync(path.join(ROOT, 'data', f), (pretty ? JSON.stringify(d, null, pretty) : JSON.stringify(d)) + (pretty ? '\n' : ''));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const para = s => String(s ?? '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).map(x => `<p>${x}</p>`).join('');
const hid = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const BAND = {easy: 'Easy', medium: 'Medium', hard: 'Hard', miracle: 'Long Shot', opposed: 'Opposed', teamwork: 'Teamwork'};
const statName = k => STATS[k]?.label ?? k;

/* ------------------------------------------------------------------ sources */
const content = J('content.json'), guides = J('london-guides.json'), history = J('guide-history.json');
const london = J('london-missions.json'), tagging = J('tagging-missions.json'), radio = J('radio-war-missions.json');
const venues = new Map(J('london-venues.json').maps.map(v => [v.code, v])), places = new Map(J('london-places.json').maps.map(p => [p.id, p]));
const cast = new Map(J('london-cast.json').cast.map(c => [c.key, c])), npcs = new Map(J('london-npcs.json').npcs.map(n => [n.key, n]));
const FILES = {};
const dir = path.join(ROOT, 'scripts/missions/files');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) Object.assign(FILES, (await import(pathToFileURL(path.join(dir, f)).href)).default);
const VOICES = {};
const vdir = path.join(ROOT, 'scripts/missions/voices');
for (const f of fs.readdirSync(vdir).filter(f => f.endsWith('.mjs')).sort()) Object.assign(VOICES, (await import(pathToFileURL(path.join(vdir, f)).href)).default);
const allMissions = [...london.missions, ...tagging.missions, ...radio.missions];
const keyOf = m => m.id;

/* ------------------------------------------------------------------ people */
/** Everyone the page profiles: the mission's cast, plus anyone the file adds. */
function peopleFor(m, f) {
  const keys = [...new Set([...(m.cast || []).map(c => c.key), ...(f.cast || []), ...Object.keys(f.people || {})])];
  return keys.map(k => {
    const c = cast.get(k), n = npcs.get(c?.existing || k) ?? npcs.get(k), v = VOICES[k] ?? VOICES[c?.existing] ?? null, extra = f.people?.[k] ?? {};
    const name = extra.name ?? c?.name ?? n?.name ?? k, role = extra.role ?? c?.role ?? n?.system?.role ?? '', img = extra.img ?? c?.img ?? n?.img ?? 'icons/svg/mystery-man.svg';
    const st = (c ?? n)?.system?.stats, best = st ? Object.entries(st).sort((a, b) => b[1].die - a[1].die).slice(0, 3).map(([s, d]) => `${statName(s)} d${d.die}`).join(' · ') : '';
    return {key: k, name, role, img, best, faction: c?.faction ?? null, look: extra.look ?? v?.[0] ?? '', manner: extra.manner ?? v?.[1] ?? '', wants: extra.wants ?? v?.[2] ?? '', line: extra.line ?? v?.[3] ?? '', here: extra.here ?? f.roles?.[k] ?? ''};
  });
}
/** A place: venue rooms, or the special places (the flat, The Arches). */
function placeOf(stop) {
  const v = venues.get(stop.code), p = !v && places.get(stop.mapId);
  const src = v ?? p ?? null;
  const rooms = (src?.zones || []).filter(z => ['room', 'yard', 'hall'].includes(z.kind) || z.code).map(z => `${z.code ? `${z.code} ` : ''}${z.name}`).filter(Boolean);
  return {code: stop.code, name: v?.title ?? stop.name, district: v?.district ?? p?.district ?? '', rooms, contact: v?.contact ? `${v.contact}${v.contactRole ? ` (${v.contactRole})` : ''}` : ''};
}

/* ------------------------------------------------------------------ the DM file */
const readAloud = (title, text) => text ? `<aside class="sj-read-aloud"><b>${esc(title || 'Read aloud')}</b>${para(text)}</aside>` : '';
function checksTable(checks) {
  if (!checks?.length) return '';
  const rows = checks.map(([stats, band, what, pass, fail]) => {
    const s = String(stats).split('|').map(statName).join(' or ');
    return `<tr><td>${esc(what)}</td><td class="sj-roll"><b>${esc(s)}</b><br><small>${esc(BAND[band] ?? band)}</small></td><td>${esc(pass)}</td><td>${esc(fail)}</td></tr>`;
  }).join('');
  return `<div class="sj-table-scroll" tabindex="0" role="region" aria-label="Checks for this scene"><table class="sj-table sj-checks"><thead><tr><th scope="col">When</th><th scope="col">Roll</th><th scope="col">Pass</th><th scope="col">Fail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function automationNotes(m) {
  const out = [];
  const auto = (m.objectives || []).filter(o => o.auto);
  if (auto.length) out.push(`<b>Ticks itself:</b> ${auto.map(o => esc(o.text)).join('; ')}. Everything else is yours (or the players' in Self-play) to tick on the Mission Board.`);
  for (const p of m.props || []) out.push(`<b>Mission property:</b> ${esc(p.name)} ×${p.quantity ?? 1} is a real token on the map${p.pickupZone ? ` (pick-up ${esc(p.pickupZone)})` : ''}${p.deliveryZone ? `, delivered at ${esc(p.deliveryZone)}` : ''}. Players target it and Collect; drop it and it stays where it fell.${p.requiresVehicle ? ' It needs a motor to move.' : ''}`);
  if (m.tagging) out.push('<b>Painting:</b> the sites are placed when the commission starts or the crew arrive; paint with Tag Studio (Alt+G). Only a painted mark at the quality the job asks, with the tag it asks for, by someone on the job, counts; the spray card says why when one doesn\'t.');
  if ((m.stops || []).length) out.push('<b>Sat nav:</b> Directions on the Mission Board (and the Blower) follows the next unfinished step, wherever the crew are.');
  return out;
}
export function dmFile(m, f) {
  const people = peopleFor(m, f), stops = (m.stops || []).map(placeOf);
  const scenes = (f.scenes || []).map((s, i) => `<div class="sj-scene"><h3>${s.at ? `<span class="sj-room">${esc(s.at)}</span> ` : ''}${esc(s.title || `Scene ${i + 1}`)}</h3>${readAloud(s.readTitle || 'Read aloud', s.read)}${para(s.text)}${checksTable(s.checks)}${s.tip ? `<aside class="sj-box tip"><b>If they…</b>${para(s.tip)}</aside>` : ''}</div>`).join('');
  const castCards = people.length ? `<div class="sj-cast">${people.map(p => `<article class="sj-person"><img src="${esc(p.img)}" alt=""><div><h4>${esc(p.name)}</h4><p class="sj-small">${esc(p.role)}${p.best ? ` · ${esc(p.best)}` : ''}</p>${p.here ? `<p><b>In this job:</b> ${esc(p.here)}</p>` : ''}${p.look ? `<p><b>Look:</b> ${esc(p.look)}</p>` : ''}${p.manner ? `<p><b>Manner:</b> ${esc(p.manner)}</p>` : ''}${p.wants ? `<p><b>Wants:</b> ${esc(p.wants)}</p>` : ''}${p.line ? `<p class="sj-voice">“${esc(p.line)}”</p>` : ''}</div></article>`).join('')}</div>` : '';
  const notes = [...(f.notes || []).map(esc), ...automationNotes(m)];
  const placeRows = stops.filter(p => p.name).map(p => [esc(p.code || ''), `<b>${esc(p.name)}</b>${p.district ? `<br><small>${esc(p.district)}</small>` : ''}`, esc(p.rooms.slice(0, 7).join(' · ')), esc(p.contact)]);
  const placesTable = placeRows.length ? `<div class="sj-table-scroll" tabindex="0" role="region" aria-label="Places in this job"><table class="sj-table sj-places-table"><thead><tr><th scope="col">Code</th><th scope="col">Place</th><th scope="col">Rooms</th><th scope="col">Who runs it</th></tr></thead><tbody>${placeRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : (f.places ? para(f.places) : '');
  return `<section class="sj-dm-file" data-dm-file="${esc(keyOf(m))}">` +
    `<div class="sj-brief"><span class="sj-kicker">MISSION BRIEF · FOR THE GM</span>${para(f.brief)}</div>` +
    readAloud(f.openTitle || 'Read aloud: the opening', f.open) +
    (scenes ? `<h2>Running it</h2>${scenes}` : '') +
    readAloud(f.closeTitle || 'Read aloud: when it lands', f.close) +
    (castCards ? `<h2>Who's who</h2>${castCards}` : '') +
    `<h2>DM notes</h2><ul class="sj-dm-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` +
    (placesTable ? `<h2>The places</h2>${placesTable}` : '') +
    `</section>`;
}

/* ------------------------------------------------------------------ pages */
const PLAN_MARK = '<h2 class="sj-plan">From the campaign plan</h2>';
function splitPage(html) {
  const m = /^([\s\S]*?<div class="sj-page-body">)([\s\S]*)(<\/div><footer class="sj-footer">[\s\S]*)$/.exec(html);
  if (!m) throw new Error('Unexpected page structure');
  let body = m[2].replace(/<section class="sj-dm-file"[\s\S]*?<\/section>(?=<h2 class="sj-plan">)/, '').replace(PLAN_MARK, '');
  const cut = body.indexOf('</section>', body.indexOf('sj-live-rules'));
  const head = cut >= 0 ? body.slice(0, cut + 10) : (body.match(/^<header[\s\S]*?<\/header>/)?.[0] ?? '');
  const rest = body.slice(head.length);
  return {pre: m[1], head, rest, post: m[3]};
}
const restamp = html => html.replace(/data-smoke-edition="[^"]*"/, `data-smoke-edition="${EDITION}"`).replace(/(GM FILE|CREW COPY) · v[\d.]+/, `$1 · v${EDITION}`).replace(/RULES [\d.]+<\/span><\/footer>/, `RULES ${EDITION}</span></footer>`);

/* ------------------------------------------------------------------ new journals for the commissions and radio wars */
const NEW_JOURNALS = [
  {key: 'tagging-files', name: 'Street Commissions — Mission Files', group: 'tagging', missions: tagging.missions, colour: 'pink',
   intro: ['<p>Forty-two graffiti commissions, from a first can on Pat\'s wall to the big multi-site productions for the factions. Each page is a full GM file: the brief, read-aloud boxes, the sites in order with the checks around the painting (getting there, getting up, keeping watch, getting away), who\'s involved and DM notes.</p>',
     '<p><b>How painting works:</b> Tag Studio (Alt+G) rolls Graft and places a real decal. A commission counts a mark only at the quality it asks for, with the tag it asks for, by someone on the job. The spray card always says why a paint did not count. Paint over a rough one with another charge.</p>',
     '<p><b>Heat:</b> painting where you are seen is witnessed graffiti (1★ at most). Legal walls and owner-approved sites are marked on each page.</p>',
     '<p><b>Styles and presets:</b> as well as the classic tags, the Tag Studio paints sixteen piece styles: street and marker tags, throw-ups, bubbles, old skool block, blockbusters, deep 3D, new skool, burners, wildstyle, semi-wild, spikes, stencils, drips, fat cap and straight letters. Each has fills, outlines, clouds, 3D, arrows and drips, and the painter can stand one of twenty-three characters beside it. The <b>Presets</b> gallery has ready-made pieces for every faction, in its colours and with its own character: the cog, the boombox, the staffy, the masks, the canal duck, the cat burglar, the ace, the lantern, the teapot, the night owl, the fat cat and the spider. A faction preset picks that faction\'s tag only if the painter has unlocked it. The Graft roll still decides the finish: a Proper Mess runs and goes patchy, while Smashed It and Legendary earn the shine, the glow and the crown.</p>']},
  {key: 'radio-files', name: 'Radio Wars — Mission Files', group: 'radio', missions: radio.missions, colour: 'cy',
   intro: ['<p>Twelve radio-war jobs: two for each station on the dial, a fight over who gets heard on the streets of East London. Each page is a full GM file: the brief, read-aloud boxes, the scenes with their checks, who\'s who and DM notes.</p>',
     '<p><b>Fiction, not fact:</b> the station names are real broadcasters, used only so the in-game radio can play their live public streams. Every contact, crew, rivalry, address and event in these jobs is invented for the game. Nothing here says or suggests that any real station or anyone who works for one does anything illegal.</p>',
     '<p><b>How it plays:</b> start the job on the Mission Board. On the map, stand within two squares of the station\'s radio-war contact (on foot), right-click it and choose <b>Work this radio contact</b>. Pick the job, then <b>Put the word about</b> (Front, medium) or <b>Defend the airwaves</b> (Savvy, hard), as the job asks, and roll. A success ticks the objective; each character can work a contact once per Banana Watch day. <b>Fix the relay</b> (Graft, medium) is there for street hustle between jobs. The GM runs the people.</p>']}
];
const indexLink = (() => {
  const j = content.journals.find(x => x.flags?.[NS]?.contentKey === 'rules-reference'), p = j?.pages.find(x => x.name === 'Guide Index');
  return j && p ? `@UUID[Compendium.${NS}.guides.JournalEntry.${j._id}.JournalEntryPage.${p._id}]{Rules index}` : '';
})();
function wrap(journal, i, total, body, pageIds, pageNames) {
  const nav = [];
  if (i) nav.push(`@UUID[Compendium.${NS}.guides.JournalEntry.${journal._id}.JournalEntryPage.${pageIds[i - 1]}]{← Previous}`);
  if (indexLink) nav.push(indexLink);
  if (i < total - 1) nav.push(`@UUID[Compendium.${NS}.guides.JournalEntry.${journal._id}.JournalEntryPage.${pageIds[i + 1]}]{Next →}`);
  return `<article class="smoke-journal sj-console" data-smoke-edition="${EDITION}"><div class="sj-status"><span>THE SMOKE / FIELD GUIDE</span><span>GM FILE · v${EDITION}</span></div><nav class="sj-nav" aria-label="Journal navigation">${nav.join('<span aria-hidden="true"> / </span>')}</nav><div class="sj-page-body">${body}</div><footer class="sj-footer"><span>${esc(journal.name)}</span><span>${i + 1} / ${total} · RULES ${EDITION}</span></footer></article>`;
}
function missionHeader(m, kicker) {
  return `<header class="sj-mission"><img src="${esc(m.img || 'icons/svg/book.svg')}" alt=""><div><span class="sj-kicker">${esc(kicker)}</span><h1>${esc(m.title)}</h1><p>${esc(m.where || '')}</p></div></header>`;
}
function boardRules(m) {
  const r = m.rewards || {}, rows = [];
  if (r.fee) rows.push(['Crew fee', `£${r.fee} shared; each registered PC gets floor(£${r.fee} ÷ crew count).`]);
  if (r.cash) rows.push(['Per-head cash', `£${r.cash} to each registered PC.`]);
  rows.push(['XP', `${r.xp || 0} to each registered PC.`]);
  for (const [k, v] of Object.entries(r.rep || {})) rows.push(['Personal standing', `${k}: +${v} for each registered PC.`]);
  for (const [k, v] of Object.entries(r.renown || {})) rows.push(['Crew Renown', `${k}: +${v}.`]);
  if (r.influence) rows.push(['Influence', `Restore ${r.influence} with the paying faction, capped by rank.`]);
  const t = (head, list) => `<div class="sj-table-scroll" tabindex="0" role="region" aria-label="Scrollable reference table"><table class="sj-table"><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${list.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<section class="sj-live-rules"><span class="sj-kicker">MISSION BOARD · ${esc(m.code || m.id)}</span><p><b>Offer:</b> Rep ${m.minRep || 1}${(m.requires || []).length ? ` · after ${m.requires.map(esc).join(', ')}` : ''}.</p>${t(['Objective', 'Tracked by'], m.objectives.map(o => [esc(o.text), o.auto ? `Automatic ${esc(o.auto.on)} event${o.auto.count ? ` × ${o.auto.count}` : ''}` : 'GM / Self-play tick']))}${t(['Reward', 'Current payout'], rows.map(([a, b]) => [esc(a), esc(b)]))}</section>`;
}
/** The live checkpoints, from data/mission-automation.json (0.5.27: generated, so the places always match the data). */
const AUTOMATION = J('mission-automation.json').missions;
const HOW = {boarded: 'Get in a vehicle (a shared one counts for everyone in it)', vehicleNicked: 'Nick it', sold: 'Sell it', service: 'Have the work done',
  vehicleReturned: 'Bring it back', vehicleRetained: 'Keep it', heatClear: 'Lose the Heat', safeExit: 'Get away with three stars or less', safeCargoReturn: 'Get back with it',
  crewHome: 'Everyone home', encounterResolved: 'Win the fight', escortArrived: 'Get them there', cargoCollected: 'Collect the item', cargoDelivered: 'Deliver the item',
  tagPlaced: 'Paint it (Tag Studio)', radioWar: 'Work the radio contact', race: 'Win the race', map: 'Get there'};
const COUNT = {crew: 'One per player on the job', crewMin2: 'One per player, at least two', halfCrew: 'Half the crew, rounded up'};
function contractSection(m) {
  const auto = AUTOMATION[m.id]; if (!auto) return '';
  const how = (o, s) => s.mode === 'roll' ? `Roll at the marker: ${esc(statName(s.stat))}, ${esc(BAND[s.band] ?? s.band)}` : s.mode === 'dialogue' ? 'Talk it through at the marker' : s.mode === 'choice' ? 'Make the call at the marker'
    : s.mode === 'arrival' ? 'Get there' : esc(HOW[o.auto?.on ?? s.event] ?? 'The world event');
  const rows = m.objectives.map(o => { const s = auto.steps[o.id]; if (!s) return ''; return `<tr><td>${esc(o.text)}</td><td>${how(o, s)}</td><td>${s.locations.map(a => esc(a.name)).join('<br>or ')}</td><td>${esc(COUNT[s.scale] ?? String(o.auto?.count ?? 1))}</td></tr>`; }).join('');
  return `<section class="sj-runtime-contract"><h2>Live mission contract</h2><p>The Mission Board ticks these itself, from what the crew actually do at the places below; a check rolled somewhere else doesn't count. The sat nav takes the crew to the next one, finishing what's at the place they're in first. Every character on the job needs at least one step or support task of their own before it pays. If something won't tick, a player on the job can mark a ready step done in Self-play, and the GM can mark any step done, reopen it, or pass the job.</p><div class="sj-table-scroll" tabindex="0" role="region" aria-label="Live checkpoints"><table class="sj-table"><thead><tr><th scope="col">Checkpoint</th><th scope="col">How it ticks</th><th scope="col">Where</th><th scope="col">How many</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
const CONTRACT_RE = /<section class="sj-runtime-contract">[\s\S]*?<\/section>/g;
function planNotes(m) {
  const bits = [];
  if (m.hook) bits.push(`<p class="sj-lead">${esc(m.hook)}</p>`);
  if (m.gm) bits.push(`<aside class="sj-box rule"><b>GM notes from the commission</b>${/<p>/.test(m.gm) ? m.gm : para(esc(m.gm))}</aside>`);
  if (m.twist) bits.push(`<aside class="sj-box warn"><b>The twist</b><p>${esc(m.twist)}</p></aside>`);
  if (m.playGuide?.length) bits.push(`<h3>How the players run it</h3><ol class="sj-steps">${m.playGuide.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`);
  if (m.next) bits.push(`<p class="sj-next"><b>Next:</b> ${esc(m.next)}</p>`);
  return bits.join('');
}

/* ------------------------------------------------------------------ build */
const problems = [], stats = {};
const countChecks = f => { for (const s of f.scenes || []) for (const c of s.checks || []) for (const k of String(c[0]).split('|')) stats[k] = (stats[k] || 0) + 1; };
const pagesById = new Map(content.journals.flatMap(j => j.pages.map(p => [p._id, {j, p}])));
const touchedJournals = new Set();
for (const m of london.missions) {
  const f = FILES[m.id]; if (!f) { problems.push(`no file: ${m.id}`); continue; }
  countChecks(f);
  const hit = pagesById.get(String(m.pageUuid || '').split('.').at(-1)); if (!hit) { problems.push(`no page: ${m.id}`); continue; }
  const {j, p} = hit, old = p.text.content, parts = splitPage(old);
  const html = restamp(parts.pre + parts.head + dmFile(m, f) + PLAN_MARK + parts.rest.replace(CONTRACT_RE, '') + contractSection(m) + parts.post);
  if (html !== old) {
    const hk = `${j.flags[NS].contentKey}|${p.name}`;
    history[hk] = [...new Set([...(history[hk] || []), textHash(old)])];
    p.text.content = html; touchedJournals.add(j);
  }
}
for (const spec of NEW_JOURNALS) {
  const jid = hid(`smoke-journal-${spec.key}`);
  let j = content.journals.find(x => x.flags?.[NS]?.contentKey === spec.key);
  if (!j) { j = {_id: jid, name: spec.name, pages: [], folder: null, sort: (content.journals.length + 1) * 1000, ownership: {default: 0}, flags: {[NS]: {contentKey: spec.key, guideEdition: EDITION}}}; content.journals.push(j); }
  const list = [...spec.missions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.code).localeCompare(String(b.code)));
  const pageIds = ['intro', ...list.map(m => m.id)].map(k => hid(`smoke-page-${spec.key}-${k}`)), names = ['How these jobs work', ...list.map(m => `${m.code} · ${m.title}`)];
  const pages = [];
  pages.push({_id: pageIds[0], name: names[0], body: `<header class="sj-cover ${spec.colour}"><div><span class="sj-kicker">${esc(spec.name)}</span><h1>How these jobs work</h1><p>GM FILE · TABLE NOTES</p></div></header>${spec.intro.join('')}<h2>The jobs</h2><ol>${list.map((m, i) => `<li>@UUID[Compendium.${NS}.guides.JournalEntry.${j._id}.JournalEntryPage.${pageIds[i + 1]}]{${esc(m.code)} · ${esc(m.title)}}</li>`).join('')}</ol>`});
  for (const [i, m] of list.entries()) {
    const f = FILES[m.id]; if (!f) { problems.push(`no file: ${m.id}`); continue; }
    countChecks(f);
    pages.push({_id: pageIds[i + 1], name: names[i + 1], body: missionHeader(m, `${spec.group === 'tagging' ? 'STREET COMMISSION' : 'RADIO WARS'} · ${m.code} · ${m.giver || ''}`) + boardRules(m) + dmFile(m, f) + PLAN_MARK + planNotes(m) + contractSection(m)});
    Object.assign(m, {page: names[i + 1], journalKey: spec.key, pageUuid: `Compendium.${NS}.guides.JournalEntry.${j._id}.JournalEntryPage.${pageIds[i + 1]}`});
  }
  j.pages = pages.map((pg, i) => {
    const prev = j.pages.find?.(x => x._id === pg._id);
    const text = wrap(j, i, pages.length, pg.body, pages.map(x => x._id), names);
    if (prev && prev.text?.content !== text) { const hk = `${spec.key}|${pg.name}`; history[hk] = [...new Set([...(history[hk] || []), textHash(prev.text.content)])]; }
    return {_id: pg._id, name: pg.name, type: 'text', title: {show: true, level: 1}, text: {format: 1, content: text}, sort: (i + 1) * 1000, ownership: {default: -1}, flags: {[NS]: {}}};
  });
  touchedJournals.add(j);
}
for (const j of touchedJournals) {
  j.flags[NS].guideEdition = EDITION;
  for (const p of j.pages) p.flags[NS] = {...p.flags[NS], textHash: textHash(p.text.content), guideEdition: EDITION, sourcePageId: p._id, sourceName: p.name};
}
const total = Object.values(stats).reduce((a, b) => a + b, 0);
console.log('checks by stat:', Object.fromEntries(Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v} (${(100 * v / Math.max(1, total)).toFixed(1)}%)`])), 'total', total);
if (problems.length) console.log(`${problems.length} problem(s):`, problems.slice(0, 20).join('; '));
const PREVIEW = process.argv.indexOf('--preview');
if (PREVIEW > 0) {   // write one finished page (or several, comma-separated) to a file to look at, and stop
  const ids = String(process.argv[PREVIEW + 1] || '').split(','), out = process.argv[PREVIEW + 2] || 'preview.html';
  const pages = ids.map(id => { const m = allMissions.find(x => x.id === id); return m && (m.group === 'tagging' || m.group === 'radio') ? content.journals.flatMap(j => j.pages).find(p => p.name === m.page)?.text.content : pagesById.get(String(m?.pageUuid || '').split('.').at(-1))?.p.text.content; }).filter(Boolean);
  fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${ROOT}styles/the-smoke.css"><style>body{background:#0a0d10;color:#ece4cf;font-family:sans-serif;max-width:900px;margin:auto}</style>${pages.join('<hr>')}`);
  console.log('preview', out); process.exit(0);
}
if (CHECK_ONLY) process.exit(problems.length ? 1 : 0);

/* ------------------------------------------------------------------ write */
// The journal source keeps its own content edition (module/content.mjs VERSION), never the system version.
content.version = fs.readFileSync(path.join(ROOT, 'module/content.mjs'), 'utf8').match(/export const VERSION = '([^']+)'/)[1];
W('content.json', content, 0);
W('guide-history.json', history, 2);
guides.journals = content.journals.map(j => ({...(guides.journals.find(s => s.key === j.flags[NS].contentKey) || (j.ownership?.default ? {} : {gmOnly: true})), key: j.flags[NS].contentKey, name: j.name, pages: j.pages.map(p => ({name: p.name, html: p.text.content, wrapped: true}))}));
guides.version = EDITION; W('london-guides.json', guides, 2);
W('tagging-missions.json', tagging, 1); W('radio-war-missions.json', radio, 1);
// the Guides pack: the same documents
const req = createRequire(import.meta.url);
let ClassicLevel;
for (const p of [path.join(ROOT, 'scripts/journals/node_modules/classic-level'), '/home/claude/build/node_modules/classic-level', 'classic-level']) { try { ({ClassicLevel} = req(p)); break; } catch (_e) {} }
if (!ClassicLevel) throw new Error('classic-level is needed to write the Guides pack: npm ci --prefix scripts/journals');
const pack = path.join(ROOT, 'packs/guides'), db = new ClassicLevel(pack, {valueEncoding: 'json'}); await db.open();
const releaseTime = Date.parse('2026-10-21T12:00:00Z');
const stamp = old => ({...old?._stats, createdTime: old?._stats?.createdTime ?? releaseTime, coreVersion: old?._stats?.coreVersion || '14.359', systemId: NS, systemVersion: EDITION, modifiedTime: releaseTime, lastModifiedBy: null});
for (const j of touchedJournals) {
  const rootKey = `!journal!${j._id}`; let old = null; try { old = await db.get(rootKey); } catch (_e) {}
  await db.put(rootKey, {...j, pages: j.pages.map(p => p._id), folder: null, _stats: stamp(old)});
  for (const p of j.pages) { const k = `!journal.pages!${j._id}.${p._id}`; let o = null; try { o = await db.get(k); } catch (_e) {} await db.put(k, {...p, _stats: stamp(o)}); }
}
await db.compactRange('', '￿'); await db.close();
for (const f of fs.readdirSync(pack)) if (f === 'LOCK' || f.startsWith('LOG')) fs.rmSync(path.join(pack, f));
console.log(`mission files: ${Object.keys(FILES).length} written into ${touchedJournals.size} journals`);
