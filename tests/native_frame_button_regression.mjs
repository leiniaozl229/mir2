import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/native-frame-button.ts'),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
vm.runInNewContext(output,{exports});
const {bindNativeFrameButtonStates}=exports;

class EventTarget{
 constructor(){this.listeners=new Map();}
 addEventListener(type,listener){const list=this.listeners.get(type)??[];list.push(listener);this.listeners.set(type,list);}
 dispatch(type,event={}){for(const listener of [...(this.listeners.get(type)??[])])listener(event);}
}
class FakeDocument extends EventTarget{
 constructor(){super();this.hidden=false;this.defaultView=new EventTarget();this.buttons=new Set();}
 querySelectorAll(selector){assert.equal(selector,'button[data-native-frame-states="bound"]');return [...this.buttons].filter(button=>button.dataset.nativeFrameStates==='bound');}
}
class FakeButton extends EventTarget{
 constructor(ownerDocument=new FakeDocument()){super();this.ownerDocument=ownerDocument;ownerDocument.buttons.add(this);this.dataset={};this.disabled=false;this.capture=undefined;this.focusVisible=false;}
 matches(selector){return selector===':focus-visible'&&this.focusVisible;}
 setPointerCapture(id){this.capture=id;}
 hasPointerCapture(id){return this.capture===id;}
 releasePointerCapture(id){if(this.capture===id)this.capture=undefined;}
}

function create(){
 const button=new FakeButton(),states=[];
 bindNativeFrameButtonStates(button,state=>states.push(state));
 return {button,states};
}

{
 const {button,states}=create();
 button.dispatch('pointerenter',{pointerType:'mouse'});
 button.dispatch('pointerdown',{button:0,pointerId:1,pointerType:'mouse'});
 button.dispatch('pointerleave');
 button.dispatch('pointercancel',{pointerId:1});
 assert.deepEqual(states,['normal','hover','pressed','normal']);
 assert.equal(button.capture,undefined);
 console.log('PASS: pointer cancellation restores native button normal state after the pointer leaves');
}
{
 const {button,states}=create();
 button.dispatch('pointerenter',{pointerType:'mouse'});
 button.dispatch('pointerdown',{button:0,pointerId:2,pointerType:'mouse'});
 button.dispatch('lostpointercapture',{pointerId:2});
 assert.deepEqual(states,['normal','hover','pressed','hover']);
 console.log('PASS: lost pointer capture releases the pressed native frame');
}
{
 const {button,states}=create();
 button.dispatch('pointerdown',{button:0,pointerId:3,pointerType:'mouse'});
 button.ownerDocument.defaultView.dispatch('blur');
 button.dispatch('pointerup',{pointerId:3});
 assert.deepEqual(states,['normal','pressed','normal']);
 console.log('PASS: window blur clears a held native button frame');
}
{
 const {button,states}=create();
 button.dispatch('pointerenter',{pointerType:'touch'});
 button.dispatch('pointerdown',{button:0,pointerId:4,pointerType:'touch'});
 button.dispatch('pointerup',{pointerId:4});
 assert.deepEqual(states,['normal','pressed','normal']);
 console.log('PASS: touch input uses pressed and normal states without a false hover state');
}
{
 const {button,states}=create();
 button.dispatch('pointerdown',{button:0,pointerId:41,pointerType:'touch'});
 button.dispatch('pointerup',{pointerId:41});
 button.dispatch('pointerenter',{pointerType:'mouse'});
 assert.deepEqual(states,['normal','pressed','normal','hover']);
 console.log('PASS: mouse hover recovers after a touch interaction on the same native button');
}
{
 const {button,states}=create();
 button.dispatch('pointerdown',{button:0,pointerId:5,pointerType:'mouse'});
 button.ownerDocument.hidden=true;
 button.ownerDocument.dispatch('visibilitychange');
 assert.deepEqual(states,['normal','pressed','normal']);
 console.log('PASS: hiding the page releases an active native button state');
}
{
 const {button,states}=create();
 button.focusVisible=true;button.dispatch('focus');
 button.dispatch('keydown',{key:'Enter',code:'Enter',repeat:false});
 button.dispatch('keyup',{key:'Enter',code:'Enter'});
 button.dispatch('blur');
 assert.deepEqual(states,['normal','hover','pressed','hover','normal']);
 console.log('PASS: keyboard focus and Enter show the native hover and pressed frames');
}
{
 const {button,states}=create();
 button.focusVisible=false;button.dispatch('focus');
 button.dispatch('keydown',{key:' ',code:'Space',repeat:false});
 button.dispatch('keyup',{key:' ',code:'Space'});
 assert.deepEqual(states,['normal','normal','pressed','normal']);
 console.log('PASS: Space shows the pressed frame without adding a pointer-focus hover');
}
{
 const {button,states}=create(),reskinned=[];
 button.dispatch('pointerenter',{pointerType:'mouse'});
 button.dispatch('pointerdown',{button:0,pointerId:6,pointerType:'mouse'});
 bindNativeFrameButtonStates(button,state=>reskinned.push(state));
 assert.deepEqual(states,['normal','hover','pressed']);
 assert.deepEqual(reskinned,['pressed']);
 button.dispatch('pointerleave');button.dispatch('pointercancel',{pointerId:6});
 assert.deepEqual(reskinned,['pressed','normal']);
 console.log('PASS: async reskin replaces the visual callback without losing the active pointer state');
}
{
 const document=new FakeDocument(),first=new FakeButton(document),second=new FakeButton(document),firstStates=[],secondStates=[];
 bindNativeFrameButtonStates(first,state=>firstStates.push(state));bindNativeFrameButtonStates(second,state=>secondStates.push(state));
 assert.equal(document.defaultView.listeners.get('blur')?.length,1);
 assert.equal(document.listeners.get('visibilitychange')?.length,1);
 first.dispatch('pointerdown',{button:0,pointerId:7,pointerType:'mouse'});second.dispatch('pointerdown',{button:0,pointerId:8,pointerType:'touch'});
 document.defaultView.dispatch('blur');
 assert.deepEqual(firstStates,['normal','pressed','normal']);assert.deepEqual(secondStates,['normal','pressed','normal']);
 assert.equal(first.capture,undefined);assert.equal(second.capture,undefined);
 console.log('PASS: all native buttons in one document share lifecycle listeners and reset active presses on blur');
}
