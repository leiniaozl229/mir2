import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {itemIconProductionSource} from './item_icon_test_source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const layout=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8'));
const interactions=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-interactions.json'),'utf8'));
const layoutSource=fs.readFileSync(path.join(root,'apps/web/src/classic-layout.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
const inventorySource=fs.readFileSync(path.join(root,'apps/web/src/inventory.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
const source=`${itemIconProductionSource(root)}const uiLayout=${JSON.stringify(layout)};\nconst uiInteractions=${JSON.stringify(interactions)};\n${layoutSource}\n${inventorySource}`;
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

class Clock{
 now=0;next=1;tasks=new Map();
 set=(callback,delay)=>{const id=this.next++;this.tasks.set(id,{callback,due:this.now+delay});return id;};
 clear=id=>this.tasks.delete(id);
 advance(ms){this.now+=ms;for(const [id,task] of [...this.tasks])if(task.due<=this.now){this.tasks.delete(id);task.callback();}}
 callback(){return [...this.tasks.values()].at(-1)?.callback;}
}
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.listeners=new Map();this.disabled=false;this.hidden=false;this.ownerDocument=document;this.className='';this.classList={add:name=>{if(!this.className.split(' ').includes(name))this.className+=` ${name}`;},contains:name=>this.className.split(' ').includes(name)};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(){}
 querySelector(){return null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='[data-slot]'&&child.dataset?.slot!==undefined?[child]:[]),...(child.querySelectorAll?.(selector)??[])]);}
 addEventListener(type,callback){this.listeners.set(type,callback);}
 removeEventListener(type){this.listeners.delete(type);}
}
const document={createElement:tag=>new Element(tag)};
const clock=new Clock();
const stateitem=JSON.parse(fs.readFileSync(path.join(root,'assets/web/ui-national/stateitem/library.json'),'utf8'));
const context={exports:{},document,fetch:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>Promise.resolve(stateitem),setTimeout:clock.set,clearTimeout:clock.clear};
vm.createContext(context);vm.runInContext(compiled,context);
const grid=new Element(),sent=[];
let sendResult=true;
const view=new context.exports.EquipmentView(grid,slot=>{sent.push(slot);return sendResult;});
const ring={name:'测试戒指',makeIndex:101,durability:900,maxDurability:1000,stdMode:22,weight:1,looks:1};
const other={...ring,name:'替换戒指',makeIndex:202};
const state=()=>view.debugState();
const slotButton=slot=>grid.children.find(button=>Number(button.dataset.slot)===slot);
const click=slot=>slotButton(slot).onclick();
const reset=(item=ring)=>{view.replace([{slot:7,item}]);sent.length=0;sendResult=true;assert.equal(clock.tasks.size,0);};

reset();const oldButton=slotButton(7);oldButton.onclick();oldButton.onclick();
assert.deepEqual(sent,[7]);assert.equal(slotButton(7).disabled,true);assert.equal(clock.tasks.size,1);
assert.equal(view.resolve(7,false,999),false);assert.equal(slotButton(7).disabled,true);
assert.equal(view.resolve(7,false,ring.makeIndex),true);assert.equal(clock.tasks.size,0);assert.equal(slotButton(7).disabled,false);assert.equal(state().slots[0].item.makeIndex,101);
console.log('PASS equipment takeoff rejects duplicate clicks and wrong-instance results, then unlocks on matching rejection');

reset();click(7);const firstCallback=clock.callback();clock.advance(7999);assert.equal(slotButton(7).disabled,true);clock.advance(1);
assert.equal(slotButton(7).disabled,false);assert.equal(state().slots[0].item.makeIndex,101);assert.equal(clock.tasks.size,0);
click(7);assert.deepEqual(sent,[7,7]);firstCallback();assert.equal(slotButton(7).disabled,true);assert.equal(clock.tasks.size,1);
view.rejectPending();assert.equal(clock.tasks.size,0);
console.log('PASS equipment timeout preserves the server item, permits retry and prevents an old timer from releasing the new lock');

reset();click(7);const replacedCallback=clock.callback();view.set(7,other);assert.equal(clock.tasks.size,0);assert.equal(slotButton(7).disabled,false);
click(7);replacedCallback();assert.equal(slotButton(7).disabled,true);assert.equal(view.resolve(7,true,ring.makeIndex),false);assert.equal(view.resolve(7,false,ring.makeIndex),false);
assert.equal(state().slots[0].item.makeIndex,202);assert.equal(slotButton(7).disabled,true);assert.equal(clock.tasks.size,1);
assert.equal(view.resolve(7,true,other.makeIndex),true);assert.equal(state().slots.length,0);assert.equal(clock.tasks.size,0);
console.log('PASS replaced slot and new request ignore late results for the previous equipment instance');

reset();click(7);view.set(7,{...ring,durability:800});assert.equal(slotButton(7).disabled,true);assert.equal(clock.tasks.size,1);
view.update({...ring,durability:700});assert.equal(slotButton(7).disabled,true);assert.equal(state().slots[0].item.durability,700);
view.replace([{slot:7,item:{...ring,durability:600}}]);assert.equal(slotButton(7).disabled,false);assert.equal(clock.tasks.size,0);assert.equal(view.resolve(7,false,ring.makeIndex),false);
console.log('PASS durability changes retain in-flight takeoff, while an authoritative equipment snapshot cancels its timer and orphaned rejection');

reset();click(7);view.rejectPending();assert.equal(clock.tasks.size,0);assert.equal(slotButton(7).disabled,false);assert.equal(state().slots[0].item.makeIndex,101);
click(7);view.remove(7);assert.equal(clock.tasks.size,0);assert.equal(state().slots.length,0);assert.equal(view.resolve(7,true,ring.makeIndex),false);
reset();click(7);view.clear();assert.equal(clock.tasks.size,0);assert.equal(state().pending.length,0);assert.equal(state().slots.length,0);clock.advance(16000);assert.equal(state().slots.length,0);
console.log('PASS explicit cancellation, broken/remove, clear and disconnect-style cleanup cancel equipment timers without fabricating inventory');

reset();click(7);assert.equal(view.resolve(7,true),false);assert.equal(slotButton(7).disabled,true);assert.equal(view.resolve(7,true,ring.makeIndex),true);
assert.equal(view.resolve(7,true,ring.makeIndex),false);assert.equal(clock.tasks.size,0);assert.equal(state().slots.length,0);
console.log('PASS successful takeoff requires the gateway instance identity and applies once');

reset();click(7);view.rejectPending();assert.equal(state().slots[0].item.makeIndex,101);assert.equal(clock.tasks.size,0);
assert.equal(view.resolve(7,false,ring.makeIndex),false);assert.equal(view.resolve(7,true,ring.makeIndex),true);assert.equal(state().slots.length,0);assert.equal(clock.tasks.size,0);
console.log('PASS closing or blurring equipment cancels local waiting but still applies a matching late authoritative takeoff success');

reset();click(7);clock.advance(8000);assert.equal(state().pending.length,0);assert.equal(state().slots[0].item.makeIndex,101);
assert.equal(view.resolve(7,true,ring.makeIndex),true);assert.equal(state().slots.length,0);assert.equal(clock.tasks.size,0);
console.log('PASS timeout does not lose a later successful server removal of the same equipment instance');

reset();click(7);view.rejectPending();view.replace([{slot:7,item:other}]);click(7);
assert.equal(view.resolve(7,true,ring.makeIndex),false);assert.equal(state().slots[0].item.makeIndex,202);assert.equal(slotButton(7).disabled,true);assert.equal(clock.tasks.size,1);
view.rejectPending();
console.log('PASS authoritative success for an old slot instance cannot remove replacement equipment or release its new pending request');

reset();sendResult=false;click(7);assert.equal(slotButton(7).disabled,false);assert.equal(clock.tasks.size,0);assert.equal(state().slots[0].item.makeIndex,101);
const throwingGrid=new Element(),throwing=new context.exports.EquipmentView(throwingGrid,()=>{throw new Error('send failed');});throwing.replace([{slot:7,item:ring}]);
assert.throws(()=>throwingGrid.children.find(button=>Number(button.dataset.slot)===7).onclick(),/send failed/);assert.equal(throwing.debugState().pending.length,0);assert.equal(clock.tasks.size,0);
console.log('PASS disconnected send rejection and synchronous send errors immediately release the local equipment lock');

await Promise.resolve();
view.replace([{slot:0,item:{...ring,stdMode:10,name:'测试衣服',looks:30}}]);sent.length=0;sendResult=true;
const appearance=grid.children.find(button=>button.classList.contains('equipment-appearance'));
assert.ok(appearance,'native stateitem frame is not rendered as equipment appearance');appearance.onclick();appearance.onclick();
assert.deepEqual(sent,[0]);assert.equal(grid.children.find(button=>button.classList.contains('equipment-appearance')).disabled,true);assert.equal(clock.tasks.size,1);
assert.equal(view.resolve(0,false,ring.makeIndex),true);assert.equal(grid.children.find(button=>button.classList.contains('equipment-appearance')).disabled,false);assert.equal(clock.tasks.size,0);
console.log('PASS native paperdoll appearance uses the same guarded pending lifecycle as accessory cells');
