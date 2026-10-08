import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(repo+'/content/classic-176/selection-actions.json','utf8'));
const hud=JSON.parse(fs.readFileSync(repo+'/content/classic-176/ui-layout.json','utf8')).nationalHud.labels.art;
const compile=file=>ts.transpileModule(fs.readFileSync(repo+'/apps/web/src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let groups=0;
// Decode dimensions from the actual checked PNG bytes at this non-browser boundary.
{
 const requests=[];let failed='';
 class Image{set src(url){fetch(url).then(r=>r.arrayBuffer()).then(data=>{const b=Buffer.from(data);this.naturalWidth=b.readUInt32BE(16);this.naturalHeight=b.readUInt32BE(20);this.onload();}).catch(()=>this.onerror());}}
 const context=vm.createContext({exports:{},Image,Blob,URL,AbortSignal,crypto:crypto.webcrypto,Uint8Array,Error,fetch:async url=>{
  requests.push(url);if(failed&&url.includes(failed))throw new Error('offline');const bytes=fs.readFileSync(repo+'/assets/web'+url);return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 }});
 vm.runInContext(compile('native-ui-art.ts'),context);
 const load=context.exports.createNativeUiArtLoader(contract.portraits.idle.art,'chrsel','选角人物');
 for(const base of [40,80,120,160,200,240]){const images=await load(Array.from({length:16},(_,i)=>base+i));assert.equal(images.size,16);for(const [index,image] of images){const frame=contract.portraits.idle.art.frames[index];assert.equal(image.naturalWidth,frame.width);assert.equal(image.naturalHeight,frame.height);}}
 assert.equal(requests.filter(u=>u.endsWith('library.json')).length,1);assert.equal(requests.filter(u=>u.endsWith('.png')).length,96);
 const digits=context.exports.createNativeUiArtLoader(hud,'prguse','HUD数字');failed=hud.frames[32].file;await assert.rejects(digits([32,39]));failed='';assert.equal((await digits(Object.keys(hud.frames).map(Number))).size,10);
 console.log('PASS actual shared loader hashes/decodes 96 role frames and ten HUD digits; one failed digit recovers immediately');groups++;
}
function fixture(){
 const tasks=[],timers=new Map(),pagehide=[];let timerId=0;
 const document={createElement:tag=>new Element(tag)};
 class Element{
  constructor(tag='div'){this.tag=tag;this.style={left:'71px',top:'52px'};this.dataset={};this.children=[];this.ownerDocument=document;this.isConnected=true;this.hidden=false;this.ops=[];}
  append(child){child.parentElement=this;this.children.push(child);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
  setAttribute(){}
  getContext(){return {clearRect:()=>{},drawImage:(...op)=>this.ops.push(op)};}
 }
 const context=vm.createContext({exports:{},Error,setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>{if(name==='pagehide')pagehide.push(fn);},require:specifier=>{
  if(specifier.endsWith('.json'))return {default:contract};
  if(specifier==='./native-ui-art')return {createNativeUiArtLoader:()=>indices=>new Promise((resolve,reject)=>tasks.push({indices,resolve:()=>resolve(new Map(indices.map(i=>[i,{index:i}]))),reject}))};
  throw new Error(specifier);
 }});
 vm.runInContext(compile('native-selection-portrait.ts'),context);
 const root=new Element(),parent=new Element(),portrait=new Element('img');root.dataset.authScene='select';parent.append(portrait);
 return {controller:new context.exports.NativeSelectionPortrait(root,portrait),root,portrait,parent,tasks,timers,pagehide,tick:()=>{const [id,{fn,delay}]=timers.entries().next().value;timers.delete(id);assert.equal(delay,301);fn();}};
}
{
 const f=fixture();f.controller.start(0,0);f.tasks.shift().resolve();await flush();const canvas=f.parent.children[1];assert.equal(canvas.dataset.nativePortraitFrame,'40');assert.equal(canvas.width,300);assert.equal(canvas.style.left,'71px');assert.equal(canvas.style.top,'52px');
 for(let i=1;i<=16;i++){f.tick();assert.equal(canvas.dataset.nativePortraitFrame,String(40+i%16));assert.equal(f.timers.size,1);}
 f.root.dataset.authScene='world';f.tick();assert.equal(f.timers.size,0);assert.equal(f.parent.children.length,1);
 console.log('PASS production idle draws all 16 source frames in order, wraps, and stops on scene exit without catch-up bursts');groups++;
}
{
 const f=fixture();f.controller.start(0,0);const old=f.tasks.shift();f.portrait.style.left='411px';f.portrait.style.top='54px';f.controller.start(2,1);const next=f.tasks.shift();assert.equal(next.indices[0],240);next.resolve();await flush();old.resolve();await flush();assert.equal(f.parent.children.length,2);assert.equal(f.parent.children[1].dataset.nativePortraitFrame,'240');assert.equal(f.parent.children[1].style.left,'411px');assert.equal(f.timers.size,1);
 f.pagehide[0]();assert.equal(f.timers.size,0);assert.equal(f.parent.children.length,1);
 console.log('PASS role/slot replacement discards old loads and preserves the new anchor; pagehide clears the timer and canvas');groups++;
}
{
 const f=fixture();f.controller.start(0,0);f.tasks.shift().reject(new Error('offline'));await flush();const oldRetry=f.parent.children[1];f.controller.start(2,1);const current=f.tasks.shift();oldRetry.onclick();assert.equal(f.tasks.length,0);current.resolve();await flush();assert.equal(f.parent.children[1].dataset.nativePortraitFrame,'240');
 console.log('PASS an old retry callback cannot restore a previously selected role');groups++;
}
{
 const f=fixture();f.controller.start(0,0);f.tasks.shift().reject(new Error('人物离线'));await flush();const retry=f.parent.children[1];assert.equal(retry.tag,'button');assert.equal(f.timers.size,0);retry.onclick();f.tasks.shift().resolve();await flush();assert.equal(f.parent.children[1].tag,'canvas');assert.equal(f.timers.size,1);
 f.controller.start(0,0);f.root.isConnected=false;f.tasks.shift().reject(new Error('late'));await flush();assert.equal(f.parent.children.length,1);assert.equal(f.timers.size,0);
 console.log('PASS explicit failed-art retry restores animation; detached roots suppress late errors and frames');groups++;
}
console.log(`${groups} native selected portrait regression groups passed`);
