import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {ClassicLevel} from 'classic-level';
import {textHash} from '../../module/text-hash.mjs';
import {rules,esc,p,h,table,box} from './rules.mjs';
import {chapters} from './pages.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VERSION = '0.5.2', NS = 'the-smoke';
const read = async name => JSON.parse(await fs.readFile(path.join(ROOT,'data',name),'utf8'));
const write = async (name,d) => fs.writeFile(path.join(ROOT,'data',name),JSON.stringify(d,null,2)+'\n');
const data=await read('content.json'), source=await read('london-guides.json'), history=await read('guide-history.json'), missions=await read('london-missions.json');
const entries=new Map(data.journals.map(j=>[j.flags[NS].contentKey,j]));
const idFor = value => createHash('sha256').update(value).digest('hex').slice(0,16);
for(const [key,names] of [['players-handbook',['Chases and Police Stops','Blower, Radio and Sat Nav','Missions and Faction Standing']],['gms-book',['Automation and Table Pace']],['rules-reference',['Guide Index']]]) {
  const j=entries.get(key);
  for(const name of names) if(!j.pages.some(p=>p.name===name)) j.pages.push({_id:idFor(`${key}|${name}`),name,type:'text',title:{show:true,level:1},text:{format:1,content:''},sort:(j.pages.length+1)*1000,ownership:{default:-1},flags:{[NS]:{}}});
}
const link=(key,name,label=name)=>{
  const j=entries.get(key), page=j?.pages.find(p=>p.name===name);
  if(!page) throw new Error(`Missing journal link ${key}|${name}`);
  return `@UUID[Compendium.${NS}.guides.JournalEntry.${j._id}.JournalEntryPage.${page._id}]{${label}}`;
};
const r=rules(data), replacements=chapters(r,link);
// Retire the obsolete three-job starter (fixed bonuses / five Rep stages) in
// favour of the opening missions actually run by the Board. Keep the old IDs.
const quickStart=entries.get('gm-guide').pages.slice(2,5);
for(const [i,page]of quickStart.entries()){
  const m=missions.missions[i], missionPage=data.journals.flatMap(j=>j.pages).find(p=>p._id===m.pageUuid.split('.').at(-1));
  const name=`Mission ${i+1} · ${m.title}`;
  if(page.name!==name)page.flags[NS].legacyNames=[...new Set([...(page.flags[NS].legacyNames||[]),page.name])];
  page.name=name;replacements.set(`gm-guide|${name}`,missionPage.text.content);
}
const publicKeys=['player-guide','players-handbook','rules-reference','jobs-handbook','gear-reference','london-directory','london-guide','crew-dossiers'];
const rulesTopics=[['Start here','player-guide','Welcome to the ends'],['Character creation','players-handbook','Making a Character'],['Stats','players-handbook','Your Stats'],['Rolls & teamwork','rules-reference','Core checks'],['Combat & reactions','players-handbook','Fighting'],['Conditions, Down & first aid','players-handbook','Harm and Conditions'],['Driving, collisions & fire','players-handbook','Motors'],['Chases & police decisions','players-handbook','Chases and Police Stops'],['Heat, Busted & Wasted','players-handbook','Heat and the Police'],['All shifts and callouts','jobs-handbook','Start and finish a shift'],['Shops, theft & services','players-handbook','Money and Shops'],['Equipment, drugs & perks','players-handbook','Kit'],['Rep 1–33','players-handbook','Rep and Levelling'],['Blower, radio, sat nav, crew bar & watch','players-handbook','Blower, Radio and Sat Nav'],['Missions & faction standing','players-handbook','Missions and Faction Standing']];
replacements.set('rules-reference|Guide Index',p('The current rules are grouped below. The short Player Guide gets you started; the Player’s Handbook gives the full tables. The GM books, mission careers and venue keys keep their restricted ownership.')+table(['Looking for','Open'],rulesTopics.map(([topic,k,n])=>[topic,link(k,n)]))+box('Current chase flow','Assistance is off by default. PCs and police take separate turns; civilian traffic shares one phase. Resolve the current chat card, then Done or Continue. Begin each new round when the table is ready.'));

function bodyOf(html) {
  const {document}=parseHTML(`<html><body>${html}</body></html>`), body=document.body;
  // Strip release wrappers and old appended patch notes, retaining every story block.
  for(const node of body.querySelectorAll('.sj-status,.sj-nav,.sj-footer,.sj-live-rules,.sj-standing-rules')) node.remove();
  for(const node of body.querySelectorAll('aside.sj-box')) if(node.querySelector('b')?.textContent==='At the table'&&node.textContent.includes('Renown and Influence are shared crew standing'))node.remove();
  for(const node of body.querySelectorAll('.sj-page-body,.smoke-journal')) node.replaceWith(...node.childNodes);
  for(const k of body.querySelectorAll('.book-kicker')) k.remove();
  // The 0.5.1 chase addendum is only present on pages replaced above.
  return body;
}
function missionRules(m) {
  const rewards=m.rewards||{}, rows=[];
  if(rewards.fee) rows.push(['Crew fee',`£${rewards.fee} shared; each registered PC gets floor(£${rewards.fee} ÷ crew count).`]);
  if(rewards.cash) rows.push(['Per-head cash',`£${rewards.cash} to each registered PC.`]);
  rows.push(['XP',`${rewards.xp||0} to each registered PC.`]);
  for(const [k,v]of Object.entries(rewards.rep||{})) rows.push(['Personal standing',`${k}: +${v} for each registered PC.`]);
  for(const [k,v]of Object.entries(rewards.renown||{})) rows.push(['Crew Renown',`${k}: +${v}.`]);
  if(rewards.renownPick?.length)rows.push(['Crew Renown',`Choose ${rewards.renownPick.join(' or ')}: +${rewards.renownAmount||1}.`]);
  if(rewards.influence)rows.push(['Influence',`Restore ${rewards.influence} with the paying faction, capped by rank.`]);
  const requires=(m.requires||[]).map(id=>{const req=missions.missions.find(x=>x.id===id);return req?.code||`M${req?.n||id}`;});
  const gate=[...requires,...(m.gate?[`${m.faction} Renown ${m.gate}`]:[])].join(' · ')||'No predecessor / Renown gate';
  return `<section class="sj-live-rules"><span class="sj-kicker">MISSION BOARD · ${esc(m.code||`M${m.n}`)}</span>${p(`<b>Offer:</b> ${esc(gate)}. Suggested personal Rep ${m.minRep||1}; the Board’s predecessor and faction gates control availability.`)}${table(['Objective','Tracked by'],m.objectives.map(o=>[esc(o.text),o.auto?`Automatic ${esc(o.auto.on)} event${o.auto.count?` × ${o.auto.count}`:''}`:'GM / Self-play tick']))}${table(['Reward','Current payout'],rows)}${p('Fencing and shift payments are separate. The GM runs story decisions; Self-play owners can tick objectives in that mode. Register the crew before starting.')}</section>`;
}
const missionByPage=new Map(missions.missions.map(m=>[m.pageUuid?.split('.').at(-1),m]));
quickStart.forEach((page,i)=>missionByPage.set(page._id,missions.missions[i]));
let replaced=0, preserved=0;
for(const j of data.journals) {
  const key=j.flags[NS].contentKey, oldEdition=j.flags[NS].guideEdition;
  j.flags[NS].guideEdition=VERSION;
  for(const [i,page] of j.pages.entries()) {
    const old=page.text?.content||'', hk=`${key}|${page.name}`;
    history[hk]=[...new Set([...(history[hk]||[]),...(old?[textHash(old)]:[])])];
    let body=bodyOf(replacements.get(hk)??old); replacements.has(hk)?replaced++:preserved++;
    const mission=missionByPage.get(page._id);
    if(mission){
      // Remove obsolete mechanical reward paragraphs; keep hooks, scenes and texts.
      for(const title of [...body.querySelectorAll('h2,h3')]) {
        if(!/^(the )?(pay[- ]?out|rewards?|the wonga|getting paid|payday)/i.test(title.textContent.trim()))continue;
        let next=title.nextElementSibling;title.remove();
        while(next&&!/^H[23]$/.test(next.tagName)){const after=next.nextElementSibling;next.remove();next=after;}
      }
      const cover=body.querySelector('.sj-cover,.sj-mission');
      if(cover)cover.insertAdjacentHTML('afterend',missionRules(mission));else body.insertAdjacentHTML('afterbegin',missionRules(mission));
      // The expanded opening prose still called the first bonus £40; its board award is £60.
      body.innerHTML=body.innerHTML.replaceAll("Pat's £40 bonus","Pat's £60 mission award").replaceAll('Pat’s £40 bonus','Pat’s £60 mission award');
      for(const para of body.querySelectorAll('p')){
        if(para.textContent.includes('Track a gap from 2:'))para.innerHTML='If it becomes a vehicle pursuit, use the Combat Console for individual actions and resolve each driving or defence card before moving on. For a non-combat tail, use opposed Wheels checks agreed with the GM. The police-shift gap mini-game belongs to callouts, not this story scene.';
        if(para.textContent.includes('respray costs £400 for a car'))para.innerHTML='Kwik Spray is on the Haggerston &amp; London Fields map. Use Local services for its current quote: the default respray costs £100 and needs police out of sight. Any reimbursement from Pat is a separate story agreement.';
      }
    }
    if(key.startsWith('faction-')&&i===0)body.insertAdjacentHTML('beforeend','<section class="sj-standing-rules">'+box('At the table','Renown and Influence are shared crew standing, shown on the Mission Board. Mission rewards restore listed Influence up to the rank cap. The GM agrees favour costs, keys, access and changes in stance; the fiction below supplies those decisions. '+link('players-handbook','Missions and Faction Standing','Standing rules'))+'</section>');
    // Give every page the same cover and readable hierarchy without double covers.
    let cover=body.querySelector('.sj-cover,.sj-mission');
    if(!cover){
      const leading=body.querySelector('h1');if(leading)leading.remove();
      const colour=key.startsWith('gm')?'blue':key==='rules-reference'?'cy':key==='jobs-handbook'?'green':'orange';
      body.insertAdjacentHTML('afterbegin',`<header class="sj-cover ${colour}"><div><span class="sj-kicker">${esc(j.name)}</span><h1>${esc(page.name)}</h1><p>${j.ownership.default?'THE CREW’S REFERENCE':'GM FILE · TABLE NOTES'}</p></div></header>`);
    }
    for(const t of [...body.querySelectorAll('table')]){
      t.classList.add('sj-table');
      if(!t.parentElement?.classList.contains('sj-table-scroll')){const d=body.ownerDocument.createElement('div');d.className='sj-table-scroll';t.replaceWith(d);d.append(t);}
      t.parentElement.setAttribute('tabindex','0');t.parentElement.setAttribute('role','region');t.parentElement.setAttribute('aria-label','Scrollable reference table');
      for(const th of t.querySelectorAll('thead th'))th.setAttribute('scope','col');
    }
    const nav=[];
    if(i)nav.push(link(key,j.pages[i-1].name,'← Previous'));
    nav.push(link('rules-reference','Guide Index','Rules index'));
    if(i<j.pages.length-1)nav.push(link(key,j.pages[i+1].name,'Next →'));
    const access=j.ownership.default?'CREW COPY':'GM FILE';
    page.text={...page.text,format:1,content:`<article class="smoke-journal sj-console" data-smoke-edition="${VERSION}"><div class="sj-status"><span>THE SMOKE / FIELD GUIDE</span><span>${access} · v${VERSION}</span></div><nav class="sj-nav" aria-label="Journal navigation">${nav.join('<span aria-hidden="true"> / </span>')}</nav><div class="sj-page-body">${body.innerHTML}</div><footer class="sj-footer"><span>${esc(j.name)}</span><span>${i+1} / ${j.pages.length} · RULES ${VERSION}</span></footer></article>`};
    page.flags[NS]={...page.flags[NS],textHash:textHash(page.text.content),guideEdition:VERSION,sourcePageId:page._id,sourceName:page.name};
    // Embedded ownership inherits the journal. Keep all GM guides restricted.
    page.ownership={default:-1};
  }
}
data.version=JSON.parse(await fs.readFile(path.join(ROOT,'system.json'),'utf8')).version;await write('content.json',data);await write('guide-history.json',history);
// The editable JSON source and prebuilt pack contain exactly the same HTML.
source.journals=data.journals.map(j=>({...(source.journals.find(s=>s.key===j.flags[NS].contentKey||s.name===j.name)||{}),key:j.flags[NS].contentKey,name:j.name,pages:j.pages.map(p=>({name:p.name,html:p.text.content,wrapped:true}))}));
source.version=VERSION;await write('london-guides.json',source);

if(!process.argv.includes('--json-only')) {
  const pack=path.join(ROOT,'packs/guides'), stage=path.join(ROOT,'packs/.guides-build');
  const previous=new ClassicLevel(pack,{valueEncoding:'json'});await previous.open();
  const records=new Map();for await(const [key,v]of previous.iterator())records.set(key,v);await previous.close();
  await fs.rm(stage,{recursive:true,force:true});const db=new ClassicLevel(stage,{valueEncoding:'json'});await db.open();
  const releaseTime=Date.parse('2026-10-19T12:00:00Z');
  const stats=old=>({...old?._stats,createdTime:old?._stats?.createdTime??releaseTime,coreVersion:old?._stats?.coreVersion||'14.359',systemId:NS,systemVersion:VERSION,modifiedTime:releaseTime,lastModifiedBy:null});
  const batch=[];
  for(const j of data.journals){
    const rootKey=`!journal!${j._id}`, old=records.get(rootKey);
    batch.push({type:'put',key:rootKey,value:{...j,pages:j.pages.map(p=>p._id),folder:null,_stats:stats(old)}});
    for(const page of j.pages){const k=`!journal.pages!${j._id}.${page._id}`;batch.push({type:'put',key:k,value:{...page,_stats:stats(records.get(k))}});}
  }
  await db.batch(batch);await db.compactRange('','\uffff');await db.close();
  const verify=new ClassicLevel(stage,{valueEncoding:'json'});await verify.open();let count=0;for await(const [k,v]of verify.iterator()){JSON.stringify(v);count++;}await verify.close();
  if(count!==data.journals.length+data.journals.reduce((s,j)=>s+j.pages.length,0))throw new Error('Incomplete guide pack');
  await fs.rm(pack,{recursive:true,force:true});await fs.rename(stage,pack);
}
console.log(JSON.stringify({version:VERSION,journals:data.journals.length,pages:data.journals.reduce((s,j)=>s+j.pages.length,0),rewritten:replaced,storyPagesStyled:preserved}));
