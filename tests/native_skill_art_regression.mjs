import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const layout=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8'));
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,'apps/web/src',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let groups=0;const pass=label=>{groups++;console.log('PASS '+label);};

function artFixture(){
 const requests=[],lock=structuredClone(layout);let failure='';
 class Image{
  set src(url){fetch(url).then(r=>r.arrayBuffer()).then(data=>{if(failure==='decode'){this.onerror?.();return;}const b=Buffer.from(data);this.naturalWidth=failure==='geometry'?1:b.readUInt32BE(16);this.naturalHeight=b.readUInt32BE(20);this.onload?.();}).catch(()=>this.onerror?.());}
 }
 const context=vm.createContext({exports:{},require:specifier=>specifier==='./native-ui-art'?{createNativeUiArtLoader:context.exports.createNativeUiArtLoader}:{default:lock},Image,Blob,URL,Uint8Array,AbortSignal,crypto:crypto.webcrypto,Error,
  fetch:async url=>{
   requests.push(url);if(failure==='network')throw new TypeError('Failed to fetch');
   if(failure==='http')return {ok:false};
   let bytes=fs.readFileSync(path.join(root,'assets/web',url.slice(1)));
   if(failure==='hash'&&url.endsWith('.png')){bytes=Buffer.from(bytes);bytes[bytes.length-1]^=1;}
   return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
 vm.runInContext(compile('native-ui-art.ts'),context);
 vm.runInContext(compile('native-skill-art.ts'),context);
 return {load:context.exports.loadNativeSkillArt,requests,lock,fail:value=>{failure=value;}};
}
{
 const f=artFixture(),indices=Object.keys(layout.nationalCharacterWindow.skillRows.art.frames).map(Number);
 const [first,second]=await Promise.all([f.load([...indices,111]),f.load([111,112,251])]);
 assert.equal(first.size,10);assert.equal(first.get(111),second.get(111));
 assert.equal(f.requests.filter(url=>url.endsWith('library.json')).length,1);
 assert.equal(f.requests.filter(url=>url.endsWith('.png')).length,10);
 for(const [index,image] of first){const locked=layout.nationalCharacterWindow.skillRows.art.frames[index];assert.equal(image.naturalWidth,locked.width);assert.equal(image.naturalHeight,locked.height);}
 pass('actual loader validates all ten source-locked PNGs, coalesces concurrent metadata/image requests and deduplicates requested frames');
}
for(const failure of ['network','http','hash','decode','geometry']){
 const f=artFixture();f.fail(failure);await assert.rejects(f.load([111,112]));
 f.fail('');const images=await f.load([111,112]);assert.equal(images.size,2);assert.equal(images.get(111).naturalWidth,20);
 pass(`${failure}: actual rejected request is evicted and explicit retry decodes the original bytes`);
}
{
 const f=artFixture();f.lock.nationalCharacterWindow.skillRows.art.sourceSha256='0'.repeat(64);
 await assert.rejects(f.load([111]),/身份不匹配/);
 assert.ok(f.requests.every(url=>!url.endsWith('.png')),'a mismatched library cannot reach pixel loading');
 f.lock.nationalCharacterWindow.skillRows.art.sourceSha256=layout.nationalCharacterWindow.skillRows.art.sourceSha256;
 await f.load([111]);const before=f.requests.length;
 await assert.rejects(f.load([249.5]),/身份不匹配/);await assert.rejects(f.load([999]),/身份不匹配/);
 assert.equal(f.requests.length,before);
 pass('source identity mismatch fails before PNG access, recovers on retry, and undeclared/noninteger frames never fetch');
}

// Run the production controller with deferred graphics dependencies, not a second UI implementation.
function controllerFixture(){
 const requests=[],painted=[],timers=new Map();let artFailure=false;
 const document={createElement:tag=>new Element(tag),addEventListener:()=>{}};
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.handlers={};this.ownerDocument=document;this.isConnected=true;this.hidden=false;this.className='';this.ops=[];this._text='';this.classList={add:value=>{this.className+=' '+value;}};}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  replaceChildren(...children){this.children.forEach(child=>{child.parentElement=null;});this.children=[];this._text='';this.append(...children);}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,handler){this.handlers[name]=handler;}
  closest(){return {};}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.className.split(' ').includes(selector.slice(1))?[child]:[]),...child.querySelectorAll(selector)]);}
  getContext(){return {drawImage:(...args)=>this.ops.push(args)};}
 }
 const font={prepare:text=>new Promise((resolve,reject)=>requests.push({text,resolve,reject})),paint:(canvas,text,options)=>{canvas.bitmapText=text;painted.push({text,...options});}};
 const root=new Element();root.hidden=true;
 const dependencies={
  './classic-ui':{loadNationalUiLibrary:()=>new Promise(()=>{})},
  './icon-frames':{resolveIconFrame:()=>({status:'missing'}),iconHasPixels:()=>true},
  './classic-layout':{classicUiLayout:()=>layout},
  './native-ui-font':{loadNativeUiFont:async()=>font},
  './native-skill-art':{loadNativeSkillArt:async indices=>{if(artFailure)throw new Error('标签离线');return new Map(indices.map(index=>[index,{index}]));}}
 };
 const context=vm.createContext({exports:{},document,Error,structuredClone,setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),require:specifier=>{
  if(specifier.endsWith('.json'))return {default:JSON.parse(fs.readFileSync(path.resolve(path.join(rootPath(),'apps/web/src'),specifier),'utf8'))};
  if(!dependencies[specifier])throw new Error('unexpected import '+specifier);return dependencies[specifier];
 }});
 function rootPath(){return path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');}
 vm.runInContext(compile('skills.ts'),context);
 const bar=new context.exports.SkillBar(root,{select:()=>{},self:()=>{},bind:()=>true});
 return {root,bar,requests,painted,timers,fail:value=>{artFailure=value;},resolve:async()=>{requests.splice(0).forEach(request=>request.resolve());await flush();}};
}
const skill=(id,key=0)=>({magicId:id,key,level:3,currentTrain:0,name:`技能${id}`,effect:0,spell:0,defSpell:0,maxTrain:[0,0,0,0]});
{
 const f=controllerFixture();f.bar.replace([skill(3,52)]);await flush();
 const old=f.root.children[0],stale=f.requests.splice(0);
 f.bar.progress(3,2,71);await flush();await f.resolve();
 const row=f.root.children[0];assert.equal(row.style.height,'37px');assert.equal(row.children[1].children[0].bitmapText,'技能3');
 assert.ok(f.painted.some(value=>value.text==='71'&&value.color==='#c0c0c0'&&value.outline===false));
 assert.equal(row.children[3].children[0].ops[0][0].index,251);
 assert.deepEqual(row.children[2].children[0].ops.slice(0,2).map(op=>[op[0].index,...op.slice(1)]),[[112,48,23],[111,74,23]]);
 stale.forEach(request=>request.resolve());await flush();
 assert.equal(old.children[1].children.length,0);assert.equal(f.root.hidden,true);
 pass('production SkillBar paints latest progress, original labels/key frame and raw silver font; stale generation cannot paint or reveal a hidden page');
}
{
 const f=controllerFixture();f.bar.replace([skill(3)]);await flush();await f.resolve();
 f.fail(true);assert.equal(f.bar.requestKeyBinding(3,50),true);await flush();
 const binding=f.bar.debugState().binding,diagnostics=f.root.querySelectorAll('.native-character-font-error');
 assert.equal(diagnostics.length,1);assert.equal(f.bar.debugState().learnedSkills[0].key,0);
 f.fail(false);diagnostics[0].children[1].onclick();await flush();await f.resolve();
 assert.equal(f.root.querySelectorAll('.native-character-font-error').length,0);
 assert.equal(f.bar.debugState().binding.bindingId,binding.bindingId);assert.equal(f.timers.size,1);
 assert.equal(f.root.children[0].children[3].children.length,0,'an unconfirmed key cannot gain artwork');
 f.bar.replace([skill(3,50)]);await flush();await f.resolve();
 assert.equal(f.bar.debugState().binding,undefined);assert.equal(f.timers.size,0);
 assert.equal(f.root.children[0].children[3].children[0].ops[0][0].index,249);
 pass('art failure/retry preserves pending binding and timer, never paints an optimistic key, and only server replacement commits the label');
}
{
 const f=controllerFixture();f.bar.replace([skill(3)]);await flush();const cleared=f.requests.splice(0);f.bar.clear();cleared.forEach(request=>request.resolve());await flush();
 assert.equal(f.root.children.length,0);assert.equal(f.root.textContent,'尚未收到技能数据');
 f.bar.replace([skill(3)]);await flush();f.root.isConnected=false;await f.resolve();
 assert.equal(f.root.children[0].children[1].children.length,0);
 pass('clear and detached roots discard in-flight graphics without restoring old skills');
}
{
 const f=controllerFixture();f.bar.replace([1,2,3,4,5,6].map(id=>skill(id)));await flush();const old=f.root.children[0],stale=f.requests.splice(0);
 assert.deepEqual(f.root.children.map(row=>row.style.top),['0px','37px','74px','111px','148px']);
 f.root.handlers.wheel({deltaY:1,preventDefault:()=>{},stopPropagation:()=>{}});await flush();await f.resolve();
 assert.equal(f.root.children.length,1);assert.equal(f.root.children[0].children[1].children[0].bitmapText,'技能6');
 stale.forEach(request=>request.resolve());await flush();assert.equal(old.children[1].children.length,0);
 pass('native wheel pagination preserves learned order and five-row spacing; old page callbacks cannot overwrite the new page');
}
console.log(`${groups} native skill artwork/controller regression groups passed; browser/native pixel and online qualification remain separate`);
