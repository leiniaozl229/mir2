import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

const root=process.cwd();
const activeSources=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/active-asset-sources.json'),'utf8'));
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const native=read('assets/web/ui-national/magic-icons/library.json');
const items=read('assets/web/ui-national/items/library.json');
const alias=read('assets/web/items/Items/library.json');
function load(contract=activeSources){
 const context={exports:{},activeSources:contract};vm.createContext(context);
 const source=fs.readFileSync(path.join(root,'apps/web/src/icon-frames.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context.exports;
}
const {resolveIconFrame,usableIconFrame,iconHasPixels}=load();
const source=library=>[{namespace:'/ui-national/magic-icons',library}];
for(const index of [0,1,10,11,54,55]){
 const result=resolveIconFrame(index,source(native));
 assert.equal(result.status,'ready');assert.equal(result.index,index);assert.equal(result.frame.index,index);assert.equal(result.domain,'national');
 assert.equal(result.url,`/ui-national/magic-icons/${native.frames[index].file}`);
 const png=fs.readFileSync(path.join(root,'assets/web/ui-national/magic-icons',native.frames[index].file));
 assert.equal(png.readUInt32BE(16),result.frame.width);assert.equal(png.readUInt32BE(20),result.frame.height);
 assert.equal(crypto.createHash('sha256').update(png).digest('hex'),native.frames[index].sha256);
}
console.log('PASS exact zero/normal/pressed frames match real native manifest PNG geometry and fingerprints');

for(const index of [66,67,68,69,70,71,72,999,-1,1.5,NaN]){
 const result=resolveIconFrame(index,source(native));assert.equal(result.status,'missing');assert.equal(result.frame,undefined);assert.equal(result.url,undefined);
}
assert.equal(resolveIconFrame(66,source(native)).reason,'frame_empty_or_invalid');
assert.equal(resolveIconFrame(72,source(native)).reason,'frame_out_of_range');
const absent=structuredClone(native);delete absent.frames['54'];
assert.equal(resolveIconFrame(54,source(absent)).status,'missing','existing adjacent 53/55 or default frame1 cannot stand in for54');
console.log('PASS native tiny placeholders, out-of-range and absent exact frame never select adjacent/default artwork');

for(const patch of [{sourceSha256:'changed'},{indexSha256:'changed'},{sourceFrameCount:73},{format:'crystal-lib-v2'}]){
 assert.equal(resolveIconFrame(0,source({...native,...patch})).status,'missing');
}
assert.equal(resolveIconFrame(0,[{namespace:'/ui/MagIcon',library:native}]).status,'missing','same filename and native hashes cannot invent a registered export');
console.log('PASS data/index identity, source count, format and public namespace are independently required');

for(const patch of [{width:1,height:1},{width:4},{height:1},{width:NaN},{height:32.5},{width:5000},{offsetX:NaN},{offsetY:32768},{file:'../other.png'},{file:'https://example/icon.png'},{file:'1.png?different'},{empty:true},{opaquePixels:0}]){
 assert.equal(usableIconFrame({...native.frames['0'],...patch}),undefined);
}
assert.equal(usableIconFrame(native.frames['0']).offsetY,-44);
const wrongIndex=structuredClone(native);wrongIndex.frames['0'].index=1;
assert.equal(resolveIconFrame(0,source(wrongIndex)).reason,'frame_index_mismatch');
console.log('PASS invalid geometry/offsets, unsafe filenames and declared empty pixels are rejected; signed native offsets remain legal');

for(const patch of [{empty:[0]},{missing:[0]}])assert.equal(resolveIconFrame(0,source({...native,...patch})).status,'missing');
console.log('PASS explicit manifest empty/missing marks override a present frame entry');

const item=resolveIconFrame(48,[{namespace:'/ui-national/items',library:items},{namespace:'/items/Items',library:alias}]);
assert.equal(item.url,`/ui-national/items/${items.frames['48'].file}`);
const alternate=resolveIconFrame(48,[{namespace:'/items/Items',library:alias}]);
assert.equal(alternate.domain,'national');assert.equal(alternate.sourceId,'national:gameplay:Items');
assert.equal(alternate.url,`/items/Items/${alias.frames['48'].file}`);
console.log('PASS real same-WIL namespace aliases remain national sources and prefer the caller explicit source order');

const contract=structuredClone(activeSources),entry=structuredClone(contract.assets.find(entry=>entry.id==='national:ui:magic-icons'));
entry.id='test:reference';entry.role='reference_candidate';entry.provenance='reference_source';entry.namespace='/candidate/icons';entry.library.manifests=['assets/web/candidate/icons/library.json'];contract.assets.push(entry);
const candidate=load(contract).resolveIconFrame;
assert.equal(candidate(54,[{namespace:'/candidate/icons',library:native}]).status,'missing');
const chosen=candidate(54,[{namespace:'/candidate/icons',library:native}],{allowReference:true});assert.equal(chosen.status,'ready');assert.equal(chosen.domain,'reference_candidate');
const prioritized=candidate(54,[{namespace:'/candidate/icons',library:native},...source(native)],{allowReference:true});assert.equal(prioritized.domain,'national');
console.log('PASS reference frames require explicit opt-in and a registered matching export; national source wins over reference');

const ambiguous=structuredClone(activeSources),duplicate=structuredClone(ambiguous.assets.find(entry=>entry.id==='national:ui:magic-icons'));duplicate.id='unproven-version';ambiguous.assets.push(duplicate);
assert.equal(load(ambiguous).resolveIconFrame(0,source(native)).reason,'ambiguous_source');
assert.equal(resolveIconFrame(0,source({...native,frames:undefined})).status,'missing');
console.log('PASS ambiguous source declarations and malformed frame containers remain missing');

const decoded=(pixels,blocked=false)=>({createElement:tag=>{assert.equal(tag,'canvas');return {getContext:()=>({drawImage(resource,x,y,width,height){assert.equal(resource,'decoded-image');assert.deepEqual([x,y,width,height],[0,0,32,30]);},getImageData(){if(blocked)throw new Error('unreadable canvas');return {data:Uint8ClampedArray.from(pixels)};}})};}});
assert.equal(iconHasPixels('decoded-image',32,30,decoded([0,0,0,0,0,0,0,0])),false);
assert.equal(iconHasPixels('decoded-image',32,30,decoded([0,0,0,0,0,0,0,1])),true);
assert.equal(iconHasPixels('decoded-image',32,30,decoded([],true)),undefined);
assert.equal(iconHasPixels('decoded-image',32,30,{createElement:()=>({})}),undefined);
assert.equal(iconHasPixels('decoded-image',1,1,{}),false);
console.log('PASS real decoded-alpha helper distinguishes transparent/visible pixels and keeps blocked/unavailable canvas unknown');
