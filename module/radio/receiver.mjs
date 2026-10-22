import {clampVolume} from './core.mjs';

/** One local receiver. It never broadcasts audio, records it, or uses Foundry playlists. */
export class RadioReceiver{
 constructor({createAudio=()=>new Audio(),changed=()=>{},timeout=20000,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  Object.assign(this,{createAudio,changed,timeout,setTimer,clearTimer});
  this.enabled=false;this.volume=.25;this.muted=false;this.status='off';this.audio=null;this.key=null;this.generation=0;this.timer=null;this.listeners=[];
 }
 _status(value){if(this.status!==value){this.status=value;this.changed();}}
 _drop(){
  this.generation++;this.clearTimer(this.timer);this.timer=null;
  if(this.audio){for(const [event,fn] of this.listeners)this.audio.removeEventListener(event,fn);this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
  this.audio=null;this.listeners=[];this.key=null;
 }
 _fail(status,generation){if(generation!==this.generation)return;this.failedKey=this.key;this._drop();this._status(status);}
 _arm(generation){
  this.clearTimer(this.timer);
  this.timer=this.setTimer(()=>this._fail('unavailable',generation),this.timeout);
 }
 setVolume(value){this.volume=clampVolume(value);if(this.audio)this.audio.volume=this.volume;}
 setMuted(value){this.muted=Boolean(value);if(this.audio)this.audio.muted=this.muted;this.changed();}
 stop(){this.enabled=false;this.failedKey=null;this._drop();this._status('off');this.changed();}
 follow(station,{power=true,allowed=true,retry=false}={}){
  if(!this.enabled){if(this.audio)this._drop();this._status('off');return;}
  if(!allowed){this.failedKey=null;this._drop();this._status('disabled');return;}
  if(!power){this.failedKey=null;this._drop();this._status('car-off');return;}
  if(!station){this._drop();this._status('no-station');return;}
  if(!station.stream){this.enabled=false;this._drop();this._status('external');return;}
  const key=station.id+'|'+station.stream;
  // An error stays quiet until the user retries, tunes elsewhere, or the source changes.
  if(!retry&&key===(this.failedKey??this.key))return;
  this.failedKey=null;this._drop();this.key=key;
  const generation=this.generation;
  const fail=status=>{if(generation!==this.generation)return;this._fail(status,generation);this.failedKey=key;};
  try{
   const audio=this.audio=this.createAudio();audio.preload='none';audio.volume=this.volume;audio.muted=this.muted;
   const on=(event,fn)=>{audio.addEventListener(event,fn);this.listeners.push([event,fn]);};
   on('playing',()=>{if(generation!==this.generation)return;this.clearTimer(this.timer);this.timer=null;this._status('playing');});
   for(const event of ['waiting','stalled'])on(event,()=>{if(generation!==this.generation)return;this._status('buffering');this._arm(generation);});
   for(const event of ['error','ended'])on(event,()=>fail('unavailable'));
   // No crossOrigin attribute: normal cross-origin <audio> works without a CORS decode step.
   audio.src=station.stream;this._status('connecting');this._arm(generation);
   Promise.resolve(audio.play()).then(()=>{
    if(generation!==this.generation)return;
    this.clearTimer(this.timer);this.timer=null;this._status('playing');
   }).catch(error=>{if(generation===this.generation)fail(error?.name==='NotAllowedError'?'blocked':'unavailable');});
  }catch(_error){fail('unavailable');}
 }
 listen(station,options={}){this.enabled=true;this.failedKey=null;this.follow(station,{...options,retry:true});this.changed();}
}
