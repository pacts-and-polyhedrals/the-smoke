// Every physical object in the published mission catalogue must be a real mapped,
// serialized, collectable and deliverable item with mandatory event-driven objectives.
import './runtime-stub.mjs';
import assert from 'node:assert/strict';
import {J} from './fakes.mjs';
const data=J('london-missions.json'),maps=new Map(['london-street-atlas.json','london-places.json','london-venues.json'].flatMap(f=>J(f).maps).map(m=>[m.id,m]));
let withProps=0,units=0,autoPhysical=0;
const social=[];
for(const m of data.missions){
 if(!m.props?.length){social.push(`${m.id}: ${m.title}`);continue;}
 withProps++;
 assert.ok(m.playGuide?.length>=3,`${m.id}: clear GM-independent player directions`);
 const ids=new Set();
 for(const p of m.props){
  assert.ok(p.name&&p.description&&p.id,`${m.id}: named, described prop`);
  assert.ok(!ids.has(p.id),`${m.id}: unique prop id`);ids.add(p.id);
  assert.ok(Number.isInteger(p.quantity)&&p.quantity>0,`${m.id}: unit count`);
  units+=p.quantity;
  for(const [key,zoneKey,ev]of [['pickup','pickupZone','cargoCollected'],['delivery','deliveryZone','cargoDelivered']]){
   const stop=typeof p[key]==='number'?m.stops?.[p[key]]:{mapId:p[key]},id=stop?.placeId||stop?.mapId;
   assert.ok(maps.has(id),`${m.id} ${p.name}: ${key} must target an existing physical map (${id})`);
   if(p[zoneKey]) assert.ok(maps.get(id).zones.some(z=>[z.id,z.code].includes(p[zoneKey])),`${m.id} ${p.name}: ${key} area must exist (${p[zoneKey]})`);
   const matching=m.objectives.filter(o=>o.auto?.on===ev&&o.auto?.propId===p.id);
   assert.equal(matching.length,1,`${m.id} ${p.name}: exactly one mandatory event-driven ${ev} objective`);
   assert.equal(matching[0].auto.count,p.quantity,`${m.id} ${p.name}: ${ev} requires every unit`);
   autoPhysical++;
  }
 }
 assert.equal(new Set(m.objectives.map(o=>o.id)).size,m.objectives.length,`${m.id}: unique objective ids`);
}
assert.equal(withProps,111,'all physical cargo jobs registered, including the lost fundraiser dog and cash tin');
assert.equal(units,119,'distinct collectable units');
assert.equal(autoPhysical,224,'collection and delivery of all 112 mission property types must be required');
assert.equal(social.length,14,'remaining missions revolve around vehicles, encounters, and people, rather than portable property');
console.log(`mission catalogue: ${withProps}/125 missions with actual property, ${units} collectable units, ${autoPhysical} required event-driven physical objectives, ${social.length} non-portable-person/vehicle missions — ok`);
