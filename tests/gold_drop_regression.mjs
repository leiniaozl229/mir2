import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('apps/web/src/gold-drop.ts');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let moduleContext={exports:{},setTimeout,clearTimeout};vm.createContext(moduleContext);vm.runInContext(compiled,moduleContext,{filename:'gold-drop.ts'});
const {GoldDropController}=moduleContext.exports;
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

class EventTargetFake{
 listeners=new Map();
 addEventListener(type,callback,capture=false){const list=this.listeners.get(type)??[];list.push({callback,capture:Boolean(capture)});this.listeners.set(type,list);}
 removeEventListener(type,callback,capture=false){this.listeners.set(type,(this.listeners.get(type)??[]).filter(row=>row.callback!==callback||row.capture!==Boolean(capture)));}
 run(event,capture){for(const row of [...(this.listeners.get(event.type)??[])])if(row.capture===capture){row.callback(event);if(event.immediate)break;}}
}
class ElementFake extends EventTargetFake{
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.parentElement=null;this.children=[];this.dataset={};this.style={};this.attributes={};this.hidden=false;this.textContent='';this.className='';}
 append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}
 remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(value=>value!==this);this.parentElement=null;}}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 contains(target){return target===this||this.children.some(child=>child.contains(target));}
 closest(selector){const choices=selector.split(',').map(value=>value.trim());for(let node=this;node;node=node.parentElement){for(const part of choices){if(part==='.item-cell'&&node.className.split(' ').includes('item-cell'))return node;if(part==='.inventory-item-tooltip'&&node.className.split(' ').includes('inventory-item-tooltip'))return node;if(part==='[data-window-close]'&&node.dataset.windowClose!==undefined)return node;}}return null;}
 getBoundingClientRect(){const left=Number.parseFloat(this.style.left)||10,top=Number.parseFloat(this.style.top)||20,width=Number.parseFloat(this.style.width)||111,height=Number.parseFloat(this.style.height)||14;return {left,top,width,height,right:left+width,bottom:top+height};}
}
class DocumentFake extends EventTargetFake{
 constructor(){super();this.body=new ElementFake('body',this);this.defaultView=new EventTargetFake();}
 createElement(tag){return new ElementFake(tag,this);}
}
function fire(target,type,values={}){
 const event={type,target,button:0,pointerId:1,key:'',clientX:0,clientY:0,defaultPrevented:false,immediate:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;},...values};
 const doc=target instanceof DocumentFake?target:target.ownerDocument,path=[];if(!(target instanceof DocumentFake))for(let node=target;node;node=node.parentElement)path.push(node);
 doc.run(event,true);for(const node of [...path].reverse()){if(event.stopped)break;node.run(event,true);}for(const node of path){if(event.stopped)break;node.run(event,false);}if(!event.stopped)doc.run(event,false);return event;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({available=true,sendResult=true,timeoutMs=5000}={}){
 const document=new DocumentFake(),bag=document.createElement('section'),gold=document.createElement('button'),amountOutput=document.createElement('output'),world=document.createElement('canvas'),empty=document.createElement('button'),occupied=document.createElement('button');
 empty.className='item-cell';occupied.className='item-cell';occupied.dataset.itemId='41';bag.append(gold,amountOutput,empty,occupied);document.body.append(bag,world);
 const prompts=[],sent=[],statuses=[];
 const controller=new GoldDropController(gold,bag,world,{amountOutput,available:()=>available.value??available,prompt:request=>new Promise(resolve=>prompts.push({request,resolve})),send:amount=>{sent.push(amount);return sendResult;},status:text=>statuses.push(text),timeoutMs});
 return {document,bag,gold,amountOutput,world,empty,occupied,prompts,sent,statuses,controller};
}
function pickUp(f){fire(f.gold,'click');assert.equal(f.controller.debugState().moving,true);}
function dropOnWorld(f){const down=fire(f.world,'pointerdown');assert.equal(down.defaultPrevented,true);const event=fire(f.world,'pointerup');assert.equal(event.defaultPrevented,true);assert.equal(f.prompts.length>0,true);}
async function answer(f,value,result='ok'){f.prompts.at(-1).resolve({result,value});await tick();}

{
 const f=fixture();f.controller.setGold(100);pickUp(f);assert.equal(f.gold.dataset.goldDropState,'moving');assert.equal(f.gold.getAttribute('aria-grabbed'),'true');fire(f.document,'pointermove',{clientX:80,clientY:90});assert.equal(f.document.body.children.at(-1).className,'inventory-gold-cursor');
 fire(f.empty,'click');fire(f.occupied,'click');assert.equal(f.prompts.length,0);assert.equal(f.controller.debugState().moving,true);
 dropOnWorld(f);assert.equal(f.prompts[0].request.input.maxLength,5);assert.equal(f.prompts[0].request.input.inputMode,'numeric');assert.equal(f.prompts[0].request.input.profile,'gold');assert.equal(f.controller.debugState().moving,false);assert.equal(f.prompts[0].request.buttons.join(','),'ok');assert.equal(f.prompts[0].request.text,'你想放下多少金币?');assert.equal(f.gold.textContent,'');
 pass('coin pickup retains gold over bag cells; only a world click opens the same-version one-OK quantity prompt');f.controller.destroy();
}
{
 const f=fixture();f.controller.setGold(100);pickUp(f);dropOnWorld(f);await answer(f,'100');assert.deepEqual(f.sent,[]);assert.match(f.statuses.at(-1),/1 到 99/);
 pickUp(f);dropOnWorld(f);await answer(f,'1.5');assert.deepEqual(f.sent,[]);assert.match(f.statuses.at(-1),/整数/);
 pickUp(f);dropOnWorld(f);await answer(f,'99');assert.deepEqual(f.sent,[99]);assert.equal(f.amountOutput.textContent,'100');assert.equal(f.controller.debugState().pending.amount,99);assert.match(f.statuses.at(-1),/等待服务器确认/);
 f.controller.setGold(1);assert.equal(f.controller.debugState().pending,undefined);assert.equal(f.amountOutput.textContent,'1');assert.equal(f.statuses.at(-1),'已丢弃 99 金币');
 pass('input enforces positive integer, packet and retain-one limits without optimistic balance edits, then settles only from server currency');f.controller.destroy();
}
{
 const f=fixture();f.controller.setGold(250000);pickUp(f);dropOnWorld(f);await answer(f,'65535');assert.deepEqual(f.sent,[65535]);f.controller.setGold(184465);assert.equal(f.statuses.at(-1),'已丢弃 65,535 金币');
 pickUp(f);fire(f.gold,'click');assert.equal(f.controller.debugState().moving,false);assert.equal(f.gold.getAttribute('aria-grabbed'),'false');
 pickUp(f);fire(f.occupied,'click');assert.equal(f.controller.debugState().moving,true);assert.equal(f.prompts.length,1);
 pass('legacy 16-bit amount ceiling is respected while large balances remain server-owned and occupied items retain the carried gold token');f.controller.destroy();
}
{
 const f=fixture();f.controller.setGold(12);pickUp(f);fire(f.document,'keydown',{key:'Escape'});assert.equal(f.controller.debugState().moving,false);assert.equal(f.gold.dataset.goldDropState,'idle');
 pickUp(f);dropOnWorld(f);await answer(f,'5','interrupted');assert.equal(f.sent.length,0);
 pickUp(f);dropOnWorld(f);await answer(f,'5');assert.equal(f.sent[0],5);f.controller.serverMessage('安全区禁止丢弃');assert.equal(f.controller.debugState().pending,undefined);assert.match(f.statuses.at(-1),/安全区禁止丢弃/);
 pass('Escape, prompt interruption and authoritative system rejection release carry/pending state without changing gold');f.controller.destroy();
}
{
 const f=fixture({sendResult:false});f.controller.setGold(10);pickUp(f);dropOnWorld(f);await answer(f,'4');assert.deepEqual(f.sent,[4]);assert.equal(f.controller.debugState().pending,undefined);assert.match(f.statuses.at(-1),/未发送/);
 const g=fixture({timeoutMs:5});g.controller.setGold(10);pickUp(g);dropOnWorld(g);await answer(g,'4');await new Promise(resolve=>setTimeout(resolve,15));assert.equal(g.controller.debugState().pending,undefined);assert.equal(g.amountOutput.textContent,'10');assert.match(g.statuses.at(-1),/尚未确认/);
 pass('failed writes and missing acknowledgements clear waits while preserving the last server-provided balance');f.controller.destroy();g.controller.destroy();
}

{
 const f=fixture();f.controller.setGold(100);pickUp(f);dropOnWorld(f);
 const previous=f.prompts[0];assert.equal(f.controller.debugState().promptPending,true);
 fire(f.gold,'click');assert.equal(f.controller.debugState().moving,false);assert.equal(f.prompts.length,1);
 f.controller.interrupt();pickUp(f);dropOnWorld(f);
 previous.resolve({result:'ok',value:'15'});await tick();
 assert.deepEqual(f.sent,[]);assert.equal(f.controller.debugState().promptPending,true);
 await answer(f,'20');assert.deepEqual(f.sent,[20]);assert.equal(f.amountOutput.textContent,'100');
 pass('closing and reopening cannot submit an old quantity answer or release a newer prompt');f.controller.destroy();
}
{
 const f=fixture();f.controller.setGold(100);pickUp(f);dropOnWorld(f);
 f.document.defaultView.run({type:'blur'},false);await answer(f,'15');
 assert.deepEqual(f.sent,[]);assert.equal(f.controller.debugState().promptPending,false);
 pickUp(f);dropOnWorld(f);f.controller.destroy();await answer(f,'15');
 assert.deepEqual(f.sent,[]);assert.equal(f.amountOutput.textContent,'100');
 pass('window blur and disposal invalidate unsubmitted quantity requests without spending gold');
}
{
 const f=fixture();f.controller.setGold(100);pickUp(f);fire(f.document,'pointercancel');
 assert.equal(f.controller.debugState().moving,false);assert.equal(f.gold.getAttribute('aria-grabbed'),'false');
 pickUp(f);f.document.hidden=true;fire(f.document,'visibilitychange');assert.equal(f.controller.debugState().moving,false);
 f.document.hidden=false;pickUp(f);f.controller.setGold(0);assert.equal(f.controller.debugState().moving,false);
 f.controller.setGold(100);pickUp(f);dropOnWorld(f);await answer(f,'20');fire(f.document,'pointercancel');
 assert.equal(f.controller.debugState().pending,undefined);assert.equal(f.amountOutput.textContent,'100');
 pass('pointer cancellation, hidden pages and depleted server balance release carry and waits with authoritative currency preserved');f.controller.destroy();
}

assert.equal(groups,8);
console.log(`TOTAL ${groups} gold-drop production regression groups PASS; fake DOM and protocol callback, no real browser or persistence claim`);
