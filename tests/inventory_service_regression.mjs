import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {itemIconProductionSource} from './item_icon_test_source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
let mockDocument;
class Element{
 constructor(tag='div'){this.tag=tag;this.ownerDocument=mockDocument;this.children=[];this.dataset={};this.style={};this.hidden=false;this.attributes={};this.listeners=[];this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),contains:name=>this.classes.has(name)};}
 append(...children){this.children.push(...children);for(const child of children)child.parentElement=this;}
 replaceChildren(...children){this.children=[];this.append(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,callback,capture=false){this.listeners.push({type,callback,capture});}
 removeEventListener(type,callback,capture=false){this.listeners=this.listeners.filter(value=>value.type!==type||value.callback!==callback||value.capture!==capture);}
 querySelector(selector){return selector==='[data-service-item-slot]'?this.children.find(child=>child.dataset.serviceItemSlot!==undefined):undefined;}
 querySelectorAll(){return this.children.filter(child=>child.classes.has('selected'));}
 closest(selector){return selector==='[data-service-item-slot]'?(this.dataset.serviceItemSlot!==undefined?this:this.parentElement?.closest(selector)):undefined;}
 emit(type,event){for(const value of [...this.listeners])if(value.type===type)value.callback(event);}
}
mockDocument={createElement:tag=>new Element(tag),addEventListener(){},defaultView:{addEventListener(){}}};mockDocument.body=new Element('body');
const layout=read('apps/web/src/classic-layout.ts').replace(/^import .*;\r?\n/gm,'');
const inventory=read('apps/web/src/inventory.ts').replace(/^import .*;\r?\n/gm,'');
const inventoryTimers=[],inventoryContext={exports:{},document:mockDocument,fetch:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>new Promise(()=>{}),setTimeout:(callback,timeout)=>{inventoryTimers.push({callback,timeout});return inventoryTimers.length;},clearTimeout(){}};
vm.createContext(inventoryContext);
vm.runInContext(transpile(read('apps/web/src/mining-controller.ts')),inventoryContext);
vm.runInContext(transpile(`${itemIconProductionSource(root)}const uiLayout=${read('content/classic-176/ui-layout.json')};const uiInteractions=${read('content/classic-176/ui-interactions.json')};${layout}\n${inventory}`),inventoryContext);
const serviceContext={exports:{},HTMLElement:Element};vm.createContext(serviceContext);vm.runInContext(transpile(read('apps/web/src/service-input.ts')),serviceContext);
const {InventoryView}=inventoryContext.exports;
const {bindInventoryServiceSlot,selectInventoryForService}=serviceContext.exports;
const sword={name:'木剑',makeIndex:101,durability:5000,maxDurability:10000,stdMode:5,weight:1,looks:1};
const potion={name:'金创药(中量)',makeIndex:102,durability:1,maxDurability:1,stdMode:0,weight:1,looks:2};
const clickEvent=(target,shiftKey=false)=>({target,clientX:20,clientY:30,shiftKey,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
inventoryContext.HTMLElement=Element;
vm.runInContext(transpile(read('apps/web/src/item-quickbar.ts').replace(/^import .*;\r?\n/gm,'')),inventoryContext);
function pockets(items,options={}){
 const element=new Element(),barElement=new Element(),calls=[];let bar;
 const view=new InventoryView(element,{drop:id=>calls.push(['drop',id]),equip:()=>false,use:id=>{calls.push(['use',id]);return options.send!==false;},layoutKey:options.layoutKey,availabilityChanged:()=>bar?.refreshAvailability()});
 bar=new inventoryContext.exports.ItemQuickBar(barElement,{inventory:view,use:id=>view.useItem(id)});view.replace(items);
 return {view,bar,element,barElement,calls,cell:id=>element.children.find(child=>child.dataset.itemId===String(id))};
}
const pocketPotions=Array.from({length:8},(_,i)=>({...potion,makeIndex:700+i,name:`药品${i}`}));
{
 const h=pockets([...pocketPotions,sword,{...potion,makeIndex:720,stdMode:4},{...potion,makeIndex:721,stdMode:31}]);
 assert.deepEqual(Array.from(h.bar.debugState().slots,x=>x.makeIndex),[700,701,702,703,704,705]);
 assert.equal(h.element.children.filter(x=>x.dataset.itemId).length,5);assert.equal(h.view.debugState().items.length,11);
 const shown=[...h.element.children,...h.barElement.children].map(x=>x.dataset.itemId).filter(Boolean);
 assert.equal(new Set(shown).size,11);assert.equal(shown.length,11,'each instance has one visible location');
 const first=h.barElement.children[0];first.onclick(clickEvent(first));
 assert.equal(h.view.heldItem().makeIndex,700);assert.deepEqual(h.calls,[],'single click picks up instead of using');
 assert.equal(h.barElement.children[0],first,'the hit button survives redraw for a real double click');
 first.onclick({...clickEvent(first),detail:2});first.ondblclick(clickEvent(first));
 assert.deepEqual(h.calls,[['use',700]]);assert.equal(h.view.heldItem(),undefined);assert.equal(first.disabled,true);
 assert.equal(h.view.resolve(700,false,true),true);assert.equal(first.disabled,false);assert.equal(h.bar.debugState().slots[0].makeIndex,700);
 first.onclick(clickEvent(first));first.oncontextmenu(clickEvent(first));assert.equal(h.view.heldItem(),undefined);assert.deepEqual(h.calls,[['use',700]],'right-click held cancellation must not consume the item');
 assert.equal(h.bar.bindSlot(1,720),false);assert.equal(h.bar.bindSlot(1,721),false);
 pass('native pockets share unique instances, restrict admission to modes 0–3, preserve double-click targets and recover rejected use');
}
{
 const h=pockets([...pocketPotions,sword]);
 const source=h.cell(706);source.onclick(clickEvent(source));h.barElement.children[1].onclick(clickEvent(h.barElement.children[1]));
 assert.equal(h.bar.debugState().slots[1].makeIndex,706);assert.equal(h.view.heldItem().makeIndex,701,'occupied destination leaves its displaced item on the cursor');
 assert.equal(h.cell(701),undefined);assert.deepEqual(h.calls,[]);
 h.element.children[9].onclick(clickEvent(h.element.children[9]));
 assert.equal(h.view.heldItem(),undefined);assert.equal(h.cell(701).dataset.slot,'9');assert.equal(h.cell(706),undefined);
 h.barElement.children[0].onclick(clickEvent(h.barElement.children[0]));h.view.cancelSelection();
 assert.equal(h.bar.debugState().slots[0].makeIndex,700);assert.equal(h.view.heldItem(),undefined);
 h.view.useItem(706);h.cell(707).onclick(clickEvent(h.cell(707)));h.barElement.children[1].onclick(clickEvent(h.barElement.children[1]));
 assert.equal(h.view.heldItem().makeIndex,707);assert.equal(h.bar.debugState().slots[1].makeIndex,706,'pending destination cannot be replaced');
 h.view.cancelSelection();h.view.resolve(706,false,true);
 h.bar.bindSlot(2,707);assert.equal(h.view.heldItem().makeIndex,702);h.view.cancelSelection();
 assert.equal(h.bar.debugState().slots[2].makeIndex,707);assert.ok(h.cell(702));
 pass('native bag/pocket swaps carry the displaced instance, cancellation restores it and pending targets reject moves');
}
{
 const h=pockets(pocketPotions,{send:false});
 const e={code:'Digit1',repeat:false,isComposing:false,target:null,preventDefault(){this.prevented=true;}};
 h.bar.handleKey(e);assert.equal(e.prevented,true);assert.equal(h.view.debugState().pending.length,0);assert.equal(h.barElement.children[0].disabled,false);
 h.view.reserveForService(700);assert.equal(h.bar.debugState().slots[0].makeIndex,undefined);h.bar.handleKey(e);assert.equal(h.calls.length,1);
 h.view.releaseFromService(700);assert.equal(h.bar.debugState().slots[0].makeIndex,700);
 h.barElement.children[0].onclick(clickEvent(h.barElement.children[0]));h.view.replace(pocketPotions.slice(1));
 assert.equal(h.view.heldItem(),undefined);assert.equal(h.view.debugState().items.some(x=>x.makeIndex===700),false);
 assert.equal([...h.element.children,...h.barElement.children].some(x=>x.dataset.itemId==='700'||x.dataset.heldItemId==='700'),false);
 pass('offline use, service reservation and replacement snapshots keep the shared pocket authority and cursor consistent');
}
{
 const storage=new Map();inventoryContext.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 let character='one';const layoutKey=()=>`pocket-fixture.${character}`;
 storage.set('pocket-fixture.one',JSON.stringify({700:0,701:1}));
 const h=pockets(pocketPotions,{layoutKey});assert.equal(h.bar.debugState().slots[0].makeIndex,700,'old bag-only layouts are not native pocket layouts');
 h.barElement.children[0].onclick(clickEvent(h.barElement.children[0]));h.element.children[12].onclick(clickEvent(h.element.children[12]));
 assert.equal(h.cell(700).dataset.slot,'12');h.view.clear();h.view.replace(pocketPotions);assert.equal(h.cell(700).dataset.slot,'12');
 character='two';h.view.replace(pocketPotions);assert.equal(h.bar.debugState().slots[0].makeIndex,700);assert.equal(h.cell(700),undefined);
 storage.set('pocket-fixture.three.native-pockets-v1',JSON.stringify({700:40,701:40,702:41}));character='three';h.view.replace(pocketPotions);
 const shown=[...h.element.children,...h.barElement.children].map(x=>x.dataset.itemId).filter(Boolean);assert.equal(new Set(shown).size,8);assert.equal(shown.length,8);
 delete inventoryContext.localStorage;
 pass('shared native layout persists per character, ignores old duplicate shortcuts and repairs conflicting saved positions');
}
function bag(selectService,trade){
 const element=new Element(),calls=[];
 const view=new InventoryView(element,{drop:id=>calls.push(['drop',id]),equip:(id,slot)=>calls.push(['equip',id,slot]),use:id=>calls.push(['use',id]),trade,selectService});
 view.replace([sword,potion]);
 return {view,element,calls,cell:id=>element.children.find(child=>child.dataset.itemId===String(id)),pick(id){const cell=this.cell(id);cell.onclick(clickEvent(cell));}};
}
{
 let allowed=false;const sent=[],timersBefore=inventoryTimers.length;const h=bag(undefined,id=>{sent.push(id);return allowed;});
 assert.equal(h.view.offerToTrade(101),false);assert.equal(h.view.debugState().pending.length,0);assert.equal(h.view.debugState().items.length,2);
 allowed=true;assert.equal(h.view.offerToTrade(101),true);assert.equal(h.view.debugState().pending[0],101);assert.equal(h.view.selectableItem(101),undefined);
 assert.equal(inventoryTimers.length,timersBefore,'a trade item stays locked until its authoritative result or trade close');
 assert.equal(h.view.resolve(101,false,false),true);assert.equal(h.view.selectableItem(101).name,'木剑');
 const cell=h.cell(102);cell.onclick(clickEvent(cell,true));assert.equal(sent.at(-1),102);assert.equal(h.view.debugState().pending[0],102);
 pass('trade admission follows the send result, locks the exact inventory instance, and restores it on rejection');
}
function service(){
 const panel=new Element(),slot=new Element('button'),calls=[];slot.dataset.serviceItemSlot='';panel.append(slot);
 const state={accept:true,offer:true,interact:true};
 const view={acceptsInventoryItem:()=>state.accept,offerInventoryItem:item=>{calls.push(item);return state.offer;}};
 return {panel,slot,calls,state,view};
}

{
 const received=[],h=bag(item=>{received.push(item);return true;});h.pick(101);
 assert.equal(h.view.heldItem().makeIndex,101);h.cell(101).ondblclick({...clickEvent(h.cell(101))});
 assert.equal(received[0].makeIndex,101);assert.equal(h.view.heldItem(),undefined);assert.equal(h.view.debugState().items.length,2);assert.deepEqual(h.calls,[]);assert.equal(h.view.debugState().pending.length,0);
 pass('service shortcut selects the authoritative instance without equipping, spending or removing it');
}
{
 let response=false;const h=bag(()=>response);h.pick(102);h.cell(102).oncontextmenu(clickEvent(h.cell(102)));
 assert.equal(h.view.heldItem().makeIndex,102);assert.deepEqual(h.calls,[]);
 response=undefined;h.cell(102).oncontextmenu(clickEvent(h.cell(102)));
 assert.deepEqual(h.calls,[['use',102]]);assert.equal(h.view.heldItem(),undefined);
 pass('rejected service selection keeps the held item while ordinary item use remains available outside a service');
}
{
 const h=bag();h.pick(101);const preview=mockDocument.body.children.at(-1);assert.equal(preview.hidden,false);
 h.view.remove(101);assert.equal(h.view.heldItem(),undefined);assert.equal(preview.hidden,true);assert.equal(h.view.debugState().selectedSlot,undefined);
 const newer={...potion,makeIndex:301};h.view.add(newer);assert.equal(h.view.consumeHeldItem(301),false);
 pass('authoritative removal clears the cursor and cannot transfer a replacement occupying the old slot');
}
{
 const h=bag();h.pick(101);h.view.update({...sword,durability:1200});assert.equal(h.view.heldItem().durability,1200);
 assert.equal(h.view.consumeHeldItem(102),false);assert.equal(h.view.heldItem().makeIndex,101);
 h.view.replace([potion]);assert.equal(h.view.heldItem(),undefined);assert.equal(h.view.debugState().selectedSlot,undefined);
 pass('held items use updated authority, require the matching instance and clear after snapshot removal');
}
{
 const h=bag(),originalSlot=h.view.debugState().items.find(item=>item.makeIndex===101).slot;
 assert.equal(h.view.reserveForService(101),true);assert.equal(h.cell(101),undefined);assert.deepEqual(Array.from(h.view.debugState().serviceReserved),[101]);assert.equal(h.view.debugState().items.find(item=>item.makeIndex===101).slot,undefined);
 assert.equal(h.view.releaseFromService(101),true);assert.equal(h.cell(101).dataset.slot,String(originalSlot));
 assert.equal(h.view.reserveForService(101),true);assert.equal(h.view.holdFromService(101,45,55),true);assert.equal(h.view.heldItem().makeIndex,101);assert.equal(h.element.children.find(cell=>cell.dataset.heldItemId==='101').dataset.slot,String(originalSlot));
 const preview=mockDocument.body.children.at(-1);assert.equal(preview.hidden,false);assert.equal(preview.style.left,'55px');assert.equal(preview.style.top,'65px');assert.equal(h.view.consumeHeldItem(101),true);assert.ok(h.cell(101));assert.deepEqual(h.calls,[]);
 pass('service reservation hides a staged item from the bag; taking it back restores the cursor preview and keeps canonical inventory unchanged');
}
{
 let key='character-A';const element=new Element();const view=new InventoryView(element,{drop(){},equip(){},use(){},layoutKey:()=>key});
 view.replace([sword]);element.children[0].onclick(clickEvent(element.children[0]));key='character-B';view.replace([sword]);assert.equal(view.heldItem(),undefined);
 pass('character layout changes cannot carry a selected instance into the next character');
}
{
 const h=bag(),s=service();bindInventoryServiceSlot(s,h.view,()=>s.state.interact);h.pick(101);
 const event=clickEvent(s.slot);s.panel.emit('click',event);
 assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(s.panel.listeners.find(value=>value.type==='click').capture,true);
 assert.equal(s.calls[0].makeIndex,101);assert.equal(h.view.heldItem(),undefined);assert.equal(h.view.debugState().items.length,2);assert.deepEqual(h.calls,[]);
 pass('captured slot placement consumes only the cursor selection and never commits a transaction');
}
{
 const h=bag(),s=service();s.state.offer=false;bindInventoryServiceSlot(s,h.view,()=>s.state.interact);h.pick(101);s.panel.emit('click',clickEvent(s.slot));assert.equal(h.view.heldItem().makeIndex,101);
 s.state.offer=true;s.state.interact=false;s.panel.emit('click',clickEvent(s.slot));assert.equal(s.calls.length,1);assert.equal(h.view.heldItem().makeIndex,101);
 s.state.interact=true;s.state.accept=false;s.panel.emit('click',clickEvent(s.slot));assert.equal(s.calls.length,1);
 pass('pending, blocked and rejected slots retain the held instance and do not mutate their existing selection');
}
{
 const h=bag(),s=service();s.view.itemInServiceSlot=()=>sword;bindInventoryServiceSlot(s,h.view,()=>s.state.interact);h.pick(102);s.panel.emit('click',clickEvent(s.slot));
 assert.equal(s.calls[0].makeIndex,102);assert.equal(h.view.heldItem().makeIndex,101);assert.deepEqual(h.calls,[]);
 pass('placing a held bag item into an occupied service slot transfers the displaced slot instance back to the cursor');
}
{
 const h=bag(),s=service();bindInventoryServiceSlot(s,h.view,()=>s.state.interact);
 const drop=value=>({...clickEvent(s.slot),dataTransfer:{getData:()=>value}});
 for(const value of ['', '0','-1','1.5','NaN','999999999999999999999','999'])s.panel.emit('drop',drop(value));assert.equal(s.calls.length,0);
 h.view.update({...sword,durability:700});s.panel.emit('drop',drop('101'));assert.equal(s.calls[0].durability,700);assert.deepEqual(h.calls,[]);
 h.view.remove(101);s.panel.emit('drop',drop('101'));assert.equal(s.calls.length,1);
 pass('drop accepts only a current selectable inventory instance and uses its latest server fields');
}
{
 const h=bag(),s=service();bindInventoryServiceSlot(s,h.view,()=>s.state.interact);h.view.requestDrop(101);
 const event={...clickEvent(s.slot),dataTransfer:{getData:()=> '101'}};s.panel.emit('drop',event);assert.equal(s.calls.length,0);
 const hover={...clickEvent(s.slot),dataTransfer:{dropEffect:'none'}};s.panel.emit('dragover',hover);assert.equal(hover.dataTransfer.dropEffect,'move');s.state.accept=false;s.panel.emit('dragover',hover);assert.equal(hover.dataTransfer.dropEffect,'none');
 pass('an inventory request in flight cannot also enter a service slot and closed service waits refuse drag admission');
}
{
 const a=service(),b=service();a.panel.style.zIndex='31';b.panel.style.zIndex='32';
 assert.equal(selectInventoryForService(sword,[a,b],()=>true),true);assert.equal(a.calls.length,0);assert.equal(b.calls.length,1);
 b.state.accept=false;assert.equal(selectInventoryForService(sword,[a,b],()=>true),false);assert.equal(a.calls.length,0);
 b.panel.replaceChildren();assert.equal(selectInventoryForService(sword,[a,b],()=>true),undefined);assert.equal(a.calls.length,0);
 b.panel.hidden=true;assert.equal(selectInventoryForService(sword,[a,b],()=>false),false);assert.equal(a.calls.length,0);
 a.panel.hidden=true;assert.equal(selectInventoryForService(sword,[a,b],()=>true),undefined);
 pass('shortcut targets the visible top service without falling through blocked services or bypassing a modal');
}
{
 const h=bag(),s=service();const dispose=bindInventoryServiceSlot(s,h.view,()=>true);h.pick(101);dispose();s.panel.emit('click',clickEvent(s.slot));assert.equal(s.calls.length,0);assert.equal(s.panel.listeners.length,0);
 pass('service slot bindings can be removed without retaining cursor listeners');
}
{
 const rows=inventoryContext.exports.itemDetailRows({...potion,stdMode:43,durability:4500,maxDurability:440});
 assert.equal(rows.find(([name])=>name==='纯度')[1],'4');assert.equal(rows.some(([name])=>name==='持久'),false);assert.equal(rows[0][1],'矿石');
 pass('inventory ore tooltip displays native round-to-even purity and never treats it as durability');
}
{
 const describe=inventoryContext.exports.nativeItemDescription;
 assert.equal(describe({...potion,weight:2,ac:{min:50,max:0}}).first,'+50HP 重量2');
 assert.equal(describe({...potion,weight:2,ac:{min:0,max:0},mac:{min:80,max:0}}).first,'+80MP 重量2');
 const combined=describe({...potion,ac:{min:44,max:1},mac:{min:20,max:0},needLevel:7,price:1234});
 assert.equal(combined.first,'+300HP +20MP 重量1');assert.equal(combined.second,'');assert.equal(combined.third,'');
 pass('native potion descriptions decode packed recovery values instead of showing armor, durability, level or price');
}
{
 const describe=inventoryContext.exports.nativeItemDescription,attributes={level:19,job:0,dc:{min:1,max:20},mc:{min:0,max:3},sc:{min:0,max:2}};
 const item={...sword,name:'斩马刀',weight:27,durability:6500,maxDurability:19000,dc:{min:5,max:15},need:0,needLevel:20,bonus:{ac:0,mac:0,dc:4,mc:0,sc:0}};
 const detail=describe(item,attributes);
 assert.equal(detail.first,'重量27 持久力6/19');assert.equal(detail.second,'攻击5-15');assert.equal(detail.third,'需要等级20');assert.equal(detail.requirementMet,false);
 assert.equal(describe(item,{...attributes,level:20}).requirementMet,true);assert.equal(describe(item).requirementMet,undefined);
 assert.equal(describe({...item,need:1,needLevel:21},attributes).third,'需要攻击力21');assert.equal(describe({...item,need:1,needLevel:21},attributes).requirementMet,false);
 assert.equal(describe({...item,durability:12500,maxDurability:6000}).first,'重量27 持久力12/6');
 assert.equal(describe({...item,stdMode:43,durability:4500}).first,'重量27 纯度4');
 pass('native weapon descriptions preserve authoritative ranges, ties-to-even durability, over-max values and requirement kind');
}
{
 const description=new Element();description.id='inventory-description';const panel=new Element(),element=new Element();panel.append(element);
 panel.querySelector=selector=>selector==='[data-inventory-description]'?description:undefined;
 let attributes={level:1,job:0,dc:{min:1,max:2},mc:{min:0,max:0},sc:{min:0,max:0}};
 const item={...sword,dc:{min:2,max:5},need:0,needLevel:7};
 const view=new InventoryView(element,{drop(){},equip(){},use(){return false;},readAttributes:()=>attributes});view.replace([item,potion]);
 const cell=element.children[0];cell.onmouseenter();assert.equal(description.dataset.itemId,'101');assert.equal(description.children[0].children[0].textContent,'木剑 ');assert.equal(description.children[2].dataset.requirement,'unmet');
 attributes={...attributes,level:7};view.refreshItemDescription();assert.equal(description.children[2].dataset.requirement,'met');
 view.update({...item,dc:{min:2,max:8}});assert.equal(description.children[1].textContent,'攻击2-8');
 view.remove(101);assert.equal(description.children.length,0);assert.equal(description.dataset.itemId,undefined);
 view.describeItem(102,element.children[1]);assert.equal(description.dataset.itemId,'102');view.useItem(102);assert.equal(description.children.length,0);assert.equal(view.debugState().items.length,1);
 view.describeItem(102,element.children[1]);panel.emit('pointerleave',{});assert.equal(description.children.length,0);
 view.describeItem(102,element.children[1]);view.clear();assert.equal(description.children.length,0);
 pass('fixed descriptions refresh server updates and attributes, clear removal, pending, leave and disconnect without changing ownership');
}
const settleDescription=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function nativeDescriptionView(items){
 const panel=new Element(),element=new Element(),description=new Element();panel.append(element,description);
 description.isConnected=true;description.id='inventory-description';
 description.closest=selector=>selector==='.national-window'?panel:selector==='[hidden]'&&panel.hidden?panel:undefined;
 description.contains=node=>{for(let current=node;current;current=current.parentElement)if(current===description)return true;return false;};
 panel.querySelector=selector=>selector==='[data-inventory-description]'?description:undefined;
 const view=new InventoryView(element,{drop(){},equip(){},use(){return false;}});view.replace(items);
 return {view,element,panel,description};
}
{
 const requests=[],painted=[];
 const font={prepare:async()=>{},measure:text=>text.length*6,paint:(canvas,text,options)=>painted.push({text,...options})};
 inventoryContext.loadNativeUiFont=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 const h=nativeDescriptionView([potion,sword]);h.view.describeItem(102,h.element.children[0]);
 h.view.update({...potion,mac:{min:80,max:0}});
 requests[0].resolve(font);await settleDescription();assert.equal(painted.length,0,'old authority must never paint after a newer update');
 requests[1].resolve(font);await settleDescription();assert.ok(painted.some(row=>row.text==='+80MP 重量1'&&row.color==='#ffffff'));
 h.view.describeItem(101,h.element.children[1]);h.view.hideDescription();requests[2].resolve(font);await settleDescription();
 assert.equal(h.description.children.length,0,'leaving the item cannot resurrect a late glyph batch');
 pass('source-bound description glyphs use latest authority and ignore late hover/update callbacks');
}
{
 const requests=[];let painted=0;
 const font={prepare:async()=>{},measure:text=>text.length*6,paint:()=>{painted++;}};
 inventoryContext.loadNativeUiFont=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 const h=nativeDescriptionView([potion,sword]);const sourceCell=h.element.children[0];sourceCell.onfocus();
 requests[0].reject(new Error('文字素材暂时不可用'));await settleDescription();
 const error=h.description.children.find(node=>node.attributes.role==='alert');assert.ok(error);assert.equal(painted,0);
 sourceCell.onmouseleave();assert.ok(h.description.children.includes(error),'bag-cell mouse leave must preserve the retry');
 sourceCell.onblur();assert.ok(h.description.children.includes(error),'bag-cell blur must preserve the retry while focus moves to it');
 const retry=error.children[1];retry.emit('click',{});requests[1].resolve(font);await settleDescription();
 assert.ok(painted>0);assert.equal(h.description.children.some(node=>node.attributes.role==='alert'),false);
 h.view.describeItem(101,h.element.children[1]);const requestCount=requests.length;retry.emit('click',{});
 assert.equal(requests.length,requestCount,'old retry cannot redraw a different hovered item');
 h.view.clear();requests[2].resolve(font);await settleDescription();assert.equal(h.description.children.length,0);
 pass('description font failures retry the current item and cannot revive a stale retry after disconnect');
}
{
 let resolveFont;const painted=[];
 inventoryContext.loadNativeUiFont=()=>new Promise(resolve=>{resolveFont=resolve;});
 const h=nativeDescriptionView([potion]);h.view.describeItem(102,h.element.children[0]);h.panel.hidden=true;
 resolveFont({prepare:async()=>{},measure:()=>0,paint:()=>painted.push(true)});await settleDescription();assert.equal(painted.length,0);
 pass('hidden native inventory windows do not accept pending font rendering');
}
{
 const requests=[];
 inventoryContext.loadNativeUiFont=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 const h=nativeDescriptionView([sword,potion]);const first=h.element.children[0],second=h.element.children[1];
 first.onfocus();second.onfocus();first.onblur();first.onmouseleave();
 assert.equal(h.description.dataset.itemId,'102','old cell leave must not clear the current item');
 requests[1].reject(new Error('文字素材暂时不可用'));await settleDescription();
 assert.ok(h.description.children.some(node=>node.attributes.role==='alert'));
 h.panel.emit('pointerleave',{});assert.equal(h.description.children.length,0,'whole-window leave clears even the error');
 requests[0].resolve({prepare:async()=>{},measure:()=>0,paint:()=>{throw new Error('old item must not paint');}});
 await settleDescription();assert.equal(h.description.children.length,0);
 pass('bag-cell leave respects current source identity while whole-window leave still clears a font error');
}
{
 const items=[{...potion,looks:396},{...sword,looks:37},{...sword,makeIndex:103,looks:148}];
 const frames=new Map([[396,{width:20,height:29}],[37,{width:40,height:30}],[148,{width:16,height:19}]]);
 const h=nativeDescriptionView(items);h.element.closest=selector=>selector==='.national-window'?h.panel:undefined;
 h.view.iconAssets={state:item=>({status:'ready',url:`/native-${item.looks}.png`,frame:frames.get(item.looks)}),epoch:()=>0,imageUrl:url=>url};
 h.view.update(items[0]);
 const rendered=h.element.children.filter(cell=>cell.dataset.itemId).map(cell=>({id:cell.dataset.itemId,icon:cell.children[0],cell}));
 assert.deepEqual(rendered.map(({icon})=>[icon.style.left,icon.style.top]),[['9px','1px'],['-1px','1px'],['11px','6px']]);
 assert.deepEqual(rendered.map(({icon})=>[icon.width,icon.height]),[[20,29],[40,30],[16,19]],'oversize source frames must keep their natural dimensions');
 assert.ok(rendered.every(({icon})=>icon.classList.contains('native-bag-item-icon')));
 assert.equal(rendered[0].cell.style.left,'18px');assert.equal(rendered[0].cell.style.width,'36px','sprite placement must not change the hit cell');
 h.view.iconAssets.state=()=>({status:'failed',frame:{width:40,height:30}});h.view.update(items[0]);
 assert.equal(h.element.children[0].children[0].classList.contains('native-bag-item-icon'),false,'failed icon placeholders must keep their retry layout');
 pass('native bag icons use integer source-frame anchors and natural oversize dimensions without changing hit cells or failed placeholders');
}
assert.equal(groups,27);
