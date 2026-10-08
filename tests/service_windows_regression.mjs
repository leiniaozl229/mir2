import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {itemIconProductionSource} from './item_icon_test_source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/service-ui.json'));
const production=['apps/web/src/service-window.ts','apps/web/src/shop.ts','apps/web/src/repair.ts','apps/web/src/storage.ts'];
function functions(file,names){
 const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 return names.map(name=>{const node=source.statements.find(value=>ts.isFunctionDeclaration(value)&&value.name?.text===name);assert.ok(node,`${file}: ${name} missing`);return node.getText(source);}).join('\n');
}
const source=`${itemIconProductionSource(root)}const serviceUi=${JSON.stringify(contract)};let activeItemTooltipTarget,activeItemTooltip;const tooltipLifecycleDocuments=new WeakSet();\n${functions('apps/web/src/inventory.ts',['itemDetailRows','appendItemDetailRows','itemTooltipFor','itemTooltipStage','positionItemTooltip','tooltipTargetVisible','refreshActiveItemTooltip','observeItemTooltipLifecycle','showItemTooltip','hideItemTooltip','attachItemTooltip','itemTypeName'])}\n${functions('apps/web/src/mining-controller.ts',['orePurity'])}\n${production.map(file=>read(file).replace(/^import .*;\r?\n/gm,'')).join('\n')}`;
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

class Clock{
 now=0;next=1;tasks=new Map();
 set=(callback,delay)=>{const id=this.next++;this.tasks.set(id,{callback,due:this.now+delay});return id;};
 clear=id=>this.tasks.delete(id);
 advance(ms){this.now+=ms;for(const [id,task] of [...this.tasks])if(task.due<=this.now){this.tasks.delete(id);task.callback();}}
 callback(){return [...this.tasks.values()].at(-1)?.callback;}
}
class Events{
 listeners=new Map();
 addEventListener(type,callback){const entries=this.listeners.get(type)??[];entries.push(callback);this.listeners.set(type,entries);}
 removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==callback));}
 emit(type,event={}){for(const callback of [...(this.listeners.get(type)??[])])callback(event);}
}
function environment({assets=false}={}){
 const clock=new Clock(),document=new Events();document.defaultView=new Events();document.hidden=false;document.elements=new Map();document.getElementById=id=>document.elements.get(id);document.observers=[];document.flushObservers=()=>{for(const observer of document.observers)observer.callback();};
 class Element extends Events{
  constructor(tag='div'){
   super();this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.className='';this.ownerDocument=document;this.rect={left:0,top:0,right:0,bottom:0,width:0,height:0};
   this.style={setProperty(name,value){this[name]=value;}};
   this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(name=>!names.includes(name)).join(' ');},contains:name=>this.className.split(' ').includes(name)};
  }
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}document.flushObservers?.();}
  replaceChildren(...children){for(const child of this.children)child.parentElement=undefined;this.children=[];for(const child of children){this.children.push(child);child.parentElement=this;}document.flushObservers?.();}
  setAttribute(name,value){this.attributes[name]=String(value);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(value=>value!==this);this.parentElement=undefined;document.flushObservers?.();}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  closest(selector){if(selector!=='[hidden]')return null;for(let node=this;node;node=node.parentElement)if(node.hidden)return node;return null;}
  get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===document.body;}
  getBoundingClientRect(){return this.rect;}
 }
 document.createElement=tag=>new Element(tag);document.body=new Element('body');
 const stage=new Element('section');stage.id='viewport-shell';stage.rect={left:100,top:50,right:500,bottom:350,width:400,height:300};
 const tooltipLayer=new Element('div'),tooltip=new Element('aside');tooltip.id='item-tooltip';tooltip.className='inventory-item-tooltip';tooltip.hidden=true;tooltip.rect={left:0,top:0,right:94,bottom:50,width:94,height:50};
 document.body.append(stage);stage.append(tooltipLayer);tooltipLayer.append(tooltip);document.elements.set('viewport-shell',stage);document.elements.set('item-tooltip',tooltip);
 class Observer{constructor(callback){this.callback=callback;document.observers.push(this);}observe(target){this.target=target;}}
 const libraries={prguse:{frames:{385:{file:'menu.png',width:308,height:205},392:{file:'slot.png',width:140,height:181}}},items:JSON.parse(read('assets/web/ui-national/items/library.json'))};
 const pending=()=>new Promise(()=>{});
 const context={exports:{},document,MutationObserver:Observer,setTimeout:clock.set,clearTimeout:clock.clear,loadNationalUiLibrary:name=>assets?Promise.resolve(libraries[name]):pending(),fetch:pending};
 vm.createContext(context);vm.runInContext(compiled,context);
 return {clock,document,stage,tooltip,Element,attachItemTooltip:context.attachItemTooltip,...context.exports};
}
const sword={name:'木剑',makeIndex:101,durability:8500,maxDurability:10000,stdMode:5,weight:1,looks:1,dc:{min:0,max:5}};
const other={...sword,name:'铁剑',makeIndex:102};
const goods=Array.from({length:23},(_,i)=>({name:`药品${i}`,subMenu:0,price:10+i,stock:5}));
const details=(count,start=201)=>Array.from({length:count},(_,i)=>({name:'木剑',makeIndex:start+i,price:30+i,durability:7000+i*100,stdMode:5,weight:1,looks:1,item:{...sword,makeIndex:start+i,maxDurability:0,price:30+i,bonus:{dc:1}}}));
const walk=element=>[element,...element.children.flatMap(walk)];
const find=(element,predicate)=>walk(element).find(predicate);
const rows=element=>walk(element).filter(node=>node.classList.contains('service-menu-row'));
const control=(element,name)=>find(element,node=>node.dataset.serviceControl===name);
const slot=element=>find(element,node=>node.dataset.serviceItemSlot!==undefined);
const event=()=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}});
function click(element){assert.ok(element,'click target missing');if(!element.disabled)element.onclick?.(event());}
function doubleClick(element){click(element);if(!element.disabled)element.ondblclick?.(event());}
const state=view=>JSON.parse(JSON.stringify(view.debugState()));
function shopFixture(options){const env=environment(options),panel=new env.Element(),sent=[];env.stage.append(panel);let sending=true,focusAfterClose;const send=(kind,...args)=>{sent.push({kind,args});if(sending instanceof Error)throw sending;return sending;};const view=new env.ShopView(panel,{details:(...args)=>send('details',...args),buy:(...args)=>send('buy',...args),quote:(...args)=>send('quote',...args),sell:(...args)=>send('sell',...args),close:()=>sent.push({kind:'close'}),afterClose:focused=>{focusAfterClose=focused;}});return {...env,panel,sent,view,focusAfterClose:()=>focusAfterClose,setSend:value=>{sending=value;}};}
function repairFixture(){const env=environment(),panel=new env.Element(),sent=[];env.stage.append(panel);let sending=true;const send=(kind,...args)=>{sent.push({kind,args});if(sending instanceof Error)throw sending;return sending;};const view=new env.RepairView(panel,{quote:(...args)=>send('quote',...args),repair:(...args)=>send('repair',...args),close:()=>sent.push({kind:'close'})});return {...env,panel,sent,view,setSend:value=>{sending=value;}};}
function storageFixture(){const env=environment(),panel=new env.Element(),sent=[];env.stage.append(panel);let sending=true;const view=new env.StorageView(panel,{store:(...args)=>{sent.push({kind:'store',args});return sending;},take:(...args)=>{sent.push({kind:'take',args});return sending;},close:()=>sent.push({kind:'close'})});return {...env,panel,sent,view,setSend:value=>{sending=value;}};}

{
 const env=environment(),panel=new env.Element();panel.dataset.serviceMode='buy';
 assert.equal(env.skinServiceWindow(panel,{frames:{385:{file:'menu.png'}}}),true);assert.equal(panel.dataset.serviceFrame,'385');assert.equal(panel.style.width,'308px');
 assert.equal(panel.style['--service-list-height'],'130px');assert.equal(panel.style['--service-menu-columns'],'139px 88px 41px');assert.equal(panel.style['--service-confirm-x'],`${contract.menu.confirm.x}px`);
 panel.dataset.windowMoved='true';panel.style.left='17px';panel.dataset.serviceMode='sell';env.skinServiceWindow(panel,{frames:{392:{file:'slot.png'}}});
 assert.equal(panel.style.left,'17px');assert.equal(panel.dataset.serviceFrame,'392');assert.equal(panel.style.width,'140px');assert.equal(panel.style['--service-item-width'],'61px');assert.equal(panel.style.backgroundImage,'url(/ui-national/prguse/slot.png)');
 assert.ok(read('apps/web/src/classic-hud.ts').includes('skinServiceWindow(element,this.nationalLibraries.get(\'prguse\'))'));assert.ok(!read('apps/web/src/service-window.css').includes('left:292px'));
 pass('production skin uses the shared native385/392 contract, exposes hotzone variables and retains dragged placement');
}
{
 const {view,panel,sent,clock}=shopFixture();view.open(1,goods);assert.equal(rows(panel).length,10);assert.equal(slot(panel),undefined);assert.equal(view.acceptsInventoryItem(),false);assert.equal(view.offerInventoryItem(sword),false);
 doubleClick(rows(panel)[0]);assert.equal(sent.length,0);assert.equal(state(view).selectedName,'药品0');assert.equal(control(panel,'confirm').disabled,false);
 click(control(panel,'confirm'));click(control(panel,'confirm'));assert.deepEqual(sent,[{kind:'buy',args:[1,'药品0']}]);assert.equal(clock.tasks.size,1);assert.equal(state(view).goods[0].stock,5);
 assert.equal(view.resolve('药品1',undefined,true),false);assert.equal(view.showDetails(1,[],0,'药品0'),false);assert.equal(view.resolve('药品0',undefined,false),true);assert.equal(state(view).goods[0].stock,5);assert.equal(clock.tasks.size,0);
 click(control(panel,'confirm'));assert.equal(view.resolve('药品0',undefined,true),true);assert.equal(state(view).goods[0].stock,4);assert.equal(goods[0].stock,5);assert.equal(view.resolve('药品0',undefined,true),false);
 pass('catalog selection and doubleclick do not buy; confirm sends once and only matching accepted results change copied stock');
}
{
 const {view,panel,sent}=shopFixture();view.open(1,goods);click(control(panel,'next'));assert.equal(state(view).top,9);assert.equal(rows(panel)[0].dataset.shopItem,'药品9');assert.equal(rows(panel).length,10);
 click(control(panel,'next'));assert.equal(state(view).top,18);assert.equal(rows(panel).length,5);assert.equal(control(panel,'next').disabled,true);click(control(panel,'previous'));assert.equal(state(view).top,9);assert.equal(sent.length,0);
 pass('catalog local pages retain the reference ten rows and nine-entry overlap without sending an economic request');
}
{
 const {view,panel,sent,clock}=shopFixture();view.open(1,[{name:'木剑',subMenu:1,price:30,stock:20}]);click(rows(panel)[0]);click(control(panel,'confirm'));
 assert.deepEqual(sent,[{kind:'details',args:[1,'木剑',0]}]);assert.equal(view.showDetails(2,details(10),0,'木剑'),false);assert.equal(view.showDetails(1,details(10),10,'木剑'),false);assert.equal(view.showDetails(1,details(10),0,'铁剑'),false);assert.equal(view.showDetails(1,[{...details(1)[0],name:'铁剑'}],0,'木剑'),false);assert.equal(clock.tasks.size,1);
 assert.equal(view.showDetails(1,details(10),0,'木剑'),true);assert.equal(rows(panel).length,10);doubleClick(rows(panel)[3]);assert.equal(sent.length,1);click(control(panel,'confirm'));
 assert.deepEqual(sent.at(-1),{kind:'buy',args:[1,'木剑',204]});assert.equal(view.showDetails(1,details(10),0,'木剑'),false);assert.equal(view.resolve('木剑',203,true),false);assert.equal(view.resolve('木剑',204,true),true);assert.equal(state(view).details.length,9);
 pass('detail requests require the pending NPC/name/page and selected instance; late detail packets cannot unlock a purchase');
}
{
 const {view,panel,sent}=shopFixture();view.open(1,[{name:'木剑',subMenu:1,price:30,stock:20}]);click(rows(panel)[0]);click(control(panel,'confirm'));view.showDetails(1,details(10),0,'木剑');click(control(panel,'next'));
 assert.deepEqual(sent.at(-1),{kind:'details',args:[1,'木剑',10]});assert.equal(view.showDetails(1,details(10),0,'木剑'),false);assert.equal(view.showDetails(1,[],10,'木剑'),true);assert.equal(rows(panel).length,0);assert.equal(control(panel,'next').disabled,true);assert.equal(control(panel,'previous').disabled,false);
 click(control(panel,'previous'));assert.deepEqual(sent.at(-1),{kind:'details',args:[1,'木剑',0]});view.showDetails(1,details(2),0,'木剑');assert.equal(control(panel,'next').disabled,true);click(find(panel,node=>node.classList.contains('service-return')));assert.equal(state(view).details,undefined);assert.equal(rows(panel)[0].dataset.shopItem,'木剑');
 pass('native detail paging requests ten-entry offsets, handles empty/short pages and permits return to the catalog');
}
{
 const {view,panel,sent}=shopFixture();view.openSell(1,[sword,other]);assert.equal(rows(panel).length,0);assert.ok(slot(panel));assert.equal(view.offerInventoryItem({...sword,makeIndex:999}),false);
 assert.equal(view.offerInventoryItem({...sword,name:'伪造名称',durability:1}),true);assert.equal(state(view).selectedItem.name,'木剑');assert.equal(state(view).selectedItem.durability,8500);assert.deepEqual(sent,[{kind:'quote',args:[1,101]}]);assert.equal(view.acceptsInventoryItem(),false);
 assert.equal(view.showSellQuote(2,sword,12),false);assert.equal(view.showSellQuote(1,other,12),false);assert.equal(view.showSellQuote(1,sword,12),true);assert.equal(sent.length,1);click(control(panel,'confirm'));assert.deepEqual(sent.at(-1),{kind:'sell',args:[1,101]});assert.equal(view.showSellQuote(1,sword,999),false);assert.equal(view.resolveSale(other,true),false);assert.equal(view.resolveSale(sword,false),true);assert.equal(state(view).selectedItem.makeIndex,101);assert.equal(state(view).quote,undefined);
 click(control(panel,'confirm'));assert.equal(sent.at(-1).kind,'quote');view.showSellQuote(1,sword,12);click(control(panel,'confirm'));assert.equal(view.resolveSale(sword,true),true);assert.equal(state(view).selectedItem,undefined);assert.equal(sword.makeIndex,101);
 pass('sell uses one authoritative hanging instance, queries before separate confirm and rejects wrong NPC/instance/phase results');
}
{
 const {view,panel,sent}=shopFixture();view.openSell(1,[sword]);view.offerInventoryItem(sword);view.showSellQuote(1,sword,0);assert.equal(control(panel,'confirm').disabled,true);click(control(panel,'confirm'));assert.equal(sent.length,1);click(slot(panel));assert.equal(state(view).selectedItem,undefined);assert.equal(state(view).quote,undefined);assert.equal(sent.length,1);
 pass('nonpositive sale quotes disable confirmation; clicking the unsubmitted slot cancels presentation without deleting the bag instance');
}
{
 const {view,panel,sent}=shopFixture(),hand=[];view.setInventoryInteraction({reserve:(makeIndex,reserved)=>{hand.push(['reserve',makeIndex,reserved]);return true;},hold:(makeIndex,x,y)=>{hand.push(['hold',makeIndex,x,y]);return true;}});
 view.openSell(1,[sword]);view.offerInventoryItem(sword);view.showSellQuote(1,sword,12);const clickEvent={...event(),clientX:47,clientY:63};slot(panel).onclick(clickEvent);
 assert.equal(clickEvent.defaultPrevented,true);assert.deepEqual(hand,[['reserve',101,true],['hold',101,47,63],['reserve',101,false]]);assert.equal(state(view).selectedItem,undefined);assert.equal(state(view).quote,undefined);assert.equal(sent.length,1);
 pass('clicking a quoted sell-slot item returns its current instance to the pointer hand without sending or removing it');
}
{
 const {view,panel}=shopFixture();view.setInventoryInteraction({reserve:()=>true,hold:()=>false});view.openSell(1,[sword]);view.offerInventoryItem(sword);view.showSellQuote(1,sword,12);slot(panel).onclick({...event(),clientX:2,clientY:3});
 assert.equal(state(view).selectedItem.makeIndex,101);assert.equal(state(view).quote.price,12);
 pass('a sell-slot return refused by the inventory keeps the item and quote in the service slot');
}
{
 const {view,panel,sent,clock}=repairFixture();view.open(1,[sword]);assert.equal(view.offerInventoryItem(sword),true);assert.deepEqual(sent,[{kind:'quote',args:[1,101]}]);assert.equal(view.showQuote(1,other,0),false);assert.equal(view.showQuote(1,sword,-1),true);assert.equal(control(panel,'confirm').disabled,true);assert.equal(clock.tasks.size,0);
 click(slot(panel));view.offerInventoryItem(sword);view.showQuote(1,sword,0);assert.equal(control(panel,'confirm').disabled,false);click(control(panel,'confirm'));assert.deepEqual(sent.at(-1),{kind:'repair',args:[1,101]});assert.equal(state(view).selectedItem.durability,8500);assert.equal(view.showQuote(1,sword,12),false);assert.equal(view.resolve(other,true),false);assert.equal(view.resolve({...sword,durability:10000},true),true);assert.equal(state(view).selectedItem.durability,10000);assert.equal(sword.durability,8500);assert.equal(state(view).quote,undefined);
 pass('repair rejects negative quotes, allows server-provided zero cost and updates durability only after matching accepted repair');
}
{
 const {view,panel,sent}=storageFixture();view.openDeposit(1,[sword,other]);assert.equal(view.offerInventoryItem({...sword,name:'伪造名称'}),true);assert.equal(state(view).selectedItem.name,'木剑');assert.equal(sent.length,0);assert.equal(state(view).items.length,2);
 click(slot(panel));assert.equal(state(view).selectedItem,undefined);assert.equal(sent.length,0);view.offerInventoryItem(sword);click(control(panel,'confirm'));click(control(panel,'confirm'));assert.deepEqual(sent,[{kind:'store',args:[1,101]}]);assert.equal(view.offerInventoryItem(other),false);assert.equal(view.resolve(other,true),false);assert.equal(state(view).items.length,2);view.resolve(sword,false);assert.equal(state(view).selectedItem.makeIndex,101);click(control(panel,'confirm'));view.resolve(sword,true);assert.deepEqual(state(view).items.map(item=>item.makeIndex),[102]);assert.equal(sword.makeIndex,101);
 pass('storage deposit stages without a network command, then confirms once and removes only presentation after authoritative acceptance');
}
{
 const {view,panel,sent}=storageFixture();const items=Array.from({length:23},(_,i)=>({...sword,makeIndex:200+i,name:`仓库物品${i}`}));view.openItems(1,items);assert.equal(rows(panel).length,10);assert.equal(slot(panel),undefined);assert.equal(view.acceptsInventoryItem(),false);assert.equal(view.offerInventoryItem(sword),false);
 click(control(panel,'next'));assert.equal(state(view).top,9);assert.equal(rows(panel)[0].dataset.storageItem,'209');doubleClick(rows(panel)[2]);assert.equal(sent.length,0);view.syncInventory([]);assert.equal(state(view).items.length,23);assert.equal(state(view).selectedItem.makeIndex,211);click(control(panel,'confirm'));assert.deepEqual(sent,[{kind:'take',args:[1,211]}]);assert.equal(view.resolve(other,true),false);view.resolve(items[11],true);assert.equal(state(view).items.length,22);
 pass('storage take retains ten-row/nine-step navigation, separate instance confirmation and independence from bag snapshots');
}
{
 const {view,panel,clock}=storageFixture();const items=Array.from({length:10},(_,i)=>({...sword,makeIndex:201+i}));view.openItems(1,items);click(rows(panel)[2]);click(control(panel,'confirm'));const callback=clock.callback();view.openItems(1,[...items,other]);assert.equal(state(view).pending.kind,'take');assert.equal(state(view).pending.makeIndex,203);assert.equal(state(view).selectedItem.makeIndex,203);assert.equal(clock.tasks.size,1);view.openItems(2,[other]);callback();assert.equal(state(view).npcId,2);assert.equal(state(view).pending,undefined);assert.equal(state(view).selectedItem,undefined);assert.equal(clock.tasks.size,0);
 pass('cumulative same-NPC storage pages preserve in-flight take, while a different NPC resets local selection and waiting');
}
{
 const {view,clock}=shopFixture();view.openSell(1,[sword]);view.offerInventoryItem(sword);view.syncInventory([{...sword,dc:{min:0,max:6}}]);assert.equal(state(view).selectedItem.dc.max,6);assert.equal(state(view).quote,undefined);assert.equal(state(view).pending,undefined);assert.equal(clock.tasks.size,0);assert.equal(view.showSellQuote(1,sword,12),false);
 view.offerInventoryItem(sword);view.showSellQuote(1,sword,12);view.syncInventory([{...sword,bonus:{dc:2}}]);assert.equal(state(view).quote,undefined);assert.equal(state(view).selectedItem.bonus.dc,2);
 pass('authoritative rare-property changes refresh the sell slot and invalidate captured quote waits and prices');
}
{
 const {view,panel,clock}=shopFixture();view.openSell(1,[sword]);view.offerInventoryItem(sword);view.showSellQuote(1,sword,12);click(control(panel,'confirm'));view.syncInventory([]);assert.equal(state(view).selectedItem,undefined);assert.equal(state(view).quote,undefined);assert.equal(state(view).pending.kind,'sale');assert.equal(clock.tasks.size,1);assert.equal(view.resolveSale(sword,true),true);assert.equal(clock.tasks.size,0);assert.equal(state(view).selectedItem,undefined);
 pass('bag removal clears the sell slot without releasing sent sale waiting; matching late acceptance cannot resurrect an item');
}
{
 const {view,panel,clock}=repairFixture();view.open(1,[sword]);view.offerInventoryItem(sword);view.syncInventory([]);assert.equal(state(view).pending,undefined);assert.equal(clock.tasks.size,0);assert.equal(view.showQuote(1,sword,2),false);
 view.syncInventory([sword]);view.offerInventoryItem(sword);view.showQuote(1,sword,2);click(control(panel,'confirm'));view.syncInventory([]);assert.equal(state(view).pending.kind,'repair');assert.equal(state(view).selectedItem,undefined);assert.equal(view.resolve({...sword,durability:10000},true),true);assert.equal(state(view).selectedItem,undefined);assert.equal(clock.tasks.size,0);
 pass('repair quote removal cancels waiting, but sent repair survives removal and its success does not recreate a missing selection');
}
{
 const {view,panel,clock}=storageFixture();view.openDeposit(1,[sword]);view.offerInventoryItem(sword);view.syncInventory([{...sword,durability:7000}]);assert.equal(state(view).selectedItem.durability,7000);click(control(panel,'confirm'));view.syncInventory([]);assert.equal(state(view).selectedItem,undefined);assert.equal(state(view).pending.kind,'store');assert.equal(clock.tasks.size,1);assert.equal(view.resolve(sword,true),true);assert.equal(state(view).items.length,0);assert.equal(clock.tasks.size,0);
 pass('deposit follows the newest bag attributes and retains the sent operation after its authoritative instance disappears');
}
{
 const {view,clock,setSend}=shopFixture();view.openSell(1,[sword,other]);view.offerInventoryItem(sword);view.showSellQuote(1,sword,12);setSend(false);assert.equal(view.offerInventoryItem(other),false);assert.equal(state(view).selectedItem.makeIndex,101);assert.equal(state(view).quote.price,12);assert.equal(state(view).pending,undefined);assert.equal(clock.tasks.size,0);setSend(new Error('closed socket'));assert.equal(view.offerInventoryItem(other),false);assert.equal(state(view).selectedItem.makeIndex,101);assert.equal(state(view).quote.price,12);assert.equal(clock.tasks.size,0);
 const repair=repairFixture();repair.view.open(1,[sword,other]);repair.view.offerInventoryItem(sword);repair.view.showQuote(1,sword,2);repair.setSend(false);assert.equal(repair.view.offerInventoryItem(other),false);assert.equal(state(repair.view).selectedItem.makeIndex,101);assert.equal(state(repair.view).quote.price,2);assert.equal(repair.clock.tasks.size,0);
 pass('failed or throwing quote sends restore the prior sell/repair slot and quote, with no orphan timer');
}
{
 const {view,panel,clock}=shopFixture();view.openSell(1,[sword]);view.offerInventoryItem(sword);const oldTimer=clock.callback();clock.advance(7999);assert.equal(state(view).pending.kind,'quote');clock.advance(1);assert.equal(state(view).pending,undefined);assert.equal(state(view).selectedItem.makeIndex,101);click(control(panel,'confirm'));oldTimer();assert.equal(state(view).pending.kind,'quote');assert.equal(clock.tasks.size,1);view.showSellQuote(1,sword,12);click(control(panel,'confirm'));assert.equal(state(view).pending.kind,'sale');oldTimer();assert.equal(state(view).pending.kind,'sale');view.clear();assert.equal(clock.tasks.size,0);assert.equal(view.resolveSale(sword,true),false);assert.equal(panel.hidden,true);
 pass('eight-second timeout permits retry while captured old timer identity cannot clear a new quote or sale; close drops only UI waits');
}
{
 const {view,panel,clock,document}=repairFixture();view.open(1,[sword]);view.offerInventoryItem(sword);document.defaultView.emit('blur');assert.equal(clock.tasks.size,0);assert.equal(state(view).pending,undefined);assert.equal(state(view).selectedItem.makeIndex,101);assert.equal(view.showQuote(1,sword,1),false);
 view.offerInventoryItem(sword);document.hidden=true;document.emit('visibilitychange');assert.equal(state(view).pending,undefined);assert.equal(clock.tasks.size,0);view.offerInventoryItem(sword);panel.emit('pointercancel');assert.equal(state(view).pending,undefined);assert.equal(clock.tasks.size,0);
 view.offerInventoryItem(sword);view.showQuote(1,sword,1);click(control(panel,'confirm'));document.defaultView.emit('blur');assert.equal(view.resolve({...sword,durability:10000},true),false);assert.equal(state(view).selectedItem.durability,8500);
 pass('blur, hidden document and pointercancel cancel local service waiting; late success remains for the external authority route');
}
{
 const {view,panel,sent,clock,document,focusAfterClose}=shopFixture();view.openSell(1,[sword]);view.offerInventoryItem(sword);document.activeElement=control(panel,'close');click(control(panel,'close'));assert.equal(sent.at(-1).kind,'close');assert.equal(panel.hidden,true);assert.equal(focusAfterClose(),true);assert.equal(clock.tasks.size,0);view.openSell(2,[other]);assert.equal(view.showSellQuote(1,sword,12),false);assert.equal(state(view).npcId,2);assert.equal(state(view).selectedItem,undefined);
 pass('native close hitzone clears component waiting, reports focus ownership after hide and rejects late quotes');
}
{
 const {view,panel,stage,tooltip,document,Element,attachItemTooltip}=shopFixture({assets:true});view.open(1,[{name:'木剑',subMenu:1,price:30,stock:2}]);click(rows(panel)[0]);click(control(panel,'confirm'));view.showDetails(1,details(1),0,'木剑');let row=rows(panel)[0];assert.equal(row.attributes['aria-describedby'],'item-tooltip');row.emit('pointerenter');assert.equal(find(tooltip,node=>node.textContent==='持久'),undefined);assert.ok(find(tooltip,node=>node.textContent==='攻击'));assert.ok(find(tooltip,node=>node.classList.contains('item-bonus')));
 const place=(left,top,width=20,height=10)=>{row.rect={left:stage.rect.left+left*.5,top:stage.rect.top+top*.5,right:stage.rect.left+(left+width)*.5,bottom:stage.rect.top+(top+height)*.5,width:width*.5,height:height*.5};row.emit('pointerenter');};
 place(10,10);assert.equal(tooltip.hidden,false);assert.equal(tooltip.style.left,'36px');assert.equal(tooltip.style.top,'10px');row.emit('pointerleave');
 place(760,20);assert.equal(tooltip.style.left,'566px');assert.equal(tooltip.style.top,'20px');row.emit('pointerleave');
 place(20,560);assert.equal(tooltip.style.left,'46px');assert.equal(tooltip.style.top,'470px');row.emit('pointerleave');
 place(760,560);assert.equal(tooltip.style.left,'566px');assert.equal(tooltip.style.top,'470px');document.emit('scroll');assert.equal(tooltip.hidden,true);
 place(10,10);row.remove();assert.equal(tooltip.hidden,true);const stillVisibleTarget=new Element();panel.append(stillVisibleTarget);attachItemTooltip(stillVisibleTarget,sword);stillVisibleTarget.emit('focusin');assert.equal(tooltip.hidden,false);panel.hidden=true;document.flushObservers();assert.equal(tooltip.hidden,true);panel.hidden=false;
 view.openSell(1,[{...sword,stdMode:43,durability:8500}]);view.offerInventoryItem({...sword,stdMode:43,durability:8500});view.showSellQuote(1,{...sword,stdMode:43,durability:8500},12);await Promise.resolve();await Promise.resolve();
 const currentSlot=slot(panel);currentSlot.emit('pointerenter');const icon=find(currentSlot,node=>node.tag==='img'),nativeFrame=JSON.parse(read('assets/web/ui-national/items/library.json')).frames[String(sword.looks)];assert.ok(icon);assert.equal(icon.style.width,`${nativeFrame.width}px`);assert.equal(icon.style.height,`${nativeFrame.height}px`);assert.equal(icon.src,`/ui-national/items/${nativeFrame.file}`);assert.ok(find(tooltip,node=>node.textContent==='纯度'));assert.ok(find(tooltip,node=>node.textContent==='8'));
 pass('production shared tooltip preserves real bonus fields, suppresses shop price-as-max-durability and uses native-size icons plus real ore rounding');
}

{
 const sale=shopFixture();sale.view.openSell(1,[sword]);sale.view.offerInventoryItem(sword);sale.view.showSellQuote(1,sword,12);click(control(sale.panel,'confirm'));
 assert.equal(sale.view.rejectPending('旧报价失败','quote'),false);assert.equal(state(sale.view).pending.kind,'sale');assert.equal(sale.clock.tasks.size,1);assert.equal(sale.view.rejectPending('出售失败','sale'),true);assert.equal(state(sale.view).pending,undefined);assert.equal(sale.clock.tasks.size,0);
 const purchase=shopFixture();purchase.view.open(1,goods);click(rows(purchase.panel)[0]);click(control(purchase.panel,'confirm'));
 assert.equal(purchase.view.rejectPending('旧成色失败','details'),false);assert.equal(state(purchase.view).pending.kind,'purchase');assert.equal(purchase.clock.tasks.size,1);assert.equal(purchase.view.rejectPending('购买失败','purchase'),true);assert.equal(purchase.clock.tasks.size,0);
 const repair=repairFixture();repair.view.open(1,[sword]);repair.view.offerInventoryItem(sword);repair.view.showQuote(1,sword,1);click(control(repair.panel,'confirm'));
 assert.equal(repair.view.rejectPending('旧询价失败','quote'),false);assert.equal(state(repair.view).pending.kind,'repair');assert.equal(repair.clock.tasks.size,1);assert.equal(repair.view.rejectPending('修理失败','repair'),true);assert.equal(repair.clock.tasks.size,0);
 const take=storageFixture();take.view.openItems(1,[sword]);click(rows(take.panel)[0]);click(control(take.panel,'confirm'));
 assert.equal(take.view.rejectPending('旧存入失败','store'),false);assert.equal(state(take.view).pending.kind,'take');assert.equal(take.clock.tasks.size,1);assert.equal(take.view.rejectPending('取回失败','take'),true);assert.equal(take.clock.tasks.size,0);
 pass('typed rejections clear only the matching service phase; old quote/details/store errors preserve newer sale/purchase/repair/take waits');
}

{
 const {view,panel,sent}=shopFixture();const catalog=[{name:'木剑',subMenu:1,price:30,stock:30}];
 const enterDetails=(npcId,count)=>{view.open(npcId,catalog);click(rows(panel)[0]);click(control(panel,'confirm'));assert.equal(view.showDetails(npcId,details(count),0,'木剑'),true);};
 enterDetails(1,10);assert.equal(control(panel,'next').disabled,false);click(rows(panel)[0]);click(control(panel,'confirm'));assert.equal(view.resolve('木剑',201,true),true);
 assert.equal(rows(panel).length,9);assert.equal(control(panel,'next').disabled,false);click(control(panel,'next'));assert.deepEqual(sent.at(-1),{kind:'details',args:[1,'木剑',10]});const requestCount=sent.length;assert.equal(state(view).detailPageFull,true);assert.equal(control(panel,'next').disabled,true);click(control(panel,'next'));assert.equal(sent.length,requestCount);
 assert.equal(view.showDetails(1,details(2,301),10,'木剑'),true);assert.equal(control(panel,'next').disabled,true);click(control(panel,'previous'));assert.equal(view.showDetails(1,details(10),0,'木剑'),true);assert.equal(control(panel,'next').disabled,false);
 click(control(panel,'next'));assert.equal(view.showDetails(1,[],10,'木剑'),true);assert.equal(control(panel,'next').disabled,true);
 enterDetails(1,10);click(find(panel,node=>node.classList.contains('service-return')));assert.equal(state(view).detailPageFull,false);click(rows(panel)[0]);click(control(panel,'confirm'));view.showDetails(1,details(1),0,'木剑');assert.equal(control(panel,'next').disabled,true);
 enterDetails(1,10);view.open(2,catalog);assert.equal(state(view).detailPageFull,false);click(rows(panel)[0]);click(control(panel,'confirm'));assert.equal(view.showDetails(1,details(10),0,'木剑'),false);assert.equal(state(view).detailPageFull,false);view.showDetails(2,details(1),0,'木剑');assert.equal(control(panel,'next').disabled,true);
 enterDetails(2,10);view.clear();assert.equal(state(view).detailPageFull,false);assert.equal(panel.hidden,true);
 pass('detail next-page availability uses the last server page, survives sold-row removal and resets on short/empty pages, catalog return, clear and new NPC');
}

assert.equal(groups,24);
console.log(`service windows production regression: ${groups} groups PASS`);
for(const file of [...production,'apps/web/src/service-window.css','content/classic-176/service-ui.json','apps/web/src/inventory.ts','apps/web/src/mining-controller.ts','tests/service_windows_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: actual production classes/helpers under fake DOM/timers; no browser, native runtime, server economic completion or visual-comparison claim.');
