// Pure seat / footprint geometry for vehicle boarding (no Foundry globals, unit-testable).

/** Size 1 → 1×2 squares, Size 2 → 2×3, Size 3 → 3×4 … (token art faces down: the front of the vehicle is the bottom edge, as Foundry turns a token's bottom edge to lead). */
export function vehicleFootprint(size){
  const s=Math.max(1,Math.min(10,Math.round(Number(size)||1)));
  return {width:s,height:s+1};
}

/** Seats from the vehicle's crew numbers: one Driver/Pilot, extra crew stations, then passengers. */
export function seatLayout(actor){
  const v=actor?.system?.vehicle||{};
  const seats=[{id:'pilot',role:'pilot',label:'Driver / Pilot'}];
  const extraCrew=Math.max(0,Math.min(20,Number(v.crewFull||1)-1));
  let gunners=0,operators=0;
  for(let i=0;i<extraCrew;i++){
    const gunner=Number(v.fireControl||0)>0&&gunners===0;
    if(gunner){gunners++;seats.push({id:`gunner-${gunners}`,role:'gunner',label:gunners>1?`Gunner ${gunners}`:'Gunner'});}
    else{operators++;seats.push({id:`operator-${operators}`,role:'operator',label:operators>1?`Operator ${operators}`:'Operator / Systems'});}
  }
  const passengers=Math.max(0,Math.min(40,Number(v.passengers||0)));
  for(let i=1;i<=passengers;i++)seats.push({id:`passenger-${i}`,role:'passenger',label:passengers>1?`Passenger ${i}`:'Passenger'});
  return seats;
}

function rotate(x,y,deg){const r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return {x:x*c-y*s,y:x*s+y*c};}

/**
 * Top-left canvas coordinates for a half-square occupant token in each seat, following the
 * vehicle's rotation. Seats fill rows from the front: Driver front-left. The art faces down (Foundry's
 * rotation 0 is south), so the layout is turned 180° before applying the token's own rotation.
 */
export function seatPositions(vt,seats,gridSize){
  const W=vt.width*gridSize,H=vt.height*gridSize,half=gridSize*0.5;
  const cols=Math.max(1,Math.floor(vt.width/0.5)),rows=Math.max(1,Math.ceil(seats.length/cols));
  const cx=vt.x+W/2,cy=vt.y+H/2,out={};
  seats.forEach((seat,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    const lx=-W/2+(col+0.5)*(W/cols),ly=-H/2+(row+0.5)*(H/rows);
    const p=rotate(lx,ly,Number(vt.rotation||0)+180);
    out[seat.id]={x:cx+p.x-half/2,y:cy+p.y-half/2};
  });
  return out;
}

/** Where someone stands after getting out: in a column beside the vehicle's right-hand side as it is
 *  drawn (a vehicle turned 90° is wide, not tall), then further columns out. Snapped to the grid. */
export function exitPositions(vt,index,gridSize){
  const g=gridSize,rot=((Number(vt.rotation||0)%360)+360)%360,side=(rot>45&&rot<135)||(rot>225&&rot<315);
  const W=(side?vt.height:vt.width)*g,H=(side?vt.width:vt.height)*g;
  const cx=vt.x+vt.width*g/2,cy=vt.y+vt.height*g/2,left=cx-W/2,top=cy-H/2;
  const rows=Math.max(1,Math.round(H/g)),row=index%rows,col=Math.floor(index/rows);
  const snap=v=>Math.round(v/g)*g;
  return {x:snap(left+W)+col*g,y:snap(top)+row*g};
}
