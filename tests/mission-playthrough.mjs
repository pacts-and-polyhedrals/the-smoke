// Play every mission through, the way a crew would, on the real mission data and handlers (0.5.27).
// For each open checkpoint: ask the sat nav where to go, put the crew exactly there, and do the thing the objective
// asks — walk in, work the marker, roll, choose, board (everyone in one car), nick the target, drive it back, sell it,
// respray it, carry the cargo, paint the wall, work the radio contact. The checkpoint must tick from that alone; then
// every crew member's contribution, then Mission Passed. Anything that doesn't is a problem, and the GM's Recover is
// used to carry on so the later steps are still checked.
// Usage: node tests/mission-playthrough.mjs [sizes=1,2,4] [mission ids…]
import {makeWorld, collection} from './world-fixture.mjs';
import {J} from './fakes.mjs';

export async function setup({beforeInstall = null} = {}) {
  const w = await makeWorld({players: 4});
  const NS = 'the-smoke';
  // decals and uploads for graffiti
  for (const s of w.scenes) {
    s.tiles = collection();
    const create = s.createEmbeddedDocuments.bind(s), update = s.updateEmbeddedDocuments.bind(s), del = s.deleteEmbeddedDocuments.bind(s);
    s.createEmbeddedDocuments = async (type, data, o = {}) => type !== 'Tile' ? create(type, data, o) : data.map(d => { const t = {...JSON.parse(JSON.stringify(d)), id: `tile${Math.random().toString(36).slice(2, 10)}`, parent: s, getFlag(ns, k) { return this.flags?.[ns]?.[k]; }, async update(ch) { Object.assign(this, ch); return this; }}; s.tiles.push(t); return t; });
    s.updateEmbeddedDocuments = async (type, ups, o = {}) => type !== 'Tile' ? update(type, ups, o) : ups.map(u => Object.assign(s.tiles.get(u._id) || {}, u));
    s.deleteEmbeddedDocuments = async (type, ids, o = {}) => { if (type !== 'Tile') return del(type, ids, o); for (const id of ids) { const i = s.tiles.findIndex(t => t.id === id); if (i >= 0) s.tiles.splice(i, 1); } };
  }
  globalThis.File = class { constructor(parts, name) { this.name = name; this.body = parts.join(''); } text() { return Promise.resolve(this.body); } };
  foundry.applications.apps = {...(foundry.applications.apps || {}), FilePicker: {uploadPersistent: async (ns, dir, file) => ({path: `uploads/${file.name}`})}};
  const M = await import('../module/world/missions.mjs'), A = await import('../module/world/mission-automation.mjs'), C = await import('../module/rules/mission-contract.mjs');
  const S = await import('../module/map/satnav.mjs'), G = await import('../module/graffiti/runtime.mjs'), R = await import('../module/radio/war.mjs');
  const net = await import('../module/world/net.mjs'), spawn = await import('../module/world/spawn.mjs'), boarding = await import('../module/vehicles/vehicle-boarding.mjs');
  await import('../module/world/theft.mjs'); await import('../module/world/mission-props.mjs'); await import('../module/world/mission-race.mjs');
  M.registerMissionSettings(); S.registerSatnavSettings(); G.registerGraffitiSettings(); R.registerRadioWarSettings();
  if (beforeInstall) await beforeInstall(w);   // e.g. a run saved by an older build, to see how loading the world treats it
  G.installGraffiti(); await A.installMissionAutomation();
  for (const pc of w.pcs) await pc.createEmbeddedDocuments('Item', [{name: 'Spray Paint', type: 'gear', system: {quantity: 999}}]);
  const d = await S.satnavData();
  return {w, NS, M, A, C, S, G, R, net, spawn, boarding, d};
}

const sceneOf = (ctx, mapId) => ctx.w.scenes.find(s => s.getFlag(ctx.NS, 'place')?.id === mapId || s.getFlag(ctx.NS, 'streetAtlas')?.id === mapId);
const tokOf = (ctx, actor) => { for (const s of ctx.w.scenes) { const t = s.tokens.find(t => t.actorId === actor.id && !t.getFlag(ctx.NS, 'vehicleSeat')); if (t) return t; } for (const s of ctx.w.scenes) { const t = s.tokens.find(t => t.actorId === actor.id); if (t) return t; } return null; };
const allTokens = ctx => ctx.w.scenes.flatMap(s => [...s.tokens]);
const userOf = (ctx, actor) => `user${ctx.w.pcs.indexOf(actor) + 1}`;
const centre = (t, g = 100) => [t.x + t.width * g / 2, t.y + t.height * g / 2];

/** Move a token (and anyone riding it) to another place, keeping its flags: the crew drove it there. */
async function carry(ctx, t, mapId, [x, y]) {
  const NS = ctx.NS, scene = sceneOf(ctx, mapId); if (!scene) throw new Error(`no scene ${mapId}`);
  const g = scene.grid.size || 100, data = t.toObject(), riders = [...t.parent.tokens].filter(r => r.getFlag(NS, 'vehicleSeat')?.vehicleTokenId === t.id);
  if (t.parent === scene) { await t.update({x: x - t.width * g / 2, y: y - t.height * g / 2}); for (const r of riders) await r.update({x: x - g / 2, y: y - g / 2}); return t; }
  const [nt] = await scene.createEmbeddedDocuments('Token', [{...data, x: x - t.width * g / 2, y: y - t.height * g / 2}], {acTransit: true});
  for (const r of riders) { const rd = r.toObject(); const [nr] = await scene.createEmbeddedDocuments('Token', [{...rd, x: x - g / 2, y: y - g / 2, flags: {...rd.flags, [NS]: {...rd.flags?.[NS], vehicleSeat: {...rd.flags[NS].vehicleSeat, vehicleTokenId: nt.id}}}}], {acTransit: true}); }
  const occ = (t.getFlag(NS, 'vehicleOccupants') || []).map(o => ({...o, tokenId: scene.tokens.find(r => r.actorId === o.actorId)?.id ?? o.tokenId}));
  if (occ.length) await nt.update({[`flags.${NS}.vehicleOccupants`]: occ});
  await t.parent.deleteEmbeddedDocuments('Token', [t.id, ...riders.map(r => r.id)], {acTransit: true});
  return nt;
}
async function putCrew(ctx, crew, target, spread = true) {
  const out = [];
  for (const [i, pc] of crew.entries()) out.push(await ctx.w.put(pc, target.mapId, [target.x + (spread ? (i % 2) * 40 : 0), target.y + (spread ? Math.floor(i / 2) * 40 : 0)]));
  return out;
}
async function rollAction(ctx, m, stepId, pc, {choice = null} = {}) {
  const {net, A, w} = ctx, t = tokOf(ctx, pc), userId = userOf(ctx, pc);
  let r = await net.dispatch('mission.action.begin', {missionId: m.id, stepId, actorId: pc.id, sceneId: t.parent.id, choice, userId});
  if (r.kind === 'choices') {
    const pick = r.choices.find(c => !c.encounter && !c.stat) ?? r.choices.find(c => !c.encounter) ?? r.choices[0];
    r = await net.dispatch('mission.action.begin', {missionId: m.id, stepId, actorId: pc.id, sceneId: t.parent.id, choice: pick.id ?? pick.value, userId});
    if (pick.encounter) { // pick a fight, then win it
      const s = ctx.M.missionState()[m.id]; for (const e of A.resourcesFor(m, s, `choice-${stepId}`)) await e.actor.update({'system.states.down': true});
      await A.sweepMission(m);
    }
  }
  if (r.kind === 'roll') {
    await A.validateMissionRoll(pc, r.stat, {band: r.band, context: r.context}, userId);
    const msg = await ChatMessage.implementation.create({flags: {'the-smoke': {roll: {actorUuid: pc.uuid, stat: r.stat, band: r.band, success: true, outcomeKey: 'fullSuccess', userId, context: r.context}}}});
    await A.commitMissionRoll(r.context, msg.id);
    r = await net.dispatch('mission.action.resolve', {missionId: m.id, attemptId: r.attemptId, userId});
  }
  return r;
}
async function nick(ctx, pc, vt) {
  // a moving target is carjacked: its driver is dragged out first (theft.carjack does the same)
  if ((vt.getFlag(ctx.NS, 'vehicleOccupants') || []).length) await ctx.boarding.exitAllFromVehicle(vt, {keepDriver: false});
  vt = vt.parent.tokens.get(vt.id) ?? vt;
  const NS = ctx.NS, me = await ctx.w.put(pc, ctx.spawn.mapIdOf(vt.parent), centre(vt, vt.parent.grid.size).map((v, i) => v + (i ? 0 : (vt.width + 1) * 100)));
  await vt.update({[`flags.${NS}.locked`]: false, [`flags.${NS}.stolen`]: true, [`flags.${NS}.thief`]: pc.id, [`flags.${NS}.parked`]: false, [`flags.${NS}.traffic`]: null});
  Hooks.callAll('smokeVehicleNicked', {vt, who: me, unlocked: true});
  await new Promise(r => setTimeout(r, 0));
  return me;
}
async function ride(ctx, pcs, vt) {
  for (const [i, pc] of pcs.entries()) {
    let me = tokOf(ctx, pc);
    if (!me || me.parent !== vt.parent) me = await ctx.w.put(pc, ctx.spawn.mapIdOf(vt.parent), centre(vt, vt.parent.grid.size));
    const seats = (await import('../module/vehicles/vehicle-seat-math.mjs')).seatLayout(vt.actor);
    const seat = seats[i]?.id ?? 'pilot';
    await ctx.boarding.boardVehicle(vt, me, seat);
  }
}

/** Rush hour: park cars over every block the job wants to put something in (the street the van waits on, Pat's yard,
 *  the marker spots), so preparing the job has to find room elsewhere. Moving traffic would drive off; parked cars don't. */
async function crowd(ctx, m) {
  const car = await ctx.spawn.ensureVehicleActor('LV14'), seen = new Set();
  const anchors = [...m.automation.resources.map(r => r.location), ...Object.values(m.automation.steps).flatMap(c => c.locations)];
  for (const a of anchors) {
    const key = `${a.mapId}|${a.zoneId}`; if (seen.has(key)) continue; seen.add(key);
    const scene = sceneOf(ctx, a.mapId); if (!scene) continue;
    const [x, y, w, h] = a.rect, g = scene.grid.size || 100, data = [];
    for (let py = y; py + 3 * g <= y + h + 1; py += 3 * g) for (let px = x; px + 2 * g <= x + w + 1; px += 2 * g) data.push({...(await car.getTokenDocument()).toObject(), x: px, y: py, width: 2, height: 3, flags: {'the-smoke': {parked: true}}});
    if (!data.length) data.push({...(await car.getTokenDocument()).toObject(), x, y, width: Math.max(1, Math.round(w / g)), height: Math.max(1, Math.round(h / g)), flags: {'the-smoke': {parked: true}}});
    await scene.createEmbeddedDocuments('Token', data);
  }
}
export const helpers = {sceneOf, tokOf, putCrew, rollAction, nick, ride, carry, userOf};
/** Play one mission with `size` crew. Returns {passed, problems}. */
export async function play(ctx, m, size, {crowded = false} = {}) {
  const {w, NS, M, A, C, S, net, d} = ctx, problems = [], note = msg => problems.push(`${m.code || m.id} ×${size} ${msg}`);
  for (const s of w.scenes) { s.tokens.splice(0); s.tiles?.splice?.(0); if (s.flags?.[NS]) { delete s.flags[NS].graffitiRecords; } }
  w.settings.set('missions', {}); w.settings.set('radioWarState', {}); w.settings.set('graffitiTerritory', {});
  const crew = w.pcs.slice(0, size);
  for (const [i, pc] of crew.entries()) { pc.system.heat = {value: 0}; pc.system.cash = 2000; await w.put(pc, 'LDN-HACKNEY', [1500 + i * 60, 1500]); }
  if (crowded) await crowd(ctx, m);
  try { await net.dispatch('mission.start', {id: m.id, actorIds: crew.map(a => a.id), userId: 'gm', overrideReason: 'simulated play-through'}); }
  catch (e) { note(`start: ${e.message}`); return {passed: false, problems}; }
  if (m.objectives.some(o => o.auto?.on === 'radioWar')) await ctx.R.syncRadioWarLocations().catch(e => note(`radio contacts: ${e.message}`));   // as the GM's ready does
  const state = () => M.missionState()[m.id];
  if (state()?.preflightError) note(`preparation: ${state().preflightError}`);
  let turn = 0, who = 0;
  const next = () => crew[(who++) % crew.length];
  for (let guard = 0; guard < 80; guard++) {
    let s = state(); if (!s || s.status === 'done') break;
    const o = S.stepOrder(m, s, crew[0])[0];   // the step the sat nav is on (what's here first, then the job's order)
    if (!o) {
      const missing = C.contributionMissing(s);
      if (!missing.length) { note('every checkpoint done but the mission did not pass'); break; }
      for (const id of missing) {
        const pc = w.actors.get(id), target = S.missionTarget(d, m, s, null, {actor: pc});
        const task = m.automation.support.find(x => !state().supportProof?.[x.id]);
        if (!task) { note(`no support task left for ${pc.name}`); break; }
        if (!target || !task.locations.some(a => a.mapId === target.mapId)) note(`support: sat nav → ${target?.label ?? 'nothing'} (${target?.mapId}), task is at ${task.locations[0].name}`);
        await putCrew(ctx, [pc], target ?? {mapId: task.locations[0].mapId, x: task.locations[0].x, y: task.locations[0].y});
        try { await rollAction(ctx, m, task.id, pc); } catch (e) { note(`support ${task.id}: ${e.message}`); await net.dispatch('mission.set', {id: m.id, status: 'failed', userId: 'gm'}); return {passed: false, problems}; }
      }
      continue;
    }
    const before = Number(s.ticks?.[o.id] || 0), need = C.checkpointNeeded(o, s), c = o.checkpoint, on = o.auto?.on;
    const target = S.missionTarget(d, m, s, null, {actor: crew[0]});
    const where = target ? `${target.label ?? ''} (${target.mapId})` : 'nothing';
    if (!target) note(`${o.id}: sat nav has no destination`);
    const inAnchor = target && c.locations.some(a => a.mapId === target.mapId && C.atAnchor({mapId: target.mapId, x: target.x, y: target.y, grid: 100, zoneIds: []}, {...a, marginSquares: Math.max(1, a.marginSquares || 0)}));
    const goal = target ?? {mapId: c.locations[0].mapId, x: c.locations[0].x, y: c.locations[0].y};
    let err = null;
    try {
      if (['roll', 'dialogue', 'choice'].includes(c.mode)) {
        if (!inAnchor) note(`${o.id} (${c.mode}): sat nav → ${where}, not at ${c.locations.map(a => a.name).join(' / ')}`);
        const pc = next(); await putCrew(ctx, [pc], inAnchor ? goal : {mapId: c.locations[0].mapId, x: c.locations[0].x, y: c.locations[0].y});
        await rollAction(ctx, m, o.id, pc);
      } else if (c.mode === 'arrival') {
        if (!inAnchor) note(`${o.id} (arrival): sat nav → ${where}, not at ${c.locations.map(a => a.name).join(' / ')}`);
        await putCrew(ctx, crew, goal);
      } else if (c.mode === 'race') {
        const bikes = A.resourcesFor(m, s, 'transport'); const bike = bikes[0];
        if (!bike) throw new Error('no race bike');
        await ride(ctx, [crew[0]], bike); await rollAction(ctx, m, o.id, crew[0]);
        const r = state().race; const vt = bike.parent.tokens.get(bike.id);
        for (const [x, y] of r.course.slice(1)) { await vt.update({x: x - 50, y: y - 100}); await new Promise(res => setTimeout(res, 15)); }
      } else if (on === 'boarded') {
        // everyone piles into one car (or the crew's mountain bikes when it's just one of you)
        const scene = sceneOf(ctx, goal.mapId), car = await ctx.spawn.ensureVehicleActor('LV16');
        const vt = await ctx.spawn.placeToken(scene, car, goal.x + 200, goal.y, {flags: {parked: true}});
        await ride(ctx, crew, vt);
      } else if (on === 'vehicleNicked') {
        const targets = A.resourcesFor(m, s, c.targetGroup).filter(t => !t.getFlag(NS, 'stolen'));
        if (!targets.length) throw new Error(`no ${c.targetGroup} to nick`);
        const t0 = targets[0];
        if (target && ctx.spawn.mapIdOf(t0.parent) !== target.mapId) note(`${o.id}: sat nav → ${where}, the target is on ${ctx.spawn.mapIdOf(t0.parent)}`);
        for (let i = 0; i < Math.min(targets.length, need - before); i++) await nick(ctx, crew[i % crew.length], targets[i]);
      } else if (['vehicleReturned', 'vehicleRetained', 'sold', 'service'].includes(on)) {
        let vs = A.resourcesFor(m, s, c.targetGroup).filter(t => on === 'vehicleRetained' || t.getFlag(NS, 'stolen'));
        if (!vs.length && on !== 'vehicleRetained') {   // nobody has nicked it yet: the sat nav should take you to it first
          const loose = A.resourcesFor(m, s, c.targetGroup).filter(t => !t.getFlag(NS, 'stolen'));
          if (!loose.length) throw new Error(`no ${c.targetGroup} to take`);
          if (target && ctx.spawn.mapIdOf(loose[0].parent) !== target.mapId) note(`${o.id} (${on}): nothing nicked yet; sat nav → ${where}, the target is on ${ctx.spawn.mapIdOf(loose[0].parent)}`);
          for (let i = 0; i < Math.min(loose.length, need - before); i++) await nick(ctx, crew[i % crew.length], loose[i]);
          vs = A.resourcesFor(m, state(), c.targetGroup).filter(t => t.getFlag(NS, 'stolen'));
        }
        if (!vs.length) throw new Error(`no ${c.targetGroup} in hand`);
        for (let i = 0; i < Math.min(vs.length, need - before); i++) {
          const pc = crew[i % crew.length]; let vt = vs[i];
          if (!vt.parent.tokens.some(r => r.actorId === pc.id && r.getFlag(NS, 'vehicleSeat')?.vehicleTokenId === vt.id)) await ride(ctx, [pc], vt);
          canvas.scene = vt.parent;
          const t2 = S.missionTarget(d, m, state(), null, {actor: pc});   // riding it now: where does the sat nav send you?
          const ok2 = t2 && c.locations.some(a => a.mapId === t2.mapId || (on === 'sold' && C.fenceOfAnchor?.(a) && t2.mapId === 'LDN-HACKNEY'));
          if (!ok2) note(`${o.id} (${on}): riding it, sat nav → ${t2?.label} (${t2?.mapId}), not ${c.locations.map(a => a.name).join(' / ')}`);
          const g2 = t2 && ok2 ? t2 : {mapId: c.locations[0].mapId, x: c.locations[0].x, y: c.locations[0].y};
          vt = await carry(ctx, vt, g2.mapId, [g2.x, g2.y]);
          if (on === 'sold') await net.dispatch('theft.sell', {sceneId: vt.parent.id, vehicleTokenId: vt.id, userId: userOf(ctx, pc)});
          if (on === 'service') Hooks.callAll('smokeService', {actor: pc, service: 'respray', targetToken: vt, actorToken: vt.parent.tokens.find(r => r.actorId === pc.id), proofId: `svc${Math.random()}`});
        }
      } else if (['heatClear', 'safeExit', 'safeCargoReturn', 'crewHome'].includes(on)) {
        if (!inAnchor) note(`${o.id} (${on}): sat nav → ${where}, not at ${c.locations.map(a => a.name).join(' / ')}`);
        for (const pc of crew) await pc.update({'system.heat.value': 0});
        await putCrew(ctx, crew, goal);
      } else if (on === 'encounterResolved') {
        if (!inAnchor) note(`${o.id} (${on}): sat nav → ${where}, not at ${c.locations.map(a => a.name).join(' / ')}`);
        await putCrew(ctx, crew, goal);
        for (const e of A.resourcesFor(m, s, c.targetGroup)) await e.actor.update({'system.states.down': true});
      } else if (on === 'escortArrived') {
        const e = A.resourcesFor(m, s, c.targetGroup)[0]; if (!e) throw new Error('nobody to escort');
        const me = await ctx.w.put(crew[0], ctx.spawn.mapIdOf(e.parent), centre(e).map((v, i) => v + (i ? 0 : 100)));
        await net.dispatch('mission.escort', {missionId: m.id, group: c.targetGroup, actorId: crew[0].id, userId: userOf(ctx, crew[0])});
        const moved = await carry(ctx, e, goal.mapId, [goal.x, goal.y]); await moved.setFlag(NS, 'missionEscort', {missionId: m.id, runId: s.runId, actorId: crew[0].id});
        await putCrew(ctx, crew, goal);
      } else if (on === 'cargoCollected' || on === 'cargoDelivered') {
        const units = (await import('../module/world/mission-props.mjs')).propUnits(m).filter(u => u.prop.id === o.auto.propId);
        for (let i = 0; i < units.length && Number(state().ticks?.[o.id] || 0) < need; i++) {
          const u = units[i], rec = state().parcels?.[u.serial] ?? {status: 'world'}, pc = crew[i % crew.length];
          const t = S.missionTarget(d, m, state(), null, {actor: crew[0]});   // the lead's sat nav (another crew member may be standing at a different job's step)
          if (on === 'cargoCollected') {
            if (rec.status !== 'world') continue;
            const scene = w.scenes.find(x => x.id === rec.sceneId), ground = scene?.tokens.get(rec.tokenId);
            if (!ground) throw new Error(`parcel ${u.serial} not on the map`);
            if (t && (t.mapId !== ctx.spawn.mapIdOf(scene) || Math.hypot(t.x - centre(ground)[0], t.y - centre(ground)[1]) > 150)) note(`${o.id}: sat nav → ${t.label} (${t.mapId}), the parcel is on ${ctx.spawn.mapIdOf(scene)}`);
            const me = await ctx.w.put(pc, ctx.spawn.mapIdOf(scene), centre(ground));
            await net.dispatch('missionProp.move', {missionId: m.id, serial: u.serial, action: 'collect', actorId: pc.id, sceneId: scene.id, tokenId: ground.id, userId: userOf(ctx, pc)});
          } else {
            if (rec.status === 'delivered') continue;
            let holder = rec.status === 'held' ? w.actors.get(rec.actorId) : null;
            if (!holder) { const scene = w.scenes.find(x => x.id === rec.sceneId), ground = scene?.tokens.get(rec.tokenId); if (!ground) throw new Error(`parcel ${u.serial} lost`); await ctx.w.put(pc, ctx.spawn.mapIdOf(scene), centre(ground)); await net.dispatch('missionProp.move', {missionId: m.id, serial: u.serial, action: 'collect', actorId: pc.id, sceneId: scene.id, tokenId: ground.id, userId: userOf(ctx, pc)}); holder = pc; }
            const tt = S.missionTarget(d, m, state(), null, {actor: holder}) ?? goal;
            const me = await ctx.w.put(holder, tt.mapId, [tt.x, tt.y]);
            await net.dispatch('missionProp.move', {missionId: m.id, serial: u.serial, action: 'deliver', actorId: holder.id, sceneId: me.parent.id, userId: userOf(ctx, holder)});
          }
        }
      } else if (on === 'tagPlaced') {
        const siteIds = o.auto.siteIds ?? [o.auto.siteId];
        const spots = allTokens(ctx).filter(t => siteIds.includes(t.getFlag(NS, 'tagSpot')?.siteId) && !(s.tagProof?.[o.id] || []).includes(t.getFlag(NS, 'tagSpot').siteId));
        const spot = (target && spots.find(t => ctx.spawn.mapIdOf(t.parent) === target.mapId && Math.hypot(target.x - centre(t)[0], target.y - centre(t)[1]) < 150)) ?? spots[0];
        if (!spot) throw new Error(`no paint spot for ${siteIds.join('/')}`);
        if (target && (target.mapId !== ctx.spawn.mapIdOf(spot.parent) || Math.hypot(target.x - centre(spot)[0], target.y - centre(spot)[1]) > 400)) note(`${o.id}: sat nav → ${where} at ${Math.round(target.x)},${Math.round(target.y)}, the wall is at ${ctx.spawn.mapIdOf(spot.parent)} ${centre(spot).map(Math.round)}`);
        const pc = next(), me = await ctx.w.put(pc, ctx.spawn.mapIdOf(spot.parent), centre(spot).map((v, i) => v + (i ? 0 : 60)));
        const attemptId = `att${Math.random().toString(36).slice(2, 12)}`, band = ctx.G.bandForTagSite({surface: spot.getFlag(NS, 'tagSpot').surface, approved: spot.getFlag(NS, 'tagSpot').approved === true});
        const outcome = o.auto.minQuality === 'exceptionalSuccess' ? 'exceptionalSuccess' : o.auto.minQuality === 'strongSuccess' ? 'strongSuccess' : 'fullSuccess';
        const msg = await ChatMessage.implementation.create({flags: {[NS]: {roll: {context: {kind: 'tagPaint', attemptId, sceneId: spot.parent.id, spotTokenId: spot.id, actorId: pc.id}, actorUuid: pc.uuid, userId: userOf(ctx, pc), stat: 'grf', band, outcomeKey: outcome}}}});
        const identity = o.auto.identity && o.auto.identity !== 'ANY_UNLOCKED' ? o.auto.identity : 'TAG-STREET';
        await net.dispatch('graffiti.paint', {sceneId: spot.parent.id, spotTokenId: spot.id, actorId: pc.id, rollMessageId: msg.id, attemptId, tagPackId: identity, missionId: m.id, design: {text: 'CREW'}, userId: userOf(ctx, pc)});
      } else if (on === 'radioWar') {
        const contact = allTokens(ctx).find(t => t.getFlag(NS, 'radioWarNode')?.stationId === o.auto.stationId);
        if (!contact) throw new Error(`no radio contact for ${o.auto.stationId}`);
        if (target && target.mapId !== ctx.spawn.mapIdOf(contact.parent)) note(`${o.id}: sat nav → ${where}, the contact is on ${ctx.spawn.mapIdOf(contact.parent)}`);
        const pc = next(), me = await ctx.w.put(pc, ctx.spawn.mapIdOf(contact.parent), centre(contact).map((v, i) => v + (i ? 0 : 100)));
        const attemptId = `rw${Math.random().toString(36).slice(2, 12)}`, act = (await import('../module/radio/war-core.mjs')).RADIO_WAR_ACTIONS[o.auto.actionId];
        const msg = await ChatMessage.implementation.create({flags: {[NS]: {roll: {context: {kind: 'radioWar', attemptId, actorId: pc.id, sceneId: contact.parent.id, tokenId: contact.id, actionId: o.auto.actionId}, actorUuid: pc.uuid, userId: userOf(ctx, pc), stat: act.stat, band: act.band, outcomeKey: 'fullSuccess', success: true}}}});
        await net.dispatch('radioWar.act', {sceneId: contact.parent.id, tokenId: contact.id, actorId: pc.id, actionId: o.auto.actionId, missionId: m.id, attemptId, rollMessageId: msg.id, userId: userOf(ctx, pc)});
      } else throw new Error(`don't know how to play ${c.mode}/${on}`);
    } catch (e) { err = e.message; }
    await A.sweepMission(m); await new Promise(r => setTimeout(r, 0));
    s = state();
    if (s.status === 'done') break;
    const after = Number(s.ticks?.[o.id] || 0);
    if (!C.checkpointDone(o, s) && after <= before) {
      note(`${o.id} [${c.mode}${on ? '/' + on : ''}] "${o.text.slice(0, 60)}": no progress${err ? ` — ${err}` : ''} (sat nav → ${where})`);
      for (let k = after; k < need; k++) await net.dispatch('mission.tick', {id: m.id, objId: o.id, delta: 1, userId: 'gm', reason: 'simulated GM recovery'}).catch(e2 => note(`recover failed: ${e2.message}`));
    } else if (!C.checkpointDone(o, s) && ++turn > 20) { note(`${o.id}: stuck at ${after}/${need}`); break; }
  }
  const passed = state()?.status === 'done' || M.missionState()[m.id] === undefined;
  if (!passed) note(`did not pass (status ${state()?.status})`);
  return {passed, problems};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const crowded = process.argv.includes('--crowded'), args = process.argv.slice(2).filter(a => a !== '--crowded');
  const sizes = (args[0] || '1,2,4').split(',').map(Number), only = args.slice(1);
  console.info = () => {}; console.warn = () => {};
  const ctx = await setup(), data = await ctx.M.missionData();
  const list = data.missions.filter(m => !only.length || only.includes(m.id) || only.includes(m.code));
  let bad = 0, n = 0; const all = [];
  for (const m of list) for (const size of sizes) { n++; const r = await play(ctx, m, size, {crowded}); if (r.problems.length) { bad++; all.push(...r.problems); } }
  console.log(all.join('\n'));
  console.log(`\n${n - bad}/${n} play-throughs clean (${list.length} missions × ${sizes.join('/')} crew${crowded ? ', crowded streets' : ''})`);
}
