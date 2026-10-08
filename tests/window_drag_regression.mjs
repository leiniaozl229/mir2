import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/window-drag.ts'),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
class DragTarget{constructor(hasHandle=true){this.hasHandle=hasHandle;}closest(selector){if(this.hasHandle&&selector==='[data-window-drag-handle]')return this;return null;}}
vm.runInNewContext(output,{exports,Math,Number,JSON,Element:DragTarget,ResizeObserver:class{constructor(callback){this.callback=callback;}observe(){this.callback();}disconnect(){}},localStorage:{getItem:()=>null,setItem:(key,value)=>localStorage.values.set(key,value)}});
const {makeClassicWindowDraggable}=exports;

class EventTarget{
 constructor(){this.listeners=new Map();}
 addEventListener(type,listener){const list=this.listeners.get(type)??[];list.push(listener);this.listeners.set(type,list);}
 removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==listener));}
 dispatch(type,event={}){for(const listener of [...(this.listeners.get(type)??[])])listener(event);}
}
class FakeDocument extends EventTarget{
 constructor(){super();this.hidden=false;this.defaultView=new EventTarget();}
}
class FakeWindow extends EventTarget{
 constructor(scale=1){
  super();this.id='classic-window';this.ownerDocument=new FakeDocument();this.style={left:'100px',top:'80px',right:'auto',bottom:'auto',zIndex:'0',setProperty(){}};
  this.scale=scale;this.dataset={};this.offsetWidth=200;this.offsetHeight=100;this.hidden=false;this.captured=undefined;
  this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
 }
 getBoundingClientRect(){return {left:100*this.scale,top:80*this.scale,width:200*this.scale,height:100*this.scale};}
 setPointerCapture(id){this.captured=id;}
 hasPointerCapture(id){return this.captured===id;}
 releasePointerCapture(id){if(this.captured===id)this.captured=undefined;}
}
const localStorage={values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,value);}};
const surface={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
function fixture(){
 const element=new FakeWindow();
 makeClassicWindowDraggable(element,surface);
 const target=new DragTarget();
 element.dispatch('pointerdown',{button:0,pointerId:7,clientX:100,clientY:80,target,preventDefault(){}});
 element.dispatch('pointermove',{pointerId:7,clientX:150,clientY:100});
 return {element,target};
}
function assertRolledBack(reason,dispatch){
 localStorage.values.clear();
 const {element}=fixture();
 assert.equal(element.style.left,'150px',`drag moved before ${reason}`);
 dispatch(element);
 assert.equal(element.style.left,'100px',`${reason} restores the starting horizontal position`);
 assert.equal(element.style.top,'80px',`${reason} restores the starting vertical position`);
 assert.equal(element.dataset.windowMoved,undefined,`${reason} leaves the persistent moved flag unchanged`);
 assert.equal(element.classes.has('window-dragging'),false,`${reason} clears the drag visual state`);
 assert.equal(element.captured,undefined,`${reason} releases pointer capture`);
 assert.equal(localStorage.values.size,0,`${reason} does not persist an incomplete drag`);
}

assertRolledBack('pointercancel',element=>element.dispatch('pointercancel',{pointerId:7}));
assertRolledBack('lostpointercapture',element=>element.dispatch('lostpointercapture',{pointerId:7}));
assertRolledBack('window blur',element=>element.ownerDocument.defaultView.dispatch('blur'));
assertRolledBack('hidden tab',element=>{element.ownerDocument.hidden=true;element.ownerDocument.dispatch('visibilitychange');});
console.log('PASS: pointer cancellation, capture loss, blur and hidden-tab transitions roll back and release a window drag');

localStorage.values.clear();
const {element}=fixture();
element.dispatch('pointerup',{pointerId:7});
assert.equal(element.style.left,'150px');
assert.equal(element.style.top,'100px');
assert.equal(element.dataset.windowMoved,'true');
assert.equal(element.classes.has('window-dragging'),false);
assert.deepEqual(JSON.parse(localStorage.values.get('mir2.window-position.classic-window')),{left:150,top:100});
console.log('PASS: a completed drag saves its final position');

for(const [minimum,expected] of [[undefined,'0px'],[-3,'-3px']]){
 const positionWindow=new FakeWindow();positionWindow.style.left='0px';positionWindow.style.top='-3px';if(minimum!==undefined)positionWindow.dataset.windowMinTop=String(minimum);makeClassicWindowDraggable(positionWindow,surface);assert.equal(positionWindow.style.top,expected,minimum===undefined?'ordinary windows stay inside the stage':'source-defined negative guild origin remains visible');
}
console.log('PASS: source-defined negative top inset is preserved while ordinary windows stay inside the stage');

function dragAtScale(scale,screenOffsetY){
 localStorage.values.clear();const element=new FakeWindow(scale),surface={getBoundingClientRect:()=>({left:0,top:0,width:800*scale,height:600*scale})};makeClassicWindowDraggable(element,surface);
 const target=new DragTarget(false),bounds=element.getBoundingClientRect(),startY=bounds.top+screenOffsetY;
 element.dispatch('pointerdown',{button:0,pointerId:9,clientX:bounds.left+10*scale,clientY:startY,target,preventDefault(){}});
 element.dispatch('pointermove',{pointerId:9,clientX:bounds.left+26*scale,clientY:startY});element.dispatch('pointerup',{pointerId:9});
 return Number.parseFloat(element.style.left);
}
assert.equal(dragAtScale(.8,30),100,'at 80% scale a point 37.5 design px below the title edge must not drag from the body');
assert.equal(dragAtScale(.8,28),116,'at 80% scale a point 35 design px below the title edge must drag');
assert.equal(dragAtScale(1.25,38),116,'at 125% scale a point 30.4 design px below the title edge must drag');
assert.equal(dragAtScale(1.25,47),100,'at 125% scale a point 37.6 design px below the title edge must not drag from the body');
console.log('PASS: titlebar drag hit area stays aligned with 800x600 design coordinates at 80% and 125% scaling');

{
 const saved=new Map([['mir2.window-position.inventory-window',JSON.stringify({left:444,top:40})]]),versioned={};
 vm.runInNewContext(output,{exports:versioned,Math,Number,JSON,Element:DragTarget,localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)}});
 const window=new FakeWindow();window.id='inventory-window';window.style.left='0px';window.style.top='0px';versioned.makeClassicWindowDraggable(window,surface,'native-176-20261007');
 assert.equal(window.style.left,'0px');assert.equal(window.style.top,'0px');assert.equal(window.dataset.windowMoved,undefined,'previous web layout must not override the new original-client default');
 const next=new FakeWindow();next.id='inventory-window';saved.set('mir2.window-position.inventory-window.native-176-20261007',JSON.stringify({left:50,top:60}));versioned.makeClassicWindowDraggable(next,surface,'native-176-20261007');
 assert.equal(next.style.left,'50px');assert.equal(next.style.top,'60px');assert.equal(next.dataset.windowMoved,'true');assert.equal(saved.has('mir2.window-position.inventory-window'),true,'migration retains the old reversible layout');
 console.log('PASS: original window geometry starts fresh and restores only matching-version positions');
}
