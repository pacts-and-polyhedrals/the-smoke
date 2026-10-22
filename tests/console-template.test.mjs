// Validate the console's conditional markup in every new branch without a browser or external dependencies.
// Live Foundry still supplies the actual Handlebars engine; this checks block pairing and the rendered controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../templates/combat-console.hbs',import.meta.url),'utf8');
const root=[], stack=[{yes:root}];
for(const part of src.split(/({{[\s\S]*?}})/g)) {
 const top=stack.at(-1),out=top.other?top.no:top.yes;
 if(!part.startsWith('{{')) {out.push(part);continue;}
 const t=part.slice(2,-2).trim();
 if(t.startsWith('#')) {const [,kind,expr]=/^#(\w+)\s+([\s\S]+)$/.exec(t)??[];assert.ok(['if','each'].includes(kind));const n={kind,expr,yes:[],no:[]};out.push(n);stack.push(n);}
 else if(t==='else') {assert.ok(stack.length>1);stack.at(-1).other=true;}
 else if(t.startsWith('/')) {assert.equal(stack.pop().kind,t.slice(1));assert.ok(stack.length);}
 else out.push({expr:t});
}
assert.equal(stack.length,1,'every Handlebars block closes');
const get=(o,p)=>p==='this'?o:p.split('.').reduce((x,k)=>x?.[k],o);
const val=(e,o)=>{const m=/^\(eq\s+(\S+)\s+"([^"]*)"\)$/.exec(e);return m?String(get(o,m[1]))===m[2]:get(o,e);};
const truth=x=>!!x&&(!Array.isArray(x)||x.length>0);
function render(nodes,o){return nodes.map(n=>typeof n==='string'?n:n.kind==='if'?render(truth(val(n.expr,o))?n.yes:n.no,o):n.kind==='each'?((val(n.expr,o)||[]).map(v=>render(n.yes,v)).join('')||render(n.no,o)):String(val(n.expr,o)??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')).join('');}
function balanced(html){const tags=[];for(const m of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){const tag=m[1].toLowerCase();if(['img','input','br','hr','meta','link','i-frame'].includes(tag))continue;if(m[0].startsWith('</'))assert.equal(tags.pop(),tag,`mismatched ${m[0]}`);else tags.push(tag);}assert.deepEqual(tags,[]);return html;}
const base={combat:true,isGM:true,canManage:true,phase:'resolve',phaseLabel:'Action',round:1,rows:[],queue:[{name:'PC',value:6,now:true}],current:{name:'PC',mine:true,npc:false,value:6,cover:[],weapons:[]}};
let count=0;const check=o=>{count++;return balanced(render(root,o));};
for(const isGM of [true,false])for(const canStart of [true,false]){const html=check({combat:false,isGM,canStart,selected:2});assert.equal(html.includes('data-start-chase'),canStart);assert.equal(html.includes('data-start>'),isGM&&canStart);}
for(const auto of [true,false])for(const busy of [true,false])for(const review of [true,false])for(const hasPending of [true,false]){
 const o={...base,chase:{auto,reason:'Pursuit'},current:{name:'All civilian traffic',npc:true,traffic:true},npc:true,busy,review,hasPending,pending:hasPending?['Driver: evasive manoeuvre']:[],canRunNPC:!busy&&!review&&!hasPending};
 const html=check(o);assert.equal(html.includes('data-npc-turn'),!busy&&!review&&!hasPending);
 if(review&&!busy)assert.match(html,/data-next(?: disabled)?\s*>Continue/);
 if(review&&!busy&&hasPending)assert.match(html,/data-next disabled>Continue/);
}
for(const phase of ['intent','idle','resolve'])for(const canManage of [true,false])check({...base,phase,canManage,chase:{auto:true},current:phase==='resolve'?base.current:null});
check({...base,gauge:{name:'Fiesta',moved:8,red:16,band:'yellow',label:'Pushing it',pg:50,py:25,pr:25,at:50,left:8},current:{...base.current,driving:true,seated:true}});
const story=check({...base,isGM:false,canManage:false,chase:{auto:false,mode:'manual'}});assert.ok(!story.includes('data-chase-mode'));
const self=check({...base,isGM:false,canManage:true,chase:{auto:false,mode:'manual'}});assert.ok(self.includes('data-chase-mode=\"full\"')===false?self.includes('data-chase-mode="full"'):true);assert.ok(!self.includes('data-end-fight'));assert.ok(!self.includes('data-end-chase'));
const locked=check({...base,hasPending:true,pendingDetails:[{kind:'drive',pid:'p1',tokenId:'v1',text:'Recorded roll needs review',canReview:true}],chase:{mode:'full',full:true,auto:true}});
assert.ok(locked.includes('data-review-prompt="v1:p1"'));assert.ok(locked.includes('data-chase-mode="full"'));
console.log(`console template: ${count} conditional renders, balanced markup, response-gated Continue and mode-specific controls — ok`);
