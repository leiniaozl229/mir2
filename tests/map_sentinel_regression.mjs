import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Container,Graphics,Sprite,Texture,TextureSource} from 'pixi.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),bytes=file=>fs.readFileSync(path.join(root,file));
const json=file=>JSON.parse(read(file)),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module=(file,require)=>{const context={exports:{},require};vm.createContext(context);vm.runInContext(compile(read(file)),context);return context.exports;};
const assets=module('apps/web/src/map-assets.ts',name=>({default:json(path.posix.normalize(`apps/web/src/${name}`))}));
const perf=module('apps/web/src/perf.ts',()=>{throw new Error('unexpected import');});
const world=json('assets/web/maps/GA0/map.json'),raw=bytes('vendor/mirserver-data/Mir200/Map/GA0.map');
const libraryNames=['Tiles','SmTiles','Objects'],layers=['background','middle','objects'];
const native=Object.fromEntries(libraryNames.map(name=>[name,json(`assets/web/libraries/${name}/library.json`)]));
const candidate=json('assets/web/libraries/reference-ga0/Tiles/library.json'),namespace='/libraries/reference-ga0/Tiles';
const objectCandidateContract=json('content/classic-176/map-object-bank-candidates.json');
const cells=[];
function cell(x,y){const offset=52+(x*world.height+y)*12,words=[0,2,4].map(add=>raw.readUInt16LE(offset+add));return {words,blocked:Boolean((words[0]|words[2])&0x8000)};}
for(let x=0;x<world.width;x++)for(let y=0;y<world.height;y++){const value=cell(x,y);for(let layer=0;layer<3;layer++){const number=value.words[layer]&0x7fff;if(number>=0x7f00)cells.push({x,y,layer,rawWord:value.words[layer],number,index:number-1,blocked:value.blocked});}}
const contextOf=entry=>({mapId:'GA0',mapSourceSha256:world.sourceSha256,layer:layers[entry.layer],library:libraryNames[entry.layer],index:entry.index});
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

{
 assert.equal(hash(raw),world.sourceSha256);assert.equal(world.sourceSha256,'231b29ef5afa24aa276d195c037fa576b268033726642f0750e8c5ae2bbe5c2f');assert.equal(raw.length,270052);assert.equal(raw.readUInt16LE(0),150);assert.equal(raw.readUInt16LE(2),150);
 assert.equal(cells.length,54);assert.equal(cells.filter(cell=>cell.layer===0).length,20);assert.equal(cells.filter(cell=>cell.layer===1).length,34);assert.equal(cells.filter(cell=>cell.layer===2).length,0);assert.ok(cells.every(cell=>cell.x%2===0&&cell.y%2===0));
 for(let number=32758;number<=32767;number++)assert.equal(cells.filter(cell=>cell.layer===0&&cell.number===number).length,2);assert.ok(cells.filter(cell=>cell.layer===1).every(cell=>cell.number===32767&&cell.rawWord===65535));
 pass('actual locked GA0 MAP has exactly 54 high references with real words and even coordinates, not a universal sentinel rule');
}
{
 const reconstructed=Buffer.alloc(raw.length-52);
 for(const chunk of world.chunks){const data=bytes(`assets/web/maps/GA0/${chunk.file}`);assert.equal(hash(data),chunk.sha256);assert.equal(data.length,chunk.width*chunk.height*12);for(let x=0;x<chunk.width;x++)for(let y=0;y<chunk.height;y++){const from=(x*chunk.height+y)*12,to=((x+chunk.x)*world.height+y+chunk.y)*12;data.copy(reconstructed,to,from,from+12);}}
 assert.deepEqual(reconstructed,raw.subarray(52));for(const entry of cells){const offset=(entry.x*world.height+entry.y)*12;assert.equal(reconstructed.readUInt16LE(offset+entry.layer*2),entry.rawWord);assert.equal(Boolean((reconstructed.readUInt16LE(offset)|reconstructed.readUInt16LE(offset+4))&0x8000),entry.blocked);}
 pass('actual exported chunks reconstruct every original GA0 cell byte and preserve all 54 words and collision flags');
}
{
 for(const entry of cells){const library=native[libraryNames[entry.layer]],result=assets.resolveMapFrame(contextOf(entry),{native:library,candidates:new Map([[namespace,candidate]])});assert.equal(result.status,'empty');assert.equal(result.reason,'reference_out_of_range_nil');assert.equal(result.domain,'national');assert.equal(result.url,undefined);assert.ok(entry.index>=library.sourceFrameCount);}
 assert.equal(native.SmTiles.sourceFrameCount,938);assert.ok(cells.filter(cell=>cell.layer===1).every(entry=>entry.rawWord-1>=938&&entry.index>=938));
 pass('production resolver follows original WIL bounds-nil for the exact locked GA0 indices; raw/masked middle both exceed actual national count');
}
{
 const entry=cells.find(cell=>cell.layer===0),base=contextOf(entry);
 for(const changed of [{...base,mapId:'0'},{...base,mapSourceSha256:'0'.repeat(64)},{...base,mapSourceSha256:undefined},{...base,index:32511},{...base,index:32756},{...base,layer:'objects',library:'Objects'}]){const library=native[changed.library],result=assets.resolveMapFrame(changed,{native:library,candidates:new Map([[namespace,candidate]])});assert.equal(result.status,'empty');assert.equal(result.reason,'reference_out_of_range_nil');}
 const invalid=structuredClone(native.Tiles);invalid.sourceSha256='0'.repeat(64);assert.equal(assets.resolveMapFrame(base,{native:invalid}).reason,'source_identity_mismatch');
 for(const name of ['Tiles','SmTiles','Objects','Objects2','Objects3','Objects4','Objects5','Objects6','Objects7']){const library=json(`assets/web/libraries/${name}/library.json`),layer=name==='Tiles'?'background':name==='SmTiles'?'middle':'objects',result=assets.resolveMapFrame({mapId:'0',layer,library:name,index:library.sourceFrameCount},{native:library});assert.equal(result.status,'empty',`${name} frameCount boundary`);assert.equal(result.reason,'reference_out_of_range_nil',`${name} frameCount boundary`);}
 const tileGap=Array.from({length:native.Tiles.sourceFrameCount},(_,index)=>index).find(index=>!native.Tiles.frames[String(index)]&&!native.Tiles.empty?.includes(index));assert.notEqual(tileGap,undefined);assert.equal(assets.resolveMapFrame({...base,mapId:'0',index:tileGap},{native:native.Tiles}).status,'missing','an absent in-range index remains a real gap');
 for(const index of [9,14,10320]){const result=assets.resolveMapFrame({...base,index},{native:native.Tiles,candidates:new Map([[namespace,candidate]])});assert.equal(result.status,'ready');assert.notEqual(result.reason,'reference_out_of_range_nil');}
 pass('all nine authenticated native libraries return nil beyond ImageCount; in-range holes stay missing, and explicit GA0 candidates still take precedence');
}

{
 const requests=[],loads=[],resolutions=[];let now=0;
 class Application{constructor(){this.stage=new Container();this.canvas={};this.ticker={deltaMS:16,callbacks:[],add:callback=>this.ticker.callbacks.push(callback)};}async init(){}}
 const frames=new Map();for(const [name,library] of Object.entries(native))for(const frame of Object.values(library.frames))frames.set(`/libraries/${name}/${frame.file}`,frame);for(const frame of Object.values(candidate.frames))frames.set(`${namespace}/${frame.file}`,frame);for(const source of objectCandidateContract.libraries){const library=json(`assets/web/libraries/reference-map-candidates/${source.library}/library.json`);for(const frame of Object.values(library.frames))frames.set(`${source.namespace}/${frame.file}`,frame);}
 const zero=json('assets/web/maps/0/map.json');
 const context={exports:{},performance:{now:()=>now},fetch:async url=>{requests.push(url);if(url==='/maps/0/map.json')return {ok:true,json:async()=>({...zero,width:1,height:1,chunks:[]})};const file=`assets/web${url}`,data=bytes(file);return {ok:true,json:async()=>JSON.parse(data.toString('utf8')),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};},require:name=>name==='../../../content/classic-176/world-view.json'?{default:json('content/classic-176/world-view.json')}:name==='./map-assets'?{...assets,resolveMapFrame:(...args)=>{const result=assets.resolveMapFrame(...args);resolutions.push({context:args[0],result});return result;}}:name==='./perf'?perf:{Application,Container,Graphics,Sprite,Texture,Assets:{load:async url=>{loads.push(url);const frame=frames.get(url);assert.ok(frame,`actual manifest frame ${url}`);const texture=new Texture({source:new TextureSource({width:frame.width,height:frame.height})});texture.url=url;return texture;}}}};
 vm.createContext(context);vm.runInContext(compile(read('apps/web/src/map-view.ts')),context);const status={textContent:''},view=await context.exports.createMapView({appendChild(){}},status);assert.equal(await view.setMap('GA0'),true);
 const visible=(entry,center)=>entry.x>=Math.max(0,center.x-12)&&entry.x<=Math.min(world.width-1,center.x+12)&&entry.y>=Math.max(0,center.y-14)&&entry.y<=Math.min(world.height-1,center.y+24);
 let remaining=[...cells],visited=new Set(),renders=0;
 while(remaining.length){const center=remaining.map(entry=>({x:entry.x,y:entry.y})).sort((a,b)=>remaining.filter(entry=>visible(entry,b)).length-remaining.filter(entry=>visible(entry,a)).length)[0];await view.setCenter(center.x,center.y);renders++;const actualCenter=view.center,shown=cells.filter(entry=>visible(entry,actualCenter));assert.equal(view.renderDiagnostics.referenceRuleSkipped,shown.length);assert.equal(view.renderDiagnostics.map,'GA0');assert.equal(view.renderDiagnostics.sourceSha256,world.sourceSha256);assert.match(status.textContent,new RegExp(`${shown.length} 个参考规则跳过`));for(const entry of shown){assert.equal(view.isWalkable(entry.x,entry.y),!entry.blocked);visited.add(`${entry.x}:${entry.y}:${entry.layer}`);}remaining=remaining.filter(entry=>!visible(entry,actualCenter));}
 let ordinary;for(let x=0;x<world.width&&!ordinary;x+=2)for(let y=0;y<world.height;y+=2)if(candidate.frames[(cell(x,y).words[0]&0x7fff)-1]){ordinary={x,y};break;}assert.ok(ordinary);await view.setCenter(ordinary.x,ordinary.y);
 assert.equal(visited.size,54);assert.ok(renders>0);assert.ok(resolutions.some(entry=>entry.result.reason==='reference_out_of_range_nil'));assert.equal(loads.some(url=>/\/(?:32757|32758|32759|32760|32761|32762|32763|32764|32765|32766)\./.test(url)),false);assert.ok(requests.some(url=>url.endsWith('.bin')));assert.ok(loads.some(url=>url.startsWith(namespace)),'ordinary GA0 candidate frames still load');
 const before=view.renderDiagnostics;before.referenceRuleSkipped=-1;assert.notEqual(view.renderDiagnostics.referenceRuleSkipped,-1,'diagnostic getter returns a copy');now=100;for(const tick of view.app.ticker.callbacks)tick();
 pass('actual Pixi production view reads real GA0 chunks, visits all 54 references with separate skip counts, preserves collision and makes no high-index texture request');
}
assert.equal(groups,5);
