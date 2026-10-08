import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const layout=JSON.parse(read('content/classic-176/ui-layout.json'));
const library=JSON.parse(read('assets/web/ui-national/prguse/library.json'));
const classicUi=ts.createSourceFile('classic-ui.ts',read('apps/web/src/classic-ui.ts'),ts.ScriptTarget.Latest,true);
const frameHelpers=classicUi.statements.filter(s=>ts.isFunctionDeclaration(s)&&['uiFrame','nationalUiUrl','applyNationalUiFrame'].includes(s.name?.text)).map(s=>s.getText(classicUi)).join('\n');
const strip=p=>read(p).replace(/^import .*;\r?\n/gm,'');
class Element{
 constructor(){this.style={setProperty(k,v){this[k]=v;}};this.dataset={};this.children=[];this.attributes={};this.textContent='';this.hidden=false;const classes=new Set();this.classList={add(...names){names.forEach(n=>classes.add(n));},toggle(n,on){if(on)classes.add(n);else classes.delete(n);},contains:n=>classes.has(n)};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 querySelector(selector){return selector==='img'?this.children[0]??null:null;}
 querySelectorAll(){return [];}
 setAttribute(k,v){this.attributes[k]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 removeAttribute(k){delete this.attributes[k];}
}
function fixture({delay=false,national=true,includeFallback=false}={}){
 const nodes=new Map(),rootElement=new Element(),bodyElement=new Element();
 const node=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);};
 rootElement.querySelector=node;rootElement.ownerDocument={querySelector:node};
 let resolve;
 const session=new Promise(r=>{resolve=r;});
 const legacyFrames=[];
 const context={exports:{},NativeHudLabels:class{constructor(_root,level,location){this.level=level;this.location=location;}setLevel(value){this.level.textContent=value;}setLocation(value){if(this.location)this.location.textContent=value;}},uiLayout:layout,uiInteractions:JSON.parse(read('content/classic-176/ui-interactions.json')),document:{body:bodyElement,createElement:()=>new Element(),querySelector:node},Image:Element,arrangeSkillSlots:skills=>{const slots=Array(8).fill(undefined);for(const skill of skills??[])if(Number.isInteger(skill.key)&&skill.key>=49&&skill.key<=56&&!slots[skill.key-49])slots[skill.key-49]=skill;return slots;},skillIconIndexOf:()=>0,resolveIconFrame:()=>({status:'missing'}),loadClassicUiSession:()=>session,uiUrl:(name,f)=>`/ui/${name}/${f.file}`,applyUiFrame:(element,name,frame)=>legacyFrames.push({element,name,frame}),skinServiceWindow:()=>false,bindNativeFrameButtonStates(_button,paint){paint('normal');}};
 vm.createContext(context);
 const source=`${frameHelpers}\n${strip('apps/web/src/classic-layout.ts')}\n${strip('apps/web/src/classic-hud.ts')}`;
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const hud=new context.exports.ClassicHud(rootElement,()=>false);
 // Candidate fallback is unavailable locally: its unrelated assets are boundary fakes.
 const fallback={frames:new Proxy(library.frames,{get:(frames,key)=>frames[key]??{...frames['4'],file:'fallback-fixture.png'}})};
 const mount=()=>resolve({fallback:!national||includeFallback?new Map([['Prguse',fallback]]):new Map(),national:national?new Map([['prguse',library]]):new Map(),missingNational:[]});
 if(!delay)mount();
 return {hud,node,mount,legacyFrames,body:bodyElement};
}
const attrs={level:27,job:0,gold:123,hp:50,maxHp:100,mp:25,maxMp:50,experience:25,maxExperience:100,weight:10,maxWeight:100};
let passed=0,failed=0;
async function test(name,action){try{await action();passed++;console.log('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+' / '+(e.stack||e.message));}}
await test('national mode suppresses candidate resource labels after async mount and later updates',async()=>{
 const f=fixture({delay:true});f.hud.replaceAttributes(attrs);
 assert.equal(f.node('[data-hud-hp]').hidden,false);
 f.mount();await f.hud.ready();
 for(const selector of ['[data-hud-hp]','[data-hud-mp]','[data-hud-exp]','[data-hud-gold]','[data-hud-status]'])assert.equal(f.node(selector).hidden,true,selector);
 f.hud.resource({hp:10,mp:0});f.hud.currency({gold:999});f.hud.status(0x80000000);
 for(const selector of ['[data-hud-hp]','[data-hud-mp]','[data-hud-exp]','[data-hud-gold]','[data-hud-status]'])assert.equal(f.node(selector).hidden,true,selector);
 assert.equal(f.node('[data-hud-hp]').textContent,'10/100');
});
await test('warrior below 28 uses full HP globe and empty globe asset',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);
 const well=f.node('.hud-orb-well.hp'),fill=f.node('[data-hud-hp-fill]');
 assert.equal(well.style.left,'38px');assert.equal(well.style.top,'90px');assert.equal(well.style.width,'94px');assert.equal(well.style.height,'92px');
 assert.equal(fill.style.height,'46px');assert.match(fill.children[0].src,/6\.acc5fe/);
 assert.equal(fill.children[0].style.width,'96px');assert.equal(fill.children[0].style.height,'92px');
 assert.match(f.node('.hud-orb-well.hp [data-hud-orb-image]').style.backgroundImage,/5\.0057ce/);
 assert.equal(f.node('.hud-orb-well.mp').hidden,true);
});
await test('level 28 switches the same warrior to native split HP MP crop',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);f.hud.level(28,25);
 assert.equal(f.node('.hud-orb-well.hp').style.left,'40px');assert.equal(f.node('.hud-orb-well.hp').style.top,'91px');assert.equal(f.node('.hud-orb-well.hp').style.width,'45px');
 assert.equal(f.node('.hud-orb-well.mp').style.left,'87px');assert.equal(f.node('.hud-orb-well.mp').style.width,'44px');assert.equal(f.node('.hud-orb-well.mp').hidden,false);
 assert.equal(f.node('[data-hud-mp-fill]').children[0].style.left,'-47px');assert.equal(f.node('[data-hud-hp-fill]').style.height,'45px');
 assert.equal(f.node('.hud-orb-well.hp [data-hud-orb-image]').hidden,true);
});
await test('mage and taoist use split globe below 28',async()=>{
 for(const job of [1,2]){const f=fixture();await f.hud.ready();f.hud.replaceAttributes({...attrs,job,level:1});assert.equal(f.node('.hud-orb-well.mp').hidden,false);assert.match(f.node('[data-hud-hp-fill]').children[0].src,/4\.0f052/);}
});
await test('resource updates crop from original bottom pixels and keep images',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);const image=f.node('[data-hud-hp-fill]').children[0];
 f.hud.resource({hp:0});assert.equal(f.node('[data-hud-hp-fill]').style.height,'0px');
 f.hud.resource({hp:100});assert.equal(f.node('[data-hud-hp-fill]').style.height,'92px');assert.equal(f.node('[data-hud-hp-fill]').children[0],image);
});
await test('Delphi Round ties to even for cropped globe pixels',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes({...attrs,job:1,hp:1,maxHp:180});assert.equal(f.node('[data-hud-hp-fill]').style.height,'0px');
 f.hud.resource({hp:3});assert.equal(f.node('[data-hud-hp-fill]').style.height,'2px');
});
await test('missing positive HP or MP maximum suppresses both native globes',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes({...attrs,maxMp:0});assert.equal(f.node('.hud-orb-well.hp').hidden,true);assert.equal(f.node('.hud-orb-well.mp').hidden,true);
});
await test('XP and weight use actual frame7 cropped over unfilled board',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);
 for(const s of ['[data-hud-exp-track]','[data-hud-weight]'])assert.equal(f.node(s).style.backgroundImage,'none');
 for(const s of ['[data-hud-exp-fill]','[data-hud-weight-fill]']){assert.match(f.node(s).style.backgroundImage,/7\.c0ab/);assert.equal(f.node(s).style.backgroundSize,'76px 13px');}
 assert.equal(f.node('[data-hud-exp-track]').style.left,'666px');assert.equal(f.node('[data-hud-exp-track]').style.top,'178px');assert.equal(f.node('[data-hud-weight]').style.top,'211px');
 assert.equal(f.node('[data-hud-exp-fill]').style.width,'19px');
});
await test('live weight packet updates HUD without waiting for another resource event',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);f.hud.weights({weight:50,wearWeight:3,handWeight:2});assert.equal(f.node('[data-hud-weight-fill]').style.width,'38px');
 f.hud.weights({weight:100,wearWeight:3,handWeight:2});assert.equal(f.node('[data-hud-weight-fill]').style.width,'76px');
});
await test('XP crop rounds half pixels to even and zero maxima suppress both bars',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes({...attrs,experience:1,maxExperience:152});assert.equal(f.node('[data-hud-exp-fill]').style.width,'0px');
 f.hud.experience(3);assert.equal(f.node('[data-hud-exp-fill]').style.width,'2px');
 f.hud.replaceAttributes({...attrs,maxWeight:0});assert.equal(f.node('[data-hud-exp-fill]').style.width,'0px');assert.equal(f.node('[data-hud-weight-fill]').style.width,'0px');
});
await test('four server hunger states choose frames16 through19 then disappear',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);
 for(let state=1;state<=4;state++){f.hud.hungerStatus(state);const icon=f.node('[data-hud-hunger]');assert.equal(icon.hidden,false);assert.ok(icon.style.backgroundImage.includes(library.frames[String(15+state)].file));assert.equal(icon.style.left,'754px');assert.equal(icon.style.top,'204px');assert.equal(f.node('[data-hud-status]').textContent,`饱食等级 ${state}`);assert.equal(f.node('[data-hud-status]').classList.contains('hud-status-alert'),false);}
 for(const value of [0,-1,5,255,NaN]){f.hud.hungerStatus(value);assert.equal(f.node('[data-hud-hunger]').hidden,true);}
});
await test('native day phase chooses source frame independent of darkness',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);
 for(const [phase,index] of [[0,15],[1,12],[2,13],[3,14]]){f.hud.daylight(phase,2);const icon=f.node('[data-hud-daylight]');assert.equal(icon.hidden,false);assert.ok(icon.style.backgroundImage.includes(library.frames[String(index)].file));assert.equal(icon.style.left,'748px');assert.equal(icon.style.top,'79px');}
 f.hud.daylight(8,1);assert.equal(f.node('[data-hud-daylight]').hidden,true);
});
await test('latest authority received during asset loading paints after mount',async()=>{
 const f=fixture({delay:true});f.hud.replaceAttributes(attrs);f.hud.level(28,50);f.hud.hungerStatus(3);f.hud.daylight(2,0);f.hud.weights({weight:50,wearWeight:0,handWeight:0});f.mount();await f.hud.ready();
 assert.equal(f.node('.hud-orb-well.mp').hidden,false);assert.equal(f.node('[data-hud-weight-fill]').style.width,'38px');assert.ok(f.node('[data-hud-hunger]').style.backgroundImage.includes(library.frames['18'].file));assert.ok(f.node('[data-hud-daylight]').style.backgroundImage.includes(library.frames['13'].file));
});
await test('logout clears globes hunger and weight; fresh role gets correct shape',async()=>{
 const f=fixture();await f.hud.ready();f.hud.replaceAttributes(attrs);f.hud.hungerStatus(4);f.hud.clear();
 assert.equal(f.node('[data-hud-hunger]').hidden,true);assert.equal(f.node('.hud-orb-well.hp').hidden,true);assert.equal(f.node('[data-hud-weight-fill]').style.width,'0px');
 f.hud.replaceAttributes({...attrs,job:2});assert.equal(f.node('.hud-orb-well.mp').hidden,false);
});
await test('legacy asset fallback keeps its old geometry and excludes national indicators',async()=>{
 const f=fixture({national:false});await f.hud.ready();f.hud.replaceAttributes(attrs);assert.ok(f.legacyFrames.length>0);assert.equal(f.node('[data-hud-hp-fill]').style.height,'40px');assert.equal(f.node('[data-hud-job]').hidden,false);assert.equal(f.node('[data-hud-hunger]').hidden,true);assert.equal(f.node('[data-hud-daylight]').hidden,true);
});
await test('national HUD ignores legacy atlases loaded because another national family is missing',async()=>{
 const f=fixture({national:true,includeFallback:true});await f.hud.ready();f.hud.replaceAttributes(attrs);
 assert.equal(f.hud.nationalReady,true);assert.equal(f.legacyFrames.length,0);
 assert.match(f.node('[data-hud-main]').style.backgroundImage,/\/ui-national\/prguse\//);
});
await test('native sound button uses Prguse#11 at reference coordinates and does not steal attack-mode button',async()=>{
 const f=fixture();await f.hud.ready();const sound=f.node('#audio-toggle'),spec=layout.nationalHud.soundToggle,frame=library.frames[String(spec.index)];
 assert.equal(spec.index,11);assert.deepEqual([spec.x,spec.y,spec.width,spec.height],[764,11,24,23]);
 assert.ok(sound.style.backgroundImage.includes('/ui-national/prguse/'+frame.file));
 assert.equal(sound.style.left,'764px');assert.equal(sound.style.top,'11px');assert.equal(sound.style.width,'24px');assert.equal(sound.style.height,'23px');
 const hudSource=read('apps/web/src/classic-hud.ts');assert.doesNotMatch(hudSource,/if\(spec\.id==='attack'\)/);
 assert.match(read('apps/web/src/play.ts'),/button\.dataset\.windowOpen\?\?button\.dataset\.windowTab/);
 assert.match(read('apps/web/src/style.css'),/native-sound-toggle/);
});
await test('HUD hotbar highlight follows selected magic identity and clears after skill snapshot changes',async()=>{
 const f=fixture();await f.hud.ready();const fireball={key:49,magicId:22,name:'火球术',level:1,effect:0};
 f.hud.replaceSkills([fireball,{...fireball,key:50,magicId:23,name:'雷电术'}]);f.hud.selectSkill(23);
 let buttons=f.node('[data-hud-hotbar]').children.filter(button=>button.classList.contains('selected'));
 assert.equal(buttons.length,1);assert.ok(buttons[0].title.startsWith('雷电术 · 1级'));
 f.hud.selectSkill(undefined);assert.equal(f.node('[data-hud-hotbar]').children.some(button=>button.classList.contains('selected')),false);
 f.hud.selectSkill(22);f.hud.replaceSkills([{...fireball,key:49,magicId:24,name:'新技能'}]);
 assert.equal(f.node('[data-hud-hotbar]').children.some(button=>button.classList.contains('selected')),false);
});
await test('national party window skins its action hitzones with the matching native Prguse buttons',async()=>{
 const f=fixture(),panel=new Element(),buttons={create:new Element(),add:new Element(),remove:new Element()};await f.hud.ready();
 for(const [name,button] of Object.entries(buttons)){button.setAttribute('aria-label',name);}
 panel.querySelector=selector=>buttons[selector.slice(7)]??null;
 f.hud.skinWindow(panel,'group');
 assert.match(panel.style.backgroundImage,/\/ui-national\/prguse\/120\./);
 for(const [name,index] of Object.entries({create:123,add:124,remove:125})){
  const button=buttons[name],frame=library.frames[String(index)],position=layout.nationalUtilityWindows.group.buttons[name];assert.match(button.style.backgroundImage,new RegExp(`/ui-national/prguse/${index}\\.`));
  assert.equal(button.style.width,`${frame.width}px`);assert.equal(button.style.height,`${frame.height}px`);assert.equal(button.style.left,`${position.x}px`);assert.equal(button.style.top,`${position.y}px`);assert.ok(fs.existsSync(path.join(root,'assets/web/ui-national/prguse',frame.file)));assert.ok(button.classList.contains('native-frame-button'));
 }
});
await test('national skin uses browser system cursors and keeps Crystal cursor art out of the 2003 UI',async()=>{
 const f=fixture();await f.hud.ready();
 assert.equal(f.body.classList.contains('classic-cursors'),true);
 assert.equal(f.body.style['--cursor-default'],'auto');assert.equal(f.body.style['--cursor-text'],'text');
 assert.equal(f.body.style['--cursor-attack'],'crosshair');assert.equal(f.body.style['--cursor-attack-red'],'crosshair');
 assert.equal(f.body.style['--cursor-npc'],'pointer');assert.equal(f.body.style['--cursor-trash'],'no-drop');
 for(const value of Object.values(f.body.style))assert.doesNotMatch(String(value),/\/ui\/Cursors\//);
});
await test('reference cursor images remain available only to the non-national fallback skin',async()=>{
 const f=fixture({national:false});await f.hud.ready();
 assert.match(f.body.style['--cursor-default'],/Cursor_Default\.CUR/);
 assert.match(f.body.style['--cursor-text'],/Cursor_TextPrompt\.CUR/);
 assert.match(f.body.style['--cursor-attack'],/Cursor_Normal_Atk\.CUR/);
});
console.log(`RESULT: ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
