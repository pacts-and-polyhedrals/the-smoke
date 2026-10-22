// A station directory is data, never HTML or executable player code.
export function httpsURL(value,{required=false,stream=false}={}){
 const text=String(value??'').trim();
 if(!text&&!required)return '';
 let u;try{u=new URL(text);}catch(_e){throw new Error('Use a complete HTTPS address.');}
 if(u.protocol!=='https:'||u.username||u.password||!u.hostname||text.length>1500)throw new Error('Radio addresses must use HTTPS without embedded login details.');
 if(stream&&/\.(m3u8?|pls)$/i.test(u.pathname))throw new Error('Use a direct MP3 or AAC stream, rather than a playlist address.');
 return u.href;
}
// Ways to reach a station's studio. All optional; a preset with none simply has no Message button.
export const CONTACT_FIELDS=Object.freeze(['chatUrl','whatsapp','sms','phone','email','messageUrl']);
/** A phone number for WhatsApp/text/call links, as +<country><number>. UK numbers may start with 0. */
export function phoneNumber(value){
 const text=String(value??'').trim();if(!text)return '';
 const digits=text.replace(/[\s().-]/g,'');
 if(!/^\+?\d{7,15}$/.test(digits))throw new Error('Use a phone number such as +44 7700 900123.');
 return digits.startsWith('+')?digits:digits.startsWith('0')?'+44'+digits.slice(1):'+'+digits;
}
export function emailAddress(value){
 const text=String(value??'').trim();if(!text)return '';
 if(text.length>200||!/^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+$/.test(text))throw new Error('Use a plain email address such as studio@example.com.');
 return text;
}
function contactsOf(row,i){
 try{return {chatUrl:httpsURL(row?.chatUrl),whatsapp:phoneNumber(row?.whatsapp),sms:phoneNumber(row?.sms),phone:phoneNumber(row?.phone),email:emailAddress(row?.email),messageUrl:httpsURL(row?.messageUrl)};}
 catch(error){throw new Error(`Preset ${i+1}: ${error.message}`);}
}
/**
 * The ways to message this station's studio, with the message filled in where the channel allows it (WhatsApp, text,
 * email). A web page (a station's message box or chat) cannot be filled in from here: copy the message, then open it.
 */
export function studioLinks(station,text=''){
 const message=String(text??'').trim().slice(0,500),enc=encodeURIComponent(message),out=[];
 if(!station)return out;
 const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(_e){return u;}};
 // The station's own chat or message box, shown in a Foundry window: the player posts through the station's system.
 if(station.chatUrl)out.push({type:'chat',label:'Studio chat',icon:'fa-solid fa-comments',detail:host(station.chatUrl),prefilled:false,inFoundry:true,href:station.chatUrl});
 if(station.whatsapp)out.push({type:'whatsapp',label:'WhatsApp',icon:'fa-brands fa-whatsapp',detail:station.whatsapp,prefilled:true,href:`https://wa.me/${station.whatsapp.replace(/^\+/,'')}${message?`?text=${enc}`:''}`});
 if(station.sms)out.push({type:'sms',label:'Text',icon:'fa-solid fa-comment-sms',detail:station.sms,prefilled:true,href:`sms:${station.sms}${message?`?&body=${enc}`:''}`});
 if(station.email)out.push({type:'email',label:'Email',icon:'fa-solid fa-envelope',detail:station.email,prefilled:true,href:`mailto:${station.email}?subject=${encodeURIComponent(`Message for ${station.name||'the studio'}`)}${message?`&body=${enc}`:''}`});
 if(station.messageUrl)out.push({type:'web',label:'Their site',icon:'fa-solid fa-globe',detail:host(station.messageUrl),prefilled:false,href:station.messageUrl});
 if(station.phone)out.push({type:'call',label:'Call',icon:'fa-solid fa-phone',detail:station.phone,prefilled:false,href:`tel:${station.phone}`});
 return out;
}
export function validateStations(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>40)throw new Error('Keep between 1 and 40 radio presets.');
 const ids=new Set();
 return rows.map((row,i)=>{
  const id=String(row?.id??'').trim(),name=String(row?.name??'').trim(),genre=String(row?.genre??'').trim();
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||ids.has(id))throw new Error(`Preset ${i+1} needs a unique ID (lower-case letters, numbers and dashes).`);
  if(!name||name.length>64||genre.length>100)throw new Error(`Preset ${i+1} needs a name of up to 64 characters and genres of up to 100 characters.`);
  ids.add(id);
  return {id,name,genre,stream:httpsURL(row.stream,{required:false,stream:true}),playerUrl:httpsURL(row.playerUrl),website:httpsURL(row.website,{required:true}),directory:httpsURL(row.directory),...contactsOf(row,i)};
 });
}
export function steppedStation(stations,current,delta){
 if(!stations.length)return null;
 const i=Math.max(0,stations.findIndex(s=>s.id===current));
 return stations[((i+Math.sign(delta))%stations.length+stations.length)%stations.length].id;
}
export const clampVolume=value=>Math.max(0,Math.min(1,Number.isFinite(Number(value))?Number(value):0.25));
