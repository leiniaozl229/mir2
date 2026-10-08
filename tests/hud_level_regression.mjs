import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const uiLayout=JSON.parse(read('content/classic-176/ui-layout.json'));
const uiInteractions=JSON.parse(read('content/classic-176/ui-interactions.json'));
const strip=p=>read(p).replace(/^import .*;\r?\n/gm,'');
class Element {
 constructor(){this.style={setProperty(name,value){this[name]=value;}};this.dataset={};this.children=[];this.textContent='';this.hidden=false;this.classList={add(){},toggle(){},contains(){return false;}};}
 replaceChildren(...children){this.children=children;}
 append(...children){this.children.push(...children);}
 querySelector(){return null;}
 querySelectorAll(){return [];}
 setAttribute(){}
 removeAttribute(){}
}
const nodes=new Map();
const hudRoot=new Element();
hudRoot.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
const document={body:new Element(),createElement:()=>new Element(),querySelector:()=>null};hudRoot.ownerDocument=document;
let resolveSession;
const session=new Promise(resolve=>{resolveSession=resolve;});
const context={exports:{},NativeHudLabels:class{constructor(_root,level,location){this.level=level;this.location=location;}setLevel(value){this.level.textContent=value;}setLocation(value){if(this.location)this.location.textContent=value;}},uiLayout,uiInteractions,document,
 loadClassicUiSession:()=>session,arrangeSkillSlots:()=>Array(8),Image:Element,
 applyNationalUiFrame(){},uiFrame:()=>({width:100,height:80,file:'fixture.png'}),nationalUiUrl:()=>'/fixture.png'};
vm.createContext(context);
vm.runInContext(ts.transpileModule(`${strip('apps/web/src/classic-layout.ts')}\n${strip('apps/web/src/classic-hud.ts')}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const hud=new context.exports.ClassicHud(hudRoot,()=>false);
const level=nodes.get('[data-hud-level]');
assert.ok(level,'production HUD must bind an explicit level field');
const attributes={level:27,job:0,gold:123,hp:50,maxHp:100,mp:30,maxMp:50,experience:20,maxExperience:100,weight:3,maxWeight:10};
hud.replaceAttributes(attributes);
assert.equal(level.textContent,'27');
hud.level(28,0);
assert.equal(level.textContent,'28');
assert.equal(nodes.get('[data-hud-exp]').textContent,'0/100');
console.log('PASS: HUD authoritative initial attributes and level event update the level field');

// The real async mount must preserve newer authority received while assets load.
resolveSession({fallback:new Map(),national:new Map([['prguse',{}]]),missingNational:[]});
await hud.ready();
assert.equal(level.textContent,'28');
const box=uiLayout.nationalHud.fields.level;
assert.equal(level.style.left,`${box.x}px`);
assert.equal(level.style.top,`${box.y}px`);
assert.equal(box.x+uiLayout.nationalHud.mainDialog.x,660);
assert.equal(box.y+uiLayout.nationalHud.mainDialog.y,496);
assert.equal(nodes.get('[data-hud-job]').hidden,true);
console.log('PASS: national HUD mounts the latest level at the reference source position without job text overlap');

hud.resource({hp:5});hud.currency({gold:456});hud.position('3',10,20);
assert.equal(level.textContent,'28');
hud.clear();assert.equal(level.textContent,'');
hud.level(40,100);assert.equal(level.textContent,'');
hud.replaceAttributes({...attributes,job:2,level:1});assert.equal(level.textContent,'1');
console.log('PASS: resource updates preserve level; logout clears it and new character replaces it');

for(const page of ['apps/web/play.html','apps/web/ui-calibration.html']){
 const html=read(page);assert.equal((html.match(/data-hud-level/g)||[]).length,1);assert.equal(html.includes('data-hud-name'),false);
}
console.log('PASS: play and calibration pages both mount the production level field');
