import assert from 'node:assert/strict';
import {makeWorld} from './world-fixture.mjs';
import {J} from './fakes.mjs';
const NS='the-smoke',w=await makeWorld({players:4});
const {SHOPS,purchaseFromShop,sellAtShop,shopsAt}=await import('../module/world/shops.mjs');
const {configureVenues,venueProfiles,validateVenueCatalog,requireVenues}=await import('../module/rules/venue-contract.mjs');
const {registerVenueSettings,syncVenueScene,counterFor,venueProblem}=await import('../module/world/venues.mjs');
const {runVenueService}=await import('../module/world/venue-services.mjs');
const {availableStock}=await import('../module/world/commerce.mjs');
const {dispatch}=await import('../module/world/net.mjs');
const data=J('venue-services.json'),lib=J('london-items.json').items,maps=['london-street-atlas.json','london-places.json','london-venues.json'].flatMap(f=>J(f).maps);
assert.deepEqual(validateVenueCatalog(data,lib,maps),[]);requireVenues();registerVenueSettings();configureVenues(data,SHOPS);
assert.equal(new Set(venueProfiles().filter(p=>p.mapId.startsWith('LDV-')).map(p=>p.mapId)).size,160);
assert.equal(data.itemContracts.length,67);assert.equal(lib.length,247);
for(const p of venueProfiles()){
  const scene=w.scenes.find(s=>s.getFlag(NS,'place')?.id===p.mapId||s.getFlag(NS,'streetAtlas')?.id===p.mapId);
  await syncVenueScene(scene);const c=counterFor(scene,p.key);assert.ok(c,`${p.key} counter exists`);
  const old={x:c.x,y:c.y};await syncVenueScene(scene);assert.deepEqual({x:c.x,y:c.y},old,'sync does not move GM placement');
  assert.equal(scene.tokens.filter(t=>t.getFlag(NS,'venueCounter')?.key===p.key).length,1,'no duplicates');
  if(p.retail==='No')assert.equal(p.stock.flatMap(l=>l.items).length,0);
}
const pc=w.pcs[0],uid='user1',p=venueProfiles().find(p=>p.code==='SN2'),sc=w.scenes.find(s=>s.getFlag(NS,'place')?.id===p.mapId),ct=counterFor(sc,p.key),g=sc.grid.size;
await w.put(pc,p.mapId,[ct.x+ct.width*g/2,ct.y+ct.height*g/2+g]);
assert.equal(venueProblem(pc,p.key),null);assert.ok(shopsAt(sc.tokens.find(t=>t.actor===pc)).includes(p.key));
const cash=pc.system.cash,args={actorId:pc.id,userId:uid,shopKey:p.key,itemName:'Paperback',qty:2,operationId:'purchase_test_001'};
await purchaseFromShop(args);assert.equal(pc.system.cash,cash-12);assert.equal(pc.items.filter(i=>i.name==='Paperback').length,2);
await purchaseFromShop(args);assert.equal(pc.system.cash,cash-12);assert.equal(pc.items.filter(i=>i.name==='Paperback').length,2);
assert.equal(availableStock(p.key,'Paperback'),18);
await assert.rejects(purchaseFromShop({...args,itemName:'Notebook'}),/another action/);
await assert.rejects(purchaseFromShop({...args,operationId:'fraction_test_01',qty:1.5}),/whole number/);
await assert.rejects(purchaseFromShop({...args,operationId:'foreign_actor_01',userId:'user2'}),/Not allowed/);
// Crash after the debit but before item creation. Recovery resumes the original receipt.
const create=pc.createEmbeddedDocuments.bind(pc);let inject=true;
pc.createEmbeddedDocuments=async(...a)=>{if(inject){inject=false;throw new Error('simulated item write failure');}return create(...a);};
const crash={...args,qty:1,itemName:'Notebook',operationId:'crash_purchase_01'};const before=pc.system.cash;
await assert.rejects(purchaseFromShop(crash),/simulated/);assert.equal(pc.system.cash,before-3);
await dispatch('transaction.recover',{actorId:pc.id,operationId:crash.operationId,userId:uid});assert.equal(pc.system.cash,before-3);assert.equal(pc.items.filter(i=>i.name==='Notebook').length,1);
// Closed, wrong room and wrong venue are rejected even when the actor owns plenty of cash.
await ct.update({[`flags.${NS}.venueCounter.staffed`]:false});await assert.rejects(purchaseFromShop({...args,operationId:'closed_counter_01'}),/unstaffed/);await ct.update({[`flags.${NS}.venueCounter.staffed`]:true});
await w.put(pc,p.mapId,[20,20]);await assert.rejects(purchaseFromShop({...args,operationId:'far_counter_01'}),/Stand beside/);
const cinema=venueProfiles().find(p=>p.code==='DA1'),cin=w.scenes.find(s=>s.getFlag(NS,'place')?.id===cinema.mapId),cinC=counterFor(cin,cinema.key);
await w.put(pc,cinema.mapId,[cinC.x+50,cinC.y+50]);
await purchaseFromShop({actorId:pc.id,userId:uid,shopKey:cinema.key,itemName:'Cinema Ticket',qty:1,operationId:'cinema_purchase_01'});
const ticket=pc.items.find(i=>i.name==='Cinema Ticket');
await runVenueService({actorId:pc.id,userId:uid,shopKey:cinema.key,service:'present',itemId:ticket.id,operationId:'cinema_present_01'});
const expiry=pc.getFlag(NS,'venueAccess')[cinema.venueId].expiresAt;assert.ok(expiry>game.time.worldTime);
await assert.rejects(runVenueService({actorId:pc.id,userId:uid,shopKey:cinema.key,service:'present',itemId:ticket.id,operationId:'cinema_present_02'}),/unused pass/);
// Pawning retains the original, not a name-only replacement, and cannot generate replay money.
const pawn=venueProfiles().find(p=>p.code==='WS8'),ps=w.scenes.find(s=>s.getFlag(NS,'place')?.id===pawn.mapId),pt=counterFor(ps,pawn.key);await w.put(pc,pawn.mapId,[pt.x+50,pt.y+50]);
const item=(await pc.createEmbeddedDocuments('Item',[{name:'Cheap Smartphone',type:'gear',system:{quantity:1,value:99999},flags:{[NS]:{testUnique:'original serial'}}}]))[0];
const pp={actorId:pc.id,userId:uid,shopKey:pawn.key,service:'pawn',itemId:item.id,operationId:'pawn_reference_01'};const pv=Number(lib.find(i=>i.name==='Cheap Smartphone').system.value);
const paid=await runVenueService(pp);assert.equal(paid.received,Math.floor(pv*.4),'server catalogue value, not inflated actor field');
const pb=pc.system.cash;await runVenueService(pp);assert.equal(pc.system.cash,pb);
await runVenueService({actorId:pc.id,userId:uid,shopKey:pawn.key,service:'redeem',targetId:pp.operationId,operationId:'redeem_reference_01'});
assert.equal(pc.items.find(i=>i.getFlag(NS,'redeemedPawn'))?.getFlag(NS,'testUnique'),'original serial');
assert.equal(pc.getFlag(NS,'pawns')[pp.operationId].status,'redeemed');
// A street no longer provides a magic remote Corner Shop.
const street=w.scenes.find(s=>s.getFlag(NS,'streetAtlas')?.id==='LDN-HIGHBURY');const far=await w.put(pc,'LDN-HIGHBURY',[10,10]);assert.equal(shopsAt(far).length,0);
console.log('venue commerce v2: 160 interiors,199 physical counters,67 valid additions; exact location/access, stock, idempotent purchase, injected-failure recovery, scoped tickets and original-item pawn redemption passed');
process.exit(0);
