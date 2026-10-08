import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root=process.cwd();
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners=new Map();this.disabled=false;this.hidden=false;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(type,fn){const list=this.listeners.get(type)??[];list.push(fn);this.listeners.set(type,list);}
 closest(){return this.nativeWindow;}
 get classList(){return {add:name=>{this.className+=` ${name}`;}};}
 emit(type,event={}){for(const fn of this.listeners.get(type)??[])fn(event);}
 querySelectorAll(selector){const found=[];const walk=node=>{for(const child of node.children??[]){if(child&&typeof child==='object'){if(selector==='.skill-icon'&&child.className==='skill-icon')found.push(child);walk(child);}}};walk(this);return found;}
}
const clock=new Map();let nextTimer=1;
const document={...new Element(),hidden:false,createElement:tag=>new Element(tag)};
document.addEventListener=Element.prototype.addEventListener.bind(document);document.emit=Element.prototype.emit.bind(document);
const window=new Element();
const skillInput=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/skill-input.json'),'utf8'));
const activeSources=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/active-asset-sources.json'),'utf8'));
const iconUsage=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/icon-usage.json'),'utf8'));
const iconSource=fs.readFileSync(path.join(root,'apps/web/src/icon-frames.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
const source='const activeSources='+JSON.stringify(activeSources)+';\nconst skillInput='+JSON.stringify(skillInput)+';\nconst iconUsage='+JSON.stringify(iconUsage)+';\n'+iconSource+'\n'+fs.readFileSync(path.join(root,'apps/web/src/skills.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
const context={exports:{},document,window,classicUiLayout:()=>JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8')),loadNationalUiLibrary:()=>new Promise(()=>{}),
 setTimeout:(fn,delay)=>{assert.equal(delay,5000);const id=nextTimer++;clock.set(id,fn);return id;},
 clearTimeout:id=>clock.delete(id)};
vm.createContext(context);
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {SkillBar,arrangeSkillSlots,arrangeSkills,skillKeySlot,validSkillKey}=context.exports;
const skill=(magicId,key=0)=>({key,level:1,currentTrain:0,magicId,name:'技能'+magicId,effectType:0,effect:0,spell:1,power:1,trainLevels:[],maxTrain:[],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:''});
const plain=value=>JSON.parse(JSON.stringify(value));
const sparse=arrangeSkillSlots([skill(1,56),skill(2),skill(3,8)]);
assert.equal(sparse.length,8);assert.equal(sparse[7].magicId,1);
assert.equal(sparse[0],undefined);assert.equal(sparse[6],undefined);
assert.equal(skillKeySlot(8),undefined);assert.equal(skillKeySlot(56),7);
assert.equal(validSkillKey(0),true);for(const key of [8,-1,57,49.5])assert.equal(validSkillKey(key),false);
const many=Array.from({length:12},(_,i)=>skill(i+1,i===0?49:i===1?56:0));
assert.equal(arrangeSkills(many).length,12);assert.equal(arrangeSkillSlots(many).filter(Boolean).length,2);
const duplicate=[skill(1,49),skill(2,49),skill(3)];
assert.equal(arrangeSkillSlots(duplicate)[0].magicId,1);assert.equal(arrangeSkills(duplicate).length,3);
console.log('PASS original ASCII keys, None, sparse slots, duplicate keys and more than eight learned skills');

{
 const selections=[],casts=[];
 const selectionBar=new SkillBar(new Element(),{select:value=>selections.push(value?.magicId),self:value=>casts.push(value.magicId)});
 selectionBar.replace([skill(1,49),skill(2,50)]);
 assert.equal(selectionBar.selectSlot(0),true);assert.deepEqual(selections,[1]);
 assert.equal(selectionBar.castSelf(skill(2,50)),true);assert.deepEqual(selections,[1,undefined]);assert.deepEqual(casts,[2]);
 selectionBar.resolve();assert.equal(selectionBar.selectSlot(1),true);selectionBar.setPending(2);
 assert.deepEqual(selections,[1,undefined,2,undefined]);selectionBar.resolve();
 assert.equal(selectionBar.selectSlot(0),true);assert.equal(selectionBar.cancelSelection(),true);
 assert.deepEqual(selections,[1,undefined,2,undefined,1,undefined]);
 selectionBar.selectSlot(0);selectionBar.replace([skill(3,49)]);
 assert.deepEqual(selections,[1,undefined,2,undefined,1,undefined,1,undefined]);
 console.log('PASS skill selection callbacks clear parent presentation on self-cast, pending, cancel and authoritative replacement');
}

const element=new Element(),sent=[],selected=[];
const bar=new SkillBar(element,{select:s=>selected.push(s?.magicId),self:s=>sent.push({cast:s.magicId}),bind:(s,key,bindingId)=>{sent.push({magicId:s.magicId,key,bindingId});return true;}});
bar.replace([skill(1,49),skill(2,50),skill(7)]);
assert.equal(element.children.filter(row=>row.className==='skill-item').length,3);
let row=element.children.find(node=>node.dataset.magicId==='1');
row.children.find(node=>node.className==='skill-key-binding').onclick();
row=element.children.find(node=>node.dataset.magicId==='1');
let editor=element.children.find(node=>node.className==='skill-key-editor');
assert.deepEqual(editor.children.filter(node=>node.dataset.skillKey!==undefined).map(node=>node.textContent),['None','F1','F2','F3','F4','F5','F6','F7','F8']);
editor.children.find(node=>node.dataset.skillKey==='50').onclick();
assert.equal(bar.debugState().learnedSkills.find(s=>s.magicId===1).key,49);
row=element.children.find(node=>node.dataset.magicId==='1');
element.children.find(node=>node.className==='skill-key-editor').children.find(node=>node.className==='skill-key-confirm').onclick();
assert.deepEqual(sent,[{magicId:1,key:50,bindingId:1}]);assert.deepEqual(plain(bar.debugState().binding),{magicId:1,key:50,bindingId:1});
assert.equal(bar.skillAt(0).magicId,1);assert.equal(bar.skillAt(1).magicId,2);
assert.equal(bar.selectSlot(0),false);assert.equal(bar.castSelf(skill(2,50)),false);
assert.equal(bar.requestKeyBinding(2,56),false);assert.equal(clock.size,1);
console.log('PASS key editor drafts and pending preserve confirmed keys and block duplicate operations');

bar.replace([skill(1,50),skill(2,50),skill(7)]);
assert.ok(bar.debugState().binding,'a conflicting snapshot cannot confirm a binding');
bar.replace([skill(1,50),skill(2),skill(7)]);
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
assert.equal(bar.skillAt(0),undefined);assert.equal(bar.skillAt(1).magicId,1);
assert.equal(bar.debugState().learnedSkills.find(s=>s.magicId===2).key,0);
assert.match(bar.debugState().bindingMessage,/F2/);
assert.equal(bar.requestKeyBinding(1,0),true);
assert.equal(bar.skillAt(1).magicId,1);
bar.replace([skill(1),skill(2),skill(7)]);
assert.equal(bar.skillAt(1),undefined);assert.equal(bar.debugState().learnedSkills.length,3);
console.log('PASS only authoritative unique snapshots confirm slot replacement and None unbinding');

for(const [magicId,key] of [[999,49],[1,8],[1,57],[1,-1],[1,49.5]])assert.equal(bar.requestKeyBinding(magicId,key),false);
assert.equal(bar.requestKeyBinding(7,56),true);
bar.rejectKeyBinding('服务器拒绝');
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
assert.equal(bar.debugState().learnedSkills.find(s=>s.magicId===7).key,0);
assert.equal(bar.debugState().bindingMessage,'服务器拒绝');
assert.equal(bar.requestKeyBinding(7,56),true);
[...clock.values()][0]();
assert.equal(clock.size,0);assert.equal(bar.debugState().binding,undefined);
assert.equal(bar.debugState().learnedSkills.find(s=>s.magicId===7).key,0);
assert.match(bar.debugState().bindingMessage,/超时/);
console.log('PASS learned/ASCII validation, server rejection and timeout release pending without optimistic keys');

assert.equal(bar.requestKeyBinding(7,56),true);
bar.cancelKeyBinding();assert.equal(clock.size,0);assert.equal(bar.debugState().binding,undefined);
bar.replace([skill(1),skill(2),skill(7,56)]);
assert.equal(bar.skillAt(7).magicId,7,'late authoritative snapshot must still update closed settings');
assert.equal(bar.requestKeyBinding(1,49),true);window.emit('blur');
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
assert.equal(bar.requestKeyBinding(1,49),true);document.hidden=true;document.emit('visibilitychange');
assert.equal(bar.debugState().binding,undefined);document.hidden=false;
assert.equal(bar.requestKeyBinding(1,49),true);element.emit('pointercancel');
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
console.log('PASS close, blur, hidden and pointer cancellation release binding waits; late snapshots remain authoritative');

assert.equal(bar.requestKeyBinding(1,49),true);bar.remove(1);
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
assert.match(bar.debugState().bindingMessage,/移除/);
assert.equal(bar.requestKeyBinding(2,49),true);bar.clear();
assert.equal(bar.debugState().known,false);assert.equal(bar.debugState().binding,undefined);
assert.equal(bar.debugState().learnedSkills.length,0);assert.equal(clock.size,0);
const unavailable=new SkillBar(new Element(),{select(){},self(){}});
unavailable.replace([skill(1)]);assert.equal(unavailable.requestKeyBinding(1,49),false);
console.log('PASS removed skills, new sessions and unsupported bindings clear or reject stale controls');

bar.replace([skill(1),skill(2),skill(7)]);
assert.equal(bar.requestKeyBinding(1,49),true);const oldBinding=bar.debugState().binding;
bar.cancelKeyBinding();assert.equal(bar.requestKeyBinding(1,49),true);
const freshBinding=bar.debugState().binding;
assert.ok(freshBinding.bindingId>oldBinding.bindingId);
assert.equal(bar.rejectKeyBinding('old timeout',oldBinding.bindingId),false);
assert.equal(bar.debugState().binding.bindingId,freshBinding.bindingId);
assert.equal(bar.rejectKeyBinding('current timeout',freshBinding.bindingId),true);
assert.equal(bar.debugState().binding,undefined);assert.equal(clock.size,0);
bar.replace([skill(1,49),skill(2),skill(7)]);assert.equal(bar.skillAt(0).magicId,1);
console.log('PASS binding identities prevent an old timeout/rejection from cancelling a new identical request; late snapshots stay authoritative');

{
 const nativeElement=new Element();nativeElement.nativeWindow={};const sends=[];
 const nativeBar=new SkillBar(nativeElement,{select:()=>{},self:()=>{},bind:(s,key)=>{sends.push({id:s.magicId,key});return true;}});
 const learned=[skill(1),skill(7),skill(12,52),skill(25,51),skill(26,49),skill(3)];nativeBar.replace(learned);
 const rows=()=>nativeElement.children.filter(node=>node.className?.includes('native-skill-row'));
 assert.deepEqual(rows().map(node=>Number(node.dataset.magicId)),[1,7,12,25,26]);
 assert.deepEqual(rows().map(node=>node.style.top),['0px','37px','74px','111px','148px']);
 assert.equal(rows()[0].children.find(node=>node.className==='skill-key-binding').textContent,'');
 assert.equal(rows()[4].children.find(node=>node.className==='skill-key-binding').textContent,'F1');
 assert.equal(rows()[0].children.some(node=>node.className==='skill-passive'),false);
 nativeElement.emit('wheel',{deltaY:1,preventDefault(){},stopPropagation(){}});assert.deepEqual(rows().map(node=>Number(node.dataset.magicId)),[3]);
 nativeBar.remove(3);assert.deepEqual(rows().map(node=>Number(node.dataset.magicId)),[1,7,12,25,26]);
 nativeBar.clear();nativeBar.replace(learned);assert.equal(rows().length,5);assert.equal(nativeBar.skillAt(0).magicId,26);assert.deepEqual(sends,[]);
 console.log('PASS native five-row skill pages preserve learned order independently of sparse F-keys and do not send on paging');
}

{
 const nativeElement=new Element();nativeElement.nativeWindow={};const sends=[],answers=[];let closes=0;
 const nativeBar=new SkillBar(nativeElement,{select:()=>{},self:()=>{},bind:(skill,key,bindingId)=>{sends.push({id:skill.magicId,key,bindingId});return true;},chooseKey:()=>new Promise(resolve=>answers.push(resolve)),closeKeyDialog:()=>{closes++;}});
 nativeBar.replace([skill(1),skill(7,49)]);
 const open=()=>nativeElement.children.find(row=>row.dataset.magicId==='1').children.find(node=>node.className==='skill-key-binding').onclick();
 open();assert.equal(nativeBar.debugState().bindingEditor,1);
 assert.equal(nativeElement.children.some(node=>node.className?.includes('skill-key-editor')),false);
 assert.equal(nativeBar.selectSlot(0),false);assert.equal(sends.length,0);
 nativeBar.cancelKeyBinding();answers.shift()(50);await Promise.resolve();assert.equal(sends.length,0);
 open();answers.shift()(50);await Promise.resolve();assert.equal(sends.length,1);assert.equal(sends[0].key,50);assert.equal(nativeBar.debugState().learnedSkills.find(skill=>skill.magicId===1).key,0);
 nativeBar.replace([skill(1,50),skill(7,49)]);assert.equal(nativeBar.debugState().binding,undefined);
 open();nativeBar.remove(1);answers.shift()(56);await Promise.resolve();assert.equal(sends.length,1);assert.ok(closes>=2);
 console.log('PASS native shared modal sends only current confirmed choices, never renders inline editor, and discards answers after close or skill removal');
}
