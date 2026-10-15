// Vehicle convoy geometry (v2.5.1). Pure data plan for one Foundry Scene Token batch.
// The vehicle and every seated PC/NPC must be updated in the SAME embedded-document operation.
import {seatLayout,seatPositions} from './vehicle-seat-math.mjs';

export const VEHICLE_TRANSFORM_FIELDS=Object.freeze(['x','y','rotation','elevation','width','height']);

/** Read only supported transform properties. Validate untrusted socket request data. */
export function pickVehicleTransform(changes){
  if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('Invalid vehicle movement.');
  const out={};
  for(const field of VEHICLE_TRANSFORM_FIELDS){
    if(!Object.hasOwn(changes,field))continue;
    const number=changes[field];
    if(typeof number!=='number'||!Number.isFinite(number))throw new Error(`Invalid ${field} for vehicle movement.`);
    if(['width','height'].includes(field)&&(number<0.5||number>50))throw new Error(`Vehicle ${field} is out of range.`);
    if(Math.abs(number)>10000000)throw new Error(`Vehicle ${field} is out of range.`);
    out[field]=number;
  }
  if(!Object.keys(out).length)throw new Error('No vehicle position or orientation supplied.');
  return out;
}

/**
 * Return one ordered batch: vehicle first, then every seated actor's token.
 * A projected vehicle is used, not the current scene coordinates, to eliminate
 * the previous one-update delay. No scene writes are performed by this helper.
 */
export function planVehicleMove(vehicleToken,changes,occupants,gridSize){
  const transform=pickVehicleTransform(changes);
  const source=vehicleToken;
  if(!source?.id||!source.parent?.tokens?.get)throw new Error('Vehicle token is not on a scene.');
  const destination={
    x:source.x,y:source.y,width:source.width,height:source.height,
    rotation:source.rotation??0,elevation:source.elevation??0,
    ...transform
  };
  const g=Number(gridSize);
  if(!Number.isFinite(g)||g<=0)throw new Error('Scene grid size is unavailable.');
  const positions=seatPositions(destination,seatLayout(source.actor),g);
  const updates=[{_id:source.id,...changes}];
  const seen=new Set([source.id]);
  for(const [seatId,record] of Object.entries(occupants||{})){
    if(!Object.hasOwn(positions,seatId))continue;
    const token=source.parent.tokens.get(record?.tokenId);
    if(!token||seen.has(token.id)||token.actor?.type==='vehicle')continue;
    // Don't carry a previously disembarked token from stale vehicle flags.
    const linked=token.getFlag?.('the-smoke','vehicleSeat');
    if(!linked||linked.vehicleTokenId!==source.id||linked.seatId!==seatId)continue;
    seen.add(token.id);
    const point=positions[seatId];
    updates.push({
      _id:token.id,x:Math.round(point.x),y:Math.round(point.y),
      width:0.5,height:0.5,rotation:destination.rotation,elevation:destination.elevation,
      sort:(source.sort??0)+1
    });
  }
  return updates;
}
