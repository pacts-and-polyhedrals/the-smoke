import {NS, STATS} from '../config.mjs';
import {isPublicTransportVehicle} from '../graffiti/auto-sites.mjs';
import {paintChoices} from '../graffiti/paint-choices.mjs';
import {GRAFFITI_GLYPHS} from '../graffiti/glyph-outlines.mjs';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const BLINDER_RANK = {ordinary: 0, niceOne: 1, blinder: 2, absoluteScenes: 3, frontPage: 4};
export const STYLE_PRESETS = Object.freeze({
  handstyle: {label: 'Handstyle · Quick Script',fontKey:'handstyle',rotate:7,lift:12,skew:-9,outline:8,shadow:11,letterSpacing:-5},
  throwie: {label: 'Throwie · Heavy Paint',fontKey:'throwie',rotate:5,lift:9,skew:-6,outline:17,shadow:15,letterSpacing:-6},
  block: {label: 'Blockbuster · Stencil',fontKey:'block',rotate:2,lift:4,skew:-2,outline:12,shadow:12,letterSpacing:10},
  needle: {label: 'Needle · Marker',fontKey:'needle',rotate:9,lift:14,skew:-12,outline:9,shadow:10,letterSpacing:-3},
  bubble: {label: 'Bubble · Fat Cap',fontKey:'bubble',rotate:4,lift:8,skew:-4,outline:23,shadow:18,letterSpacing:-8}
});
export const QUALITY_PRESETS = Object.freeze({
  severeFailure: {label: 'Proper Mess', wobble: 16, outline: 0.76, shadow: 0.25, shine: 0.0, extras: {underline: false, arrow: false, drips: false, spark: false, halo: false, crown: false}},
  costlyFailure: {label: 'Bad Luck', wobble: 11, outline: 0.86, shadow: 0.55, shine: 0.0, extras: {underline: true, arrow: false, drips: false, spark: false, halo: false, crown: false}},
  narrowSuccess: {label: 'Just About', wobble: 8, outline: 0.94, shadow: 0.8, shine: 0.25, extras: {underline: true, arrow: false, drips: false, spark: false, halo: false, crown: false}},
  fullSuccess: {label: 'Sorted', wobble: 5, outline: 1.0, shadow: 1.0, shine: 0.5, extras: {underline: true, arrow: true, drips: false, spark: false, halo: false, crown: false}},
  strongSuccess: {label: 'Smashed It', wobble: 3, outline: 1.05, shadow: 1.15, shine: 0.85, extras: {underline: true, arrow: true, drips: true, spark: true, halo: false, crown: false}},
  exceptionalSuccess: {label: 'Legendary', wobble: 2, outline: 1.12, shadow: 1.25, shine: 1.0, extras: {underline: true, arrow: true, drips: true, spark: true, halo: true, crown: true}}
});
const DEFAULT_STATE = Object.freeze({
  actorId: '', spotTokenId: '', missionId: '', tagPackId: 'TAG-STREET', text: 'ASMO', style: 'handstyle', fill: '#f6f2d2', outline: '#111111', shadow: '#7c1a16', accent: '#ffd95a', background: 'transparent',
  width: 860, height: 420, stat: 'grf', band: 'medium', quality: 'fullSuccess', blinder: 0,
  extras: {underline: true, arrow: true, drips: false, spark: false, halo: false, crown: false}
});
const esc = value => foundry.utils.escapeHTML(String(value ?? ''));
const SAFE_COLOUR = /^#[0-9a-fA-F]{6}$/;
export function sanitiseTagDesign(design={}) {
  const d=design&&typeof design==='object'?design:{};
  const safe=(value,fallback) => typeof value==='string'&&SAFE_COLOUR.test(value)?value:fallback;
  const extras={}; for(const key of ['underline','arrow','drips','spark','halo','crown'])extras[key]=Boolean(d.extras?.[key]);
  return {
    text:String(d.text??'TAG').replace(/[^a-zA-Z0-9 !?&._-]/g,'').slice(0,18)||'TAG',
    style:STYLE_PRESETS[d.style]?d.style:'handstyle',
    fill:safe(d.fill,'#f6f2d2'), outline:safe(d.outline,'#111111'),
    shadow:safe(d.shadow,'#7c1a16'), accent:safe(d.accent,'#ffd95a'),
    background:d.background==='solid'?'solid':'transparent',
    width:Math.round(clamp(d.width??860,320,1600)),height:Math.round(clamp(d.height??420,220,1000)),
    quality:QUALITY_PRESETS[d.quality]?d.quality:'fullSuccess',
    blinder:Math.round(clamp(d.blinder??0,0,4)),extras
  };
}

const xml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[ch]));
const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag';
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const actorLabel = actor => `${actor.name} · Rep ${actor.system?.stage ?? 1}`;

function ownedActors() {
  return game.actors.contents.filter(a => a.type === 'character' && (game.user.isGM || a.isOwner));
}
function preferredActor() {
  return game.user.character
    ?? canvas?.tokens?.controlled?.find(t => t.actor?.type === 'character' && (game.user.isGM || t.actor.isOwner))?.actor
    ?? ownedActors()[0]
    ?? null;
}
function libraryOf(actor) {
  return Array.isArray(actor?.getFlag(NS, 'tagLibrary')) ? actor.getFlag(NS, 'tagLibrary') : [];
}
function colourLight(hex, amt = 0) {
  const s = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(s)) return hex;
  const c = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
  const f = clamp(amt, -1, 1);
  const out = c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
}
function applyQuality(baseState) {
  const state = foundry.utils.deepClone(baseState);
  const quality = QUALITY_PRESETS[state.quality] ?? QUALITY_PRESETS.fullSuccess;
  const extras={...quality.extras};
  for(const [key,value] of Object.entries(state.extras||{}))if(value===true)extras[key]=true;
  if (state.blinder >= 1) extras.spark = true;
  if (state.blinder >= 2) extras.halo = true;
  if (state.blinder >= 3) extras.crown = true;
  state.extras = extras;
  return {...state, qualityPreset: quality};
}
// SVG glyphs have been outlined offline from commercially usable, open-licensed fonts.
// Decals remain true vector paths and render identically on all Foundry/Forge clients.
function buildLetterLayout(text, style, quality, width, height) {
  const font=GRAFFITI_GLYPHS[style.fontKey]||GRAFFITI_GLYPHS.handstyle;
  const chars=Array.from(String(text||'TAG').toUpperCase().slice(0,18));
  const blank=font.glyphs['?']||[500,''];
  const entries=chars.map(ch=>({ch,glyph:font.glyphs[ch]||blank}));
  const spacing=style.letterSpacing*5;
  const advance=entries.reduce((sum,e)=>sum+e.glyph[0]+spacing,0);
  const s=Math.min((width*.83)/Math.max(1,advance),(height*.57)/font.upem);
  const used=advance*s;
  let x=(width-used)/2;
  const baseline=height*.64;
  return entries.map(({ch,glyph},i)=>{
    const wob=quality.wobble, wave=Math.sin((i+1)*.91),rise=Math.cos((i+.3)*1.13);
    const item={ch,d:glyph[1],x,y:baseline+rise*style.lift+wave*wob*.35,
      rot:wave*style.rotate+(i%2?wob*.23:-wob*.16),scale:s*(1+wave*.055)};
    x+=(glyph[0]+spacing)*s;
    return item;
  });
}
function svgGlyphDefs(letters,seed) {
  return `<defs>${letters.map((l,i)=>`<path id="sg-${seed}-${i}" d="${l.d}"/>`).join('')}</defs>`;
}
function glyphLayer(letters,style,seed,{fill='none',stroke='none',strokeWidth=0,opacity=1,dx=0,dy=0}={}) {
  const paint=`fill="${fill}" stroke="${stroke}" stroke-linejoin="round" paint-order="stroke" opacity="${opacity}"`;
  return `<g ${paint}>${letters.map((l,i)=>`<g transform="translate(${(l.x+dx).toFixed(2)} ${(l.y+dy).toFixed(2)}) rotate(${l.rot.toFixed(2)}) skewX(${style.skew}) scale(${l.scale.toFixed(4)} ${(-l.scale).toFixed(4)})"><use href="#sg-${seed}-${i}" stroke-width="${(strokeWidth/Math.max(l.scale,.001)).toFixed(1)}"/></g>`).join('')}</g>`;
}
function speckle(seed,w,h,amount,colour) {
  let n=seed||12345;
  const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  let parts=[];
  for(let i=0;i<amount;i++){
    const x=(w*(.09+.82*rnd())).toFixed(1),y=(h*(.18+.65*rnd())).toFixed(1),r=(.8+2.7*rnd()).toFixed(1);
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" opacity="${(.16+rnd()*.45).toFixed(2)}"/>`);
  }
  return `<g fill="${colour}" pointer-events="none">${parts.join('')}</g>`;
}
function svgSeed(text){
  let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h>>>0;
}
function underlinePath(letters, h) {
  const start = letters[0]?.x ?? 70, end = (letters.at(-1)?.x ?? 600) + 110;
  const y = h * 0.76;
  return `M ${start} ${y} Q ${(start + end) / 2} ${y + 26} ${end} ${y}`;
}
function drips(letters, colour) {
  const picks = [1, Math.max(1, Math.floor(letters.length / 2)), letters.length - 1].filter(i => letters[i]);
  return `<g fill="none" stroke="${xml(colour)}" stroke-width="10" stroke-linecap="round">${picks.map((idx, n) => {
    const l = letters[idx]; const x = l.x + 26 + n * 5, y = l.y + 22, len = 34 + n * 16;
    return `<path d="M ${x.toFixed(2)} ${y.toFixed(2)} C ${x.toFixed(2)} ${(y + len * 0.35).toFixed(2)} ${(x - 4).toFixed(2)} ${(y + len * 0.7).toFixed(2)} ${x.toFixed(2)} ${(y + len).toFixed(2)}"/><circle cx="${x.toFixed(2)}" cy="${(y + len + 6).toFixed(2)}" r="5"/>`;
  }).join('')}</g>`;
}
function sparkle(x, y, r = 14, colour = '#fff4c4') {
  return `<path d="M ${x} ${y-r} L ${x+r*0.3} ${y-r*0.3} L ${x+r} ${y} L ${x+r*0.3} ${y+r*0.3} L ${x} ${y+r} L ${x-r*0.3} ${y+r*0.3} L ${x-r} ${y} L ${x-r*0.3} ${y-r*0.3} Z" fill="${xml(colour)}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
}
function sparkles(w, h, accent) {
  return `<g>${sparkle(w * 0.16, h * 0.22, 13, accent)}${sparkle(w * 0.84, h * 0.26, 11, accent)}${sparkle(w * 0.72, h * 0.78, 9, accent)}</g>`;
}
function crown(w, h, fill, outline) {
  const x = w * 0.5, y = h * 0.17;
  return `<g transform="translate(${x} ${y})"><path d="M -96 30 L -70 -20 L -30 12 L 0 -36 L 32 12 L 72 -20 L 96 30 L 96 52 L -96 52 Z" fill="${xml(fill)}" stroke="${xml(outline)}" stroke-width="8" stroke-linejoin="round"/><circle cx="-71" cy="-18" r="8" fill="#fff4c4"/><circle cx="0" cy="-34" r="8" fill="#fff4c4"/><circle cx="71" cy="-18" r="8" fill="#fff4c4"/></g>`;
}
function halo(w, h, fill, outline) {
  return `<ellipse cx="${(w/2).toFixed(2)}" cy="${(h*0.52).toFixed(2)}" rx="${(w*0.39).toFixed(2)}" ry="${(h*0.24).toFixed(2)}" fill="${xml(fill)}" fill-opacity="0.08" stroke="${xml(outline)}" stroke-width="8" stroke-dasharray="18 10"/>`;
}
function arrowPath(letters, h) {
  const end = (letters.at(-1)?.x ?? 620) + 120;
  const base = h * 0.47;
  return `M ${end - 110} ${base + 62} Q ${end - 38} ${base + 30} ${end} ${base - 10} M ${end - 38} ${base - 10} L ${end} ${base - 10} L ${end - 10} ${base + 28}`;
}
export function buildSvg(state) {
  const full=applyQuality(sanitiseTagDesign(state)),style=STYLE_PRESETS[full.style]||STYLE_PRESETS.handstyle;
  const quality=full.qualityPreset||QUALITY_PRESETS.fullSuccess;
  const width=clamp(full.width,320,1600),height=clamp(full.height,220,1000);
  const strokeW=Math.max(3,Math.round(style.outline*quality.outline));
  const shadowW=Math.max(4,Math.round(style.shadow*quality.shadow));
  const letters=buildLetterLayout(full.text,style,quality,width,height);
  const id=svgSeed(`${full.text}|${full.style}|${full.quality}|${full.blinder}`).toString(36);
  const defs=svgGlyphDefs(letters,id);
  const bg=full.background==='solid'?`<rect width="100%" height="100%" rx="18" fill="#ece7d7"/>`:'';
  const grad=`<defs><linearGradient id="sg-fill-${id}" x1="0" x2=".2" y1="0" y2="1"><stop stop-color="${xml(colourLight(full.fill,.15))}"/><stop offset=".57" stop-color="${xml(full.fill)}"/><stop offset="1" stop-color="${xml(colourLight(full.fill,-.15))}"/></linearGradient></defs>`;
  const seed=svgSeed(id);
  const shadow=glyphLayer(letters,style,id,{fill:xml(full.shadow),opacity:.90,dx:shadowW,dy:shadowW});
  const border=glyphLayer(letters,style,id,{fill:`url(#sg-fill-${id})`,stroke:xml(full.outline),strokeWidth:strokeW,opacity:quality.wobble>12?.75:1});
  const highlight=quality.shine?glyphLayer(letters,style,id,{fill:'none',stroke:'#fffdf2',strokeWidth:Math.max(2,strokeW*.18),opacity:Math.min(.6,quality.shine*.36),dx:-3,dy:-6}):'';
  const under=full.extras.underline?`<path d="${underlinePath(letters,height)}" fill="none" stroke="${xml(full.accent)}" stroke-width="${Math.max(5,strokeW*.5)}" stroke-linecap="round"/>`:'';
  const arr=full.extras.arrow?`<path d="${arrowPath(letters,height)}" fill="none" stroke="${xml(full.outline)}" stroke-width="${Math.max(5,strokeW*.36)}" stroke-linecap="round" stroke-linejoin="round"/>`:'';
  const haloSvg=full.extras.halo?halo(width,height,full.accent,full.outline):'';
  const dripsSvg=full.extras.drips?drips(letters,full.outline):'';
  const sparkSvg=full.extras.spark?sparkles(width,height,full.accent):'';
  const crownSvg=full.extras.crown?crown(width,height,full.accent,full.outline):'';
  const grit=speckle(seed,width,height,full.quality==='exceptionalSuccess'?54:full.quality==='strongSuccess'?33:20,xml(full.accent));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${xml(full.text)} graffiti tag">${defs}${grad}${bg}${haloSvg}${shadow}${border}${highlight}${under}${arr}${dripsSvg}${grit}${sparkSvg}${crownSvg}</svg>`;
}
function downloadSvg(filename, svg) {
  const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export class SmokeTagStudio extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {classes: ['smoke', 'smoke-tag-studio'], tag: 'div', position: {width: 1100, height: 760}, window: {title: 'Tag Studio', icon: 'fa-solid fa-spray-can-sparkles', resizable: true}};
  static PARTS = {main: {template: `systems/${NS}/templates/tag-studio.hbs`, scrollable: ['.tag-studio-main']}};
  constructor(actor = null, {spotTokenId = null} = {}) {
    super({id: `smoke-tag-studio-${actor?.id ?? 'open'}`});
    const pick = actor ?? preferredActor();
    // ApplicationV2.state is a getter-only framework property: never overwrite it.
    this.tagDraft = foundry.utils.deepClone(DEFAULT_STATE);
    if (pick) this.tagDraft.actorId = pick.id;
    if (spotTokenId) this.tagDraft.spotTokenId = spotTokenId;
    this.previewSvg = buildSvg(this.tagDraft);
  }
  get actor() { return game.actors.get(this.tagDraft.actorId) ?? preferredActor(); }
  actorChoices() {
    return ownedActors().map(a => ({id: a.id, label: actorLabel(a), selected: a.id === (this.actor?.id ?? '')}));
  }
  async _prepareContext() {
    const actor = this.actor;
    if (actor && !this.tagDraft.actorId) this.tagDraft.actorId = actor.id;
    this.previewSvg = buildSvg(this.tagDraft);
    const quality = QUALITY_PRESETS[this.tagDraft.quality] ?? QUALITY_PRESETS.fullSuccess;
    const canvasScene=canvas?.scene;
    const spots=(canvasScene?.tokens||[]).filter(t=>!t.hidden && (t.getFlag?.(NS,'tagSpot')||isPublicTransportVehicle(t)));
    const catalogue=await game.smoke?.graffiti?.catalogue?.().catch(()=>null);
    const allMissions=await game.smoke?.missions?.data?.().catch(()=>null);
    const states=game.smoke?.missions?.state?.()||{};
    const actorToken=actor?(canvasScene?.tokens||[]).find(t=>t.actorId===actor.id&&!t.hidden&&!t.getFlag?.(NS,'vehicleSeat')):null;
    // 0.5.23: the nearest surface a job still needs, the commission it counts for, the tag that job asks for, and a hint
    const pick=paintChoices({catalogue,missions:allMissions?.missions||[],states,factions:game.smoke?.missions?.factions?.()||{},actor,actorToken,
      scene:canvasScene,spots,draft:this.tagDraft,isGM:game.user.isGM});
    this.tagDraft.spotTokenId=pick.spot?.id||'';this.tagDraft.missionId=pick.missionId;this.tagDraft.tagPackId=pick.tagPackId;
    const currentSpot=pick.spot,available=pick.missions,packs=pick.packs;
    return {
      state: this.tagDraft,
      actor,
      paintSpots:spots.map(t=>({id:t.id,label:t.name,selected:t.id===this.tagDraft.spotTokenId})),
      paintMissions:available.map(m=>({id:m.id,label:`${m.code} ${m.title}`,selected:m.id===this.tagDraft.missionId})),
      paintHint:pick.hint,
      paintPacks:[{id:'TAG-STREET',label:'My crew / personal tag',selected:this.tagDraft.tagPackId==='TAG-STREET'},...packs.map(p=>({id:p.id,label:`${p.title} (${p.faction})`,selected:p.id===this.tagDraft.tagPackId}))],
      canPaint:Boolean(currentSpot&&actor),
      paintCanLabel:(()=>{const can=actor?.items?.find?.(i=>i.type==='gear'&&i.name==='Spray Paint'&&Number(i.system.quantity||0)>0);return can?`${can.getFlag?.(NS,'spray')?.remainingCharges??6}/6 charges`:'No Spray Paint in inventory';})(),
      districtTagScores:Object.entries(game.smoke?.graffiti?.territory?.()?.[canvasScene?.getFlag?.(NS,'streetAtlas')?.id||canvasScene?.getFlag?.(NS,'place')?.id]||{}).map(([faction,points])=>({faction,points})).sort((a,b)=>b.points-a.points),
      actors: this.actorChoices(),
      stats: Object.entries(STATS).map(([key, value]) => ({key, label: `${value.label} (${value.abbr})`, selected: key === this.tagDraft.stat})),
      bands: ['easy', 'medium', 'hard', 'miracle'].map(key => ({key, label: key[0].toUpperCase() + key.slice(1), selected: key === this.tagDraft.band})),
      styles: Object.entries(STYLE_PRESETS).map(([key, value]) => ({key, label: value.label, selected: key === this.tagDraft.style})),
      qualities: Object.entries(QUALITY_PRESETS).map(([key, value]) => ({key, label: value.label, selected: key === this.tagDraft.quality})),
      blinderOptions: [0, 1, 2, 3, 4].map(v => ({value: v, label: v ? `${v}` : '0', selected: v === Number(this.tagDraft.blinder || 0)})),
      previewSvg: this.previewSvg,
      qualityLabel: quality.label,
      library: libraryOf(actor).map(entry => ({...entry, svg:buildSvg(entry), selected: false, qualityLabel: QUALITY_PRESETS[entry.quality]?.label ?? entry.quality}))
    };
  }
  updateFromForm() {
    const form = this.element.querySelector('form'); if (!form) return;
    const fd = new FormData(form);
    this.tagDraft.actorId = String(fd.get('actorId') || '');
    this.tagDraft.spotTokenId=String(fd.get('spotTokenId')||'');
    this.tagDraft.missionId=String(fd.get('missionId')||'');
    this.tagDraft.tagPackId=String(fd.get('tagPackId')||'TAG-STREET');
    this.tagDraft.text = String(fd.get('text') || '').slice(0, 18);
    this.tagDraft.style = String(fd.get('style') || 'handstyle');
    this.tagDraft.fill = String(fd.get('fill') || '#f6f2d2');
    this.tagDraft.outline = String(fd.get('outline') || '#111111');
    this.tagDraft.shadow = String(fd.get('shadow') || '#7c1a16');
    this.tagDraft.accent = String(fd.get('accent') || '#ffd95a');
    this.tagDraft.background = String(fd.get('background') || 'transparent');
    this.tagDraft.stat = String(fd.get('stat') || 'grf');
    this.tagDraft.band = String(fd.get('band') || 'medium');
    this.tagDraft.quality = String(fd.get('quality') || 'fullSuccess');
    this.tagDraft.blinder = Number(fd.get('blinder') || 0);
    this.tagDraft.extras = {
      underline: fd.get('underline') === 'on', arrow: fd.get('arrow') === 'on', drips: fd.get('drips') === 'on',
      spark: fd.get('spark') === 'on', halo: fd.get('halo') === 'on', crown: fd.get('crown') === 'on'
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    const on = (selector, event, fn) => root.querySelectorAll(selector).forEach(el => el.addEventListener(event, ev => {
      if (event === 'click') ev.preventDefault();
      Promise.resolve(fn(el, ev)).catch(error => ui.notifications.warn(error.message));
    }));
    const localPreview = () => {
      this.updateFromForm();
      const frame = root.querySelector('.tag-preview-frame');
      if (frame) frame.innerHTML = buildSvg(this.tagDraft);
      const label = root.querySelector('[data-quality-label]');
      if (label) label.textContent = QUALITY_PRESETS[this.tagDraft.quality]?.label ?? this.tagDraft.quality;
      const bl = root.querySelector('[data-blinder-label]');
      if (bl) bl.textContent = Number(this.tagDraft.blinder || 0) ? ` · Blinder ${this.tagDraft.blinder}` : '';
    };
    on('input, select, textarea', 'change', (el) => {
      // Recalculate the choices after changing character, location or commission;
      // preserve the selection BEFORE replacing the Handlebars form.
      if (['actorId', 'spotTokenId', 'missionId'].includes(el.name)) {
        this.updateFromForm();
        // a commission the player picked (even "free paint") stays picked; a new surface or character chooses afresh
        this.tagDraft.missionPicked = el.name === 'missionId';
        return this.render();
      }
      localPreview();
    });
    on('input[name="text"]', 'input', () => localPreview());
    on('[data-tag-roll]', 'click', () => this.rollQuality());
    on('[data-tag-paint]', 'click', () => this.paintOnMap());
    on('[data-tag-download]', 'click', () => { this.updateFromForm(); downloadSvg(`${slug(this.tagDraft.text)}-${this.tagDraft.style}.svg`, buildSvg(this.tagDraft)); });
    on('[data-tag-copy]', 'click', async () => { this.updateFromForm(); await navigator.clipboard.writeText(buildSvg(this.tagDraft)); ui.notifications.info('SVG copied to the clipboard.'); });
    on('[data-tag-save]', 'click', () => this.saveCurrent());
    on('[data-load-tag]', 'click', button => this.loadSaved(button.dataset.loadTag));
    on('[data-delete-tag]', 'click', button => this.deleteSaved(button.dataset.deleteTag));
  }
  async paintOnMap() {
    this.updateFromForm();
    const actor=this.actor;
    if(!actor)throw new Error('Choose a character before painting.');
    if(!this.tagDraft.spotTokenId)throw new Error('Right-click a paintable surface, or ask the GM to drop one on the map.');
    const result=await game.smoke.graffiti.paint({actor,spotTokenId:this.tagDraft.spotTokenId,missionId:this.tagDraft.missionId||null,
      identity:this.tagDraft.tagPackId||'TAG-STREET',design:sanitiseTagDesign(this.tagDraft)});
    if(result?.quality){this.tagDraft.quality=result.quality;await this.render();}
    return result;
  }
  async rollQuality() {
    this.updateFromForm();
    const actor = this.actor; if (!actor) throw new Error('Pick a character first.');
    if (!actor.isOwner && !game.user.isGM) throw new Error('That character is not yours.');
    const out = await actor.rollStat(this.tagDraft.stat, {band: this.tagDraft.band, label: `Tag up · ${this.tagDraft.text || 'Tag'}`});
    if (!out?.result) return;
    this.tagDraft.quality = out.result.outcomeKey || 'fullSuccess';
    this.tagDraft.blinder = BLINDER_RANK[out.result.blinder] ?? 0;
    ui.notifications.info(`${actor.name}: ${QUALITY_PRESETS[this.tagDraft.quality]?.label ?? this.tagDraft.quality}${this.tagDraft.blinder ? ` · Blinder ${this.tagDraft.blinder}` : ''}`);
    await this.render();
  }
  async saveCurrent() {
    this.updateFromForm();
    const actor = this.actor; if (!actor) throw new Error('Pick a character first.');
    const library = libraryOf(actor);
    const entry = {
      id: foundry.utils.randomID(), name: `${this.tagDraft.text || 'Tag'} · ${STYLE_PRESETS[this.tagDraft.style]?.label ?? this.tagDraft.style}`,
      savedAt: Date.now(), text: this.tagDraft.text, style: this.tagDraft.style, fill: this.tagDraft.fill, outline: this.tagDraft.outline,
      shadow: this.tagDraft.shadow, accent: this.tagDraft.accent, background: this.tagDraft.background, stat: this.tagDraft.stat, band: this.tagDraft.band,
      quality: this.tagDraft.quality, blinder: this.tagDraft.blinder, extras: foundry.utils.deepClone(this.tagDraft.extras), svg: buildSvg(this.tagDraft)
    };
    await actor.setFlag(NS, 'tagLibrary', [entry, ...library].slice(0, 24));
    ui.notifications.info(`Saved ${entry.name} to ${actor.name}.`);
    await this.render();
  }
  async loadSaved(id) {
    const actor = this.actor; const entry = libraryOf(actor).find(x => x.id === id); if (!entry) throw new Error('Saved tag not found.');
    const {spotTokenId,missionId,tagPackId}=this.tagDraft;
    Object.assign(this.tagDraft, foundry.utils.deepClone(DEFAULT_STATE), foundry.utils.deepClone(entry));
    this.tagDraft.actorId = actor.id;this.tagDraft.spotTokenId=spotTokenId;this.tagDraft.missionId=missionId;this.tagDraft.tagPackId=tagPackId;
    await this.render();
  }
  async deleteSaved(id) {
    const actor = this.actor; if (!actor) throw new Error('Pick a character first.');
    const library = libraryOf(actor); const next = library.filter(x => x.id !== id); if (next.length === library.length) return;
    await actor.setFlag(NS, 'tagLibrary', next);
    ui.notifications.info('Saved tag removed.');
    await this.render();
  }
}
export function openTagStudio(actor = null, options = {}) {
  const app = new SmokeTagStudio(actor,options); app.render({force: true}); return app;
}
