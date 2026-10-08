import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const layout=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8'));
function load(file,extra={}){
 const source=fs.readFileSync(path.join(root,'apps/web/src',file),'utf8').replace(/^import .*;\r?\n/gm,'');
 const context={exports:{},structuredClone,classicUiLayout:()=>layout,...extra};vm.createContext(context);
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return context.exports;
}
class Element{
 constructor(page){this.dataset=page?{characterPage:page}:{};this.hidden=false;this.children=[];this.style={};this.handlers={};this.textContent='';}
 addEventListener(name,fn){this.handlers[name]=fn;}
 append(...children){children.forEach(child=>{child.parentElement=this;});this.children.push(...children);}
 replaceChildren(...children){this.children.forEach(child=>{child.parentElement=null;});this.children=[];this.append(...children);this.textContent='';}
 setAttribute(name,value){this[name]=value;}
 matches(selector){return selector.includes(`"${this.dataset.characterPage}"`);}
 closest(){return null;}
}
const pages=['paperdoll','status','state','skills'].map(p=>new Element(p)),equipment=new Element(),actor=new Element(),candidate=new Element();
const previous=new Element(),next=new Element();previous.dataset.characterCycle='previous';next.dataset.characterCycle='next';
const window=new Element();window.querySelectorAll=selector=>selector==='[data-character-page]'?pages:selector==='[data-character-cycle]'?[previous,next]:[candidate];
window.querySelector=selector=>selector==='#equipment-items'?equipment:selector==='#paperdoll-actor'?actor:null;
const {showCharacterPage,wireCharacterPageButtons,nativeWindowPositionVersion}=load('character-window.ts');
const visited=[];wireCharacterPageButtons(window,page=>{visited.push(page);showCharacterPage(window,page);});showCharacterPage(window,'paperdoll');
assert.equal(equipment.hidden,false);assert.equal(actor.hidden,false);assert.equal(candidate.hidden,true);
for(const expected of ['status','state','skills','paperdoll']){next.handlers.click();assert.equal(window.dataset.characterPage,expected);assert.equal(pages.filter(p=>!p.hidden)[0].dataset.characterPage,expected);assert.equal(equipment.hidden,expected!=='paperdoll');assert.equal(actor.hidden,expected!=='paperdoll');}
previous.handlers.click();assert.equal(window.dataset.characterPage,'skills');
assert.equal(nativeWindowPositionVersion('character-window'),layout.nationalCharacterWindow.positionVersion);
assert.equal(nativeWindowPositionVersion('inventory-window'),layout.nationalInventoryWindow.positionVersion);
assert.equal(nativeWindowPositionVersion('npc-dialog'),'');
console.log('PASS shared character arrows cycle all four pages, wrap both ways and hide equipment outside its page');

const status=new Element('status'),state=new Element('state'),name=new Element();status.id='character-panel';
const document={createElement:()=>new Element()};
const {CharacterPanel}=load('character-panel.ts',{document,nationalUsesLayout:()=>true,applyNationalCharacterStats:()=>{},loadNativeUiFont:()=>new Promise(()=>{})});
const panel=new CharacterPanel(status,state,name,()=> 'OriginalFixture');
const ability={level:29,job:0,gold:500,gameGold:0,ac:{min:4,max:14},mac:{min:2,max:3},dc:{min:11,max:29},mc:{min:0,max:0},sc:{min:0,max:0},hp:397,maxHp:397,mp:113,maxMp:113,experience:5070,maxExperience:10000,weight:138,maxWeight:330,wearWeight:35,maxWearWeight:57,handWeight:27,maxHandWeight:77};
panel.replace(ability);assert.equal(name.textContent,'OriginalFixture');
assert.deepEqual(status.children.filter(x=>x.className==='classic-stat-value').map(x=>x.style.top),layout.nationalCharacterWindow.statValues.tops.map(x=>`${x}px`));
assert.equal(state.children.some(x=>x.textContent==='准确度'),false,'unknown secondary attributes must not be invented');
panel.secondary({antiMagic:1,hit:17,speed:15,antiPoison:0,poisonRecover:0,healthRecover:0,spellRecover:0});
assert.equal(state.children.find(x=>x.textContent==='50.70%')?.className,'classic-stat-value');
assert.equal(state.children.find(x=>x.textContent==='+10%')?.className,'classic-stat-value');
assert.equal(state.children.find(x=>x.textContent==='17')?.style.left,`${layout.nationalCharacterWindow.stateRows.valueX}px`);
panel.resources({hp:300});assert.equal(status.children.some(x=>x.textContent==='300/397'),true);
panel.clear();assert.equal(name.textContent,'');assert.equal(state.children.length,0);panel.replace(ability);assert.equal(state.children.some(x=>x.textContent==='17'),false,'secondary state must not leak between characters');
console.log('PASS native stats use authoritative primary/secondary values, character name and reset all secondary state');

const {applyNationalCharacterStats}=load('classic-layout.ts',{uiLayout:layout,uiInteractions:{}});
const statusLabel={style:{}},stateLabel={style:{}};
const actualStatus={querySelectorAll:selector=>selector==='.classic-stat'?[statusLabel]:[]};
const selectedWindow={id:'character-window',matches:()=>false,getAttribute:()=> 'status',querySelector:()=>actualStatus,querySelectorAll:()=>[statusLabel,stateLabel]};
applyNationalCharacterStats(selectedWindow);
assert.equal(statusLabel.style.display,'none');assert.equal(stateLabel.style.display,undefined,'selected window must not hide other page labels');
console.log('PASS selecting status cannot hide state-page labels through the window selected-page marker');

const requests=[],element=new Element();element.querySelectorAll=()=>element.children;
const {PaperdollView}=load('paperdoll.ts',{document,playerLayers:feature=>({sex:feature}),loadNationalUiLibrary:()=>new Promise(resolve=>requests.push(resolve)),uiFrame:(_lib,index)=>({file:`${index}.png`,width:168,height:199}),nationalUiUrl:(_lib,frame)=>`/ui-national/prguse/${frame.file}`});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const doll=new PaperdollView(element);doll.setFeature(0);doll.setFeature(1);requests[1]({});await flush();assert.equal(element.children[0].src,'/ui-national/prguse/377.png');requests[0]({});await flush();assert.equal(element.children[0].src,'/ui-national/prguse/377.png','late old-sex callback must not repaint current body');
doll.clear();assert.equal(element.children.length,0);doll.setFeature(0);doll.clear();requests[2]({});await flush();assert.equal(element.children.length,0);
console.log('PASS character paperdoll uses dedicated native sex frames and rejects late character callbacks');

function bitmapFixture(includeTitle=false){
 const status=new Element('status'),state=new Element('state'),requests=[],painted=[];
 status.id='character-panel';status.isConnected=state.isConnected=true;
 const document={createElement:()=>{const node=new Element();node.ownerDocument=document;return node;}};
 status.ownerDocument=state.ownerDocument=document;
 const font={prepare:text=>new Promise((resolve,reject)=>requests.push({text,resolve,reject})),measure:text=>[...text].reduce((width,ch)=>width+(ch.charCodeAt(0)<128?6:12),0),paint:(canvas,text,options)=>{canvas.bitmapText=text;painted.push({text,...options});}};
 const {CharacterPanel}=load('character-panel.ts',{document,nationalUsesLayout:()=>true,applyNationalCharacterStats:()=>{},loadNativeUiFont:async()=>font});
 const title=includeTitle?new Element():undefined;let characterName='AB';
 if(title){title.ownerDocument=document;title.isConnected=true;let literal='';Object.defineProperty(title,'textContent',{get:()=>literal,set:value=>{title.children.forEach(child=>{child.parentElement=null;});title.children=[];literal=value;}});}
 return {status,state,title,requests,painted,name:value=>{characterName=value;},panel:new CharacterPanel(status,state,title,()=>characterName)};
}
{
 const f=bitmapFixture();f.state.hidden=true;f.panel.replace(structuredClone(ability));await flush();
 const stale=f.status.children.filter(node=>node.className==='classic-stat-value');
 f.panel.resources({hp:300});await flush();
 f.requests[2].resolve();f.requests[3].resolve();await flush();
 const hp=f.status.children.find(node=>node.textContent==='300/397');
 assert.equal(hp.children[0].bitmapText,'300/397');assert.equal(hp.style.textAlign,'left');assert.equal(hp.style.color,'transparent');
 assert.ok(f.painted.filter(node=>node.color==='#ffffff').every(node=>node.outline===false));
 assert.ok(f.painted.filter(node=>node.color==='#c0c0c0').every(node=>node.outline===false));
 assert.equal(f.state.hidden,true,'late fonts must not change page visibility');
 f.requests[0].resolve();f.requests[1].resolve();await flush();
 assert.ok(stale.every(node=>node.children.length===0),'old authoritative values cannot acquire late canvases');
 f.panel.secondary({antiMagic:1,hit:17,speed:15,antiPoison:0,poisonRecover:0,healthRecover:0,spellRecover:0});await flush();
 assert.ok(f.requests.at(-1).text.includes('+10%'));f.panel.clear();f.requests.at(-1).resolve();f.requests.at(-2).resolve();await flush();
 assert.equal(f.status.children.length,0);assert.equal(f.state.children.length,0);
 console.log('PASS actual character controller paints latest authoritative values in each native style and rejects stale/cleared callbacks without revealing hidden pages');
}
{
 const f=bitmapFixture();f.panel.replace(structuredClone(ability));await flush();
 f.requests[0].reject(new Error('offline'));f.requests[1].reject(new Error('offline'));await flush();
 const diagnostic=f.state.children.find(node=>node.className==='native-character-font-error');
 assert.equal(diagnostic.role,'alert');assert.equal(f.state.children.filter(node=>node.className==='native-character-font-error').length,1);
 assert.equal(f.painted.length,0,'failure must not expose local-font or partly drawn values');
 diagnostic.children[1].handlers.click();await flush();
 f.requests[2].resolve();f.requests[3].resolve();await flush();
 assert.equal(f.state.children.some(node=>node.className==='native-character-font-error'),false);
 assert.equal(f.state.children.find(node=>node.textContent==='50.70%').children[0].bitmapText,'50.70%');
 f.panel.resources({hp:250});await flush();f.status.isConnected=f.state.isConnected=false;
 f.requests[4].resolve();f.requests[5].resolve();await flush();
 assert.ok(f.status.children.every(node=>node.children.length===0));
 console.log('PASS actual character controller exposes one scoped retry per failed page, recovers from current authority and ignores detached roots');
}

{
 const f=bitmapFixture(true);f.title.hidden=true;f.panel.replace(structuredClone(ability));await flush();
 f.name('下一位');f.panel.resources({hp:300});await flush();
 f.requests.slice(3).forEach(request=>request.resolve());await flush();
 assert.equal(f.title.children.length,1);assert.equal(f.title.children[0].bitmapText,'下一位');
 const paint=f.painted.find(value=>value.text==='下一位');
 assert.deepEqual({width:paint.width,height:paint.height,left:paint.left,top:paint.top,color:paint.color,outline:paint.outline},{width:168,height:14,left:66,top:1,color:'#ffffff',outline:false});
 f.requests.slice(0,3).forEach(request=>request.resolve());await flush();
 assert.equal(f.title.children.length,1,'old same-root title callbacks must not append a second name');
 assert.equal(f.title.hidden,true);assert.equal(f.panel.debugState().hp,300);
 f.name('ClearMe');f.panel.currency({gold:700});await flush();f.panel.clear();f.requests.slice(-3).forEach(request=>request.resolve());await flush();
 assert.equal(f.title.textContent,'');assert.equal(f.title.children.length,0);
 console.log('PASS title uses latest authoritative name, centered raw white glyphs, and rejects old same-root/clear callbacks without changing hidden state');
}
{
 const f=bitmapFixture(true);f.panel.replace(structuredClone(ability));await flush();
 f.requests[0].reject(new Error('title offline'));f.requests[1].resolve();f.requests[2].resolve();await flush();
 const diagnostic=f.title.children[0];assert.equal(diagnostic.className,'native-character-font-error native-character-font-error--title');assert.equal(diagnostic.role,'alert');
 diagnostic.children[1].handlers.click();await flush();f.requests.slice(3).forEach(request=>request.resolve());await flush();
 assert.equal(f.title.children.length,1);assert.equal(f.title.children[0].bitmapText,'AB');
 assert.equal(f.panel.debugState().gold,500);
 f.name('Detached');f.panel.resources({hp:250});await flush();f.title.isConnected=false;f.requests.slice(-3).forEach(request=>request.resolve());await flush();
 assert.equal(f.title.children.length,0);
 console.log('PASS title has a scoped failure/retry that preserves authority and ignores a detached title root');
}
