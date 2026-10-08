import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {Container,Graphics,Sprite,Texture,TextureSource} from 'pixi.js';

// Real Pixi scene, sprite and texture classes; only Application initialization,
// network delivery and clock are replaced. No browser, GPU or native screenshot claim.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),json=file=>JSON.parse(read(file));
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loadModule=(file,require)=>{const context={exports:{},require};vm.createContext(context);vm.runInContext(compile(read(file)),context);return context.exports;};
const assets=loadModule('apps/web/src/map-assets.ts',name=>({default:json(path.posix.normalize(`apps/web/src/${name}`))}));
const perf=loadModule('apps/web/src/perf.ts',()=>{throw new Error('unexpected runtime dependency');});
const contract=json('content/classic-176/map-asset-bindings.json'),binding=contract.bindings[0];
const native=Object.fromEntries(assets.MAP_LIBRARY_NAMES.map(name=>[name,json(`assets/web/libraries/${name}/library.json`)]));
const candidate=json('assets/web/libraries/reference-ga0/Tiles/library.json');
const objectCandidateContract=json('content/classic-176/map-object-bank-candidates.json');
const objectBinding=objectCandidateContract.bindings.find(entry=>entry.mapId==='63'&&entry.library==='Objects8');
const objectCandidateSource=objectCandidateContract.libraries.find(entry=>entry.library==='Objects8');
const objectCandidate=json('assets/web/libraries/reference-map-candidates/Objects8/library.json');
const objectIndex=objectBinding.indices.find(index=>objectCandidate.frames[String(index)]);
const tileCandidateContract=json('content/classic-176/map-tile-candidates.json');
const tileBinding=tileCandidateContract.bindings.find(entry=>entry.mapId==='63');
const tileCandidateSource=tileCandidateContract.libraries[0];
const tileCandidate=json('assets/web/libraries/reference-map-candidates/Tiles/library.json');
const tileIndex=tileBinding.indices.find(index=>tileCandidate.frames[String(index)]);
const world0=json('assets/web/maps/0/map.json'),worldGA0=json('assets/web/maps/GA0/map.json');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

async function harness(){
 let now=0,planSerial=0;const replies=new Map(),requests=[],loads=[],textures=[],holdFetch=new Set(),holdTexture=new Set(),scenes=[];
 class TrackedContainer extends Container{constructor(){super();scenes.push(this);}}
 class TrackedSprite extends Sprite{constructor(){super();scenes.push(this);}}
 class Application{constructor(){this.stage=new TrackedContainer();this.canvas={};this.ticker={deltaMS:16,callbacks:[],add:callback=>this.ticker.callbacks.push(callback)};}async init(){}}
 const response=value=>({ok:true,json:async()=>structuredClone(value)});
 replies.set('/maps/0/map.json',response({...world0,width:1,height:1,chunks:[]}));
 for(const [name,library] of Object.entries(native))replies.set(`/libraries/${name}/library.json`,response(library));
 replies.set(`${binding.namespace}/library.json`,response(candidate));
 const objectCandidates=new Map(objectCandidateContract.libraries.map(source=>[source.namespace,json(`assets/web/libraries/reference-map-candidates/${source.library}/library.json`)]));
 objectCandidates.set(tileCandidateSource.namespace,tileCandidate);
 for(const [namespace,library] of objectCandidates)replies.set(`${namespace}/library.json`,response(library));
 function texture(url){const libraries=[...Object.entries(native).map(([name,library])=>[`/libraries/${name}`,library]),[binding.namespace,candidate],...objectCandidates],entry=libraries.find(([namespace])=>url.startsWith(`${namespace}/`)),frame=entry&&Object.values(entry[1].frames).find(frame=>url===`${entry[0]}/${frame.file}`);const result=new Texture({source:new TextureSource({width:frame?.width??96,height:frame?.height??64})});result.url=url;textures.push(result);return result;}
 const context={exports:{},performance:{now:()=>now},fetch:url=>{const request={url};requests.push(request);if(!holdFetch.has(url)&&replies.has(url))return Promise.resolve(replies.get(url));Object.assign(request,deferred());return request.promise;},require:name=>name==='../../../content/classic-176/world-view.json'?{default:json('content/classic-176/world-view.json')}:name==='./map-assets'?assets:name==='./perf'?perf:name==='pixi.js'?{Application,Container:TrackedContainer,Sprite:TrackedSprite,Graphics,Texture,Assets:{load:url=>{const load={url};loads.push(load);if(!holdTexture.has(url))return Promise.resolve(texture(url));Object.assign(load,deferred());return load.promise;}}}:(()=>{throw new Error(name);})()};
 vm.createContext(context);vm.runInContext(compile(read('apps/web/src/map-view.ts')),context);const status={textContent:''},view=await context.exports.createMapView({appendChild(){}},status);
 function plan(id,{width=5,height=5,cells=[],sourceSha256=id==='GA0'?worldGA0.sourceSha256:world0.sourceSha256}={}){const buffer=new ArrayBuffer(width*height*12),data=new DataView(buffer);for(const cell of cells){const offset=(cell.x*height+cell.y)*12;for(const [layer,field] of ['background','middle','object'].entries())if(cell[field]!==undefined)data.setUint16(offset+layer*2,(cell[field]+1)|(cell.blocked?0x8000:0),true);if(cell.animation)data.setUint8(offset+8,cell.animation);if(cell.tick)data.setUint8(offset+9,cell.tick);if(cell.area!==undefined)data.setUint8(offset+10,cell.area);}const file=`${id}-${++planSerial}.bin`,world={...(id==='GA0'?worldGA0:world0),width,height,sourceSha256,chunks:[{x:0,y:0,width,height,file}]};replies.set(`/maps/${id}/map.json`,response(world));replies.set(`/maps/${id}/${file}`,{ok:true,arrayBuffer:async()=>buffer});return {world,buffer};}
 function next(list,url){const item=list.find(item=>item.url===url&&item.resolve&&!item.done);assert.ok(item,`pending ${url}`);item.done=true;return item;}
 function sprites(){const found=[];function walk(scene){if(scene instanceof Sprite&&scene.texture?.url)found.push(scene);for(const child of scene.children??[])walk(child);}walk(view.app.stage);return found;}
 return {view,status,replies,requests,loads,textures,scenes,holdFetch,holdTexture,plan,response,sprites,texture,
  resolveFetch:(url,value)=>next(requests,url).resolve(response(value)),rejectFetch:(url)=>next(requests,url).reject(new Error('fetch failed')),
  resolveTexture:url=>next(loads,url).resolve(texture(url)),rejectTexture:url=>next(loads,url).reject(new Error('texture failed')),
  tick:value=>{now=value;for(const callback of view.app.ticker.callbacks)callback();}};
}

{
 const h=await harness();h.plan('GA0',{cells:[{x:0,y:0,background:9},{x:2,y:0,background:14},{x:2,y:2,background:10320}]});assert.equal(await h.view.setMap('GA0'),true);
 const sprites=h.sprites();assert.equal(sprites.length,3);assert.deepEqual(sprites.map(sprite=>sprite.texture.url).sort(),[`/libraries/Tiles/${native.Tiles.frames[9].file}`,`/libraries/Tiles/${native.Tiles.frames[14].file}`,`${binding.namespace}/${candidate.frames[10320].file}`].sort());
 const selected=sprites.find(sprite=>sprite.texture.url.startsWith(binding.namespace));assert.ok(selected instanceof Sprite);assert.equal(selected.x,96);assert.equal(selected.y,64);assert.equal(selected.parent.parent,h.view.app.stage.children[0]);assert.equal(candidate.frames[10320].offsetX,7);assert.equal(candidate.frames[10320].offsetY,-44);assert.equal(selected.texture.source.scaleMode,'nearest');
 pass('actual Pixi floor uses exact enabled candidate URL at original grid coordinates while 9/14 retain native 1x1 textures');
}
{
 const h=await harness();h.plan('GA0',{sourceSha256:'0'.repeat(64),cells:[{x:0,y:0,background:10320}]});assert.equal(await h.view.setMap('GA0'),true);assert.equal(h.sprites().length,0);assert.equal(h.requests.some(request=>request.url.startsWith(binding.namespace)),false);assert.match(h.status.textContent,/1 个参考规则跳过/);
 h.plan('A',{cells:[{x:0,y:0,background:10320}]});assert.equal(await h.view.setMap('A'),true);assert.equal(h.sprites().length,0);assert.equal(h.loads.some(load=>load.url.startsWith(binding.namespace)),false);assert.match(h.status.textContent,/1 个参考规则跳过/);
 pass('actual map load with changed raw MAP hash or other map ID never requests candidate manifest or texture and honors WIL nil bounds');
}
{
 const h=await harness();h.plan('GA0',{cells:[{x:0,y:0,background:10320,object:0,animation:2}]});assert.equal(await h.view.setMap('GA0'),true);
 const object=h.sprites().find(sprite=>sprite.texture.url.startsWith('/libraries/Objects/')),candidateSprite=h.sprites().find(sprite=>sprite.texture.url.startsWith(binding.namespace));assert.ok(object);assert.equal(object.parent,h.view.depth);assert.equal(object.texture.url,`/libraries/Objects/${native.Objects.frames[0].file}`);
 h.tick(50);assert.equal(object.texture.url,`/libraries/Objects/${native.Objects.frames[1].file}`);assert.equal(candidateSprite.texture.url,`${binding.namespace}/${candidate.frames[10320].file}`);h.tick(100);assert.equal(object.texture.url,`/libraries/Objects/${native.Objects.frames[0].file}`);assert.equal(h.loads.filter(load=>load.url.startsWith(binding.namespace)).length,1);
 pass('actual Pixi animation independently resolves each national object index while candidate background stays static');
}
{
 const h=await harness();h.plan('B',{cells:[{x:0,y:0,object:0,animation:2,tick:1}]});assert.equal(await h.view.setMap('B'),true);const sprite=h.sprites()[0];
 h.tick(50);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[0].file}`,'btAniTick=1 holds the first frame for two native 50 ms animation ticks');
 h.tick(100);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[1].file}`);
 h.tick(150);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[1].file}`);
 h.tick(200);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[0].file}`);
 pass('MAP btAniTick uses the native 50 ms global clock and advances each frame after tick+1 intervals');
}
{
 const h=await harness();h.plan('B',{cells:[{x:0,y:0,object:0,animation:2}]});assert.equal(await h.view.setMap('B'),true);const sprite=h.sprites()[0];
 h.tick(250);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[1].file}`,'a delayed paint advances the native counter once rather than jumping through missed ticks');
 h.tick(300);assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[0].file}`);
 pass('delayed paints advance the native map animation counter once per paint instead of catching up from wall-clock time');
}
{
 const h=await harness();h.plan('GA0',{cells:[{x:0,y:0,object:9998,animation:2}]});assert.equal(await h.view.setMap('GA0'),true);const sprite=h.sprites()[0];assert.equal(sprite.texture.url,`/libraries/Objects/${native.Objects.frames[9998].file}`);h.tick(50);assert.equal(sprite.texture,Texture.EMPTY);assert.equal(h.loads.length,1);
 h.plan('GA0',{cells:[{x:0,y:0,object:10320,animation:2}]});assert.equal(await h.view.setMap('GA0'),true);assert.equal(h.sprites().length,0);assert.equal(h.loads.some(load=>load.url.startsWith(binding.namespace)),false);
 pass('out of range animated frame uses EMPTY and never borrows a background candidate or adjacent source');
}
{
 const h=await harness();h.plan('A',{cells:[{x:0,y:0,background:native.Tiles.sourceFrameCount,middle:native.SmTiles.sourceFrameCount,object:native.Objects3.sourceFrameCount,area:2}]});assert.equal(await h.view.setMap('A'),true);
 assert.equal(h.sprites().length,0);assert.equal(h.view.renderDiagnostics.unresolvedReferences,0);assert.equal(h.view.renderDiagnostics.referenceRuleSkipped,3);assert.equal(h.loads.length,0);assert.match(h.status.textContent,/3 个参考规则跳过/);
 pass('real Pixi map view treats authenticated out-of-range Tiles, SmTiles and Objects3 indices as reference nil without requesting textures');
}
{
 const h=await harness(),url=`${binding.namespace}/library.json`;h.holdFetch.add(url);h.plan('GA0',{cells:[{x:0,y:0,background:10320}]});const old=h.view.setMap('GA0');await settle();assert.equal(h.view.isWalkable(0,0),undefined);
 h.plan('B',{cells:[{x:0,y:0,background:9,blocked:true}]});assert.equal(await h.view.setMap('B'),true);const status=h.status.textContent;h.resolveFetch(url,candidate);assert.equal(await old,false,'stale map render must return false');assert.equal(h.status.textContent,status,'stale map render must not overwrite status');assert.equal(h.view.isWalkable(0,0),false,'current B collision remains blocked');assert.equal(h.requests.some(request=>request.url.startsWith('/maps/GA0/')&&request.url.endsWith('.bin')),true,'the old visible map chunk is fetched before the candidate manifest');assert.equal(h.loads.some(load=>load.url.startsWith(binding.namespace)),false,'stale candidate must not load a texture');
 pass('late candidate manifest cannot draw stale chunks, overwrite B status or expose stale collision authority');
}
{
 const h=await harness(),url=`${binding.namespace}/${candidate.frames[10320].file}`;h.holdTexture.add(url);h.plan('GA0',{cells:[{x:0,y:0,background:10320,object:0,animation:2}]});const old=h.view.setMap('GA0');await settle();const allocated=[...h.scenes].filter(scene=>!scene.parent&&scene!==h.view.app.stage&&scene!==h.view.depth&&!scene.destroyed),actor=new Container();h.view.depth.addChild(actor);
 h.plan('B',{cells:[{x:0,y:0,background:14}]});assert.equal(await h.view.setMap('B'),true);h.resolveTexture(url);assert.equal(await old,false);assert.ok(allocated.every(scene=>scene.destroyed));assert.equal(actor.destroyed,false);assert.ok(h.textures.every(texture=>!texture.destroyed));h.tick(100);assert.deepEqual(h.sprites().map(sprite=>sprite.texture.url),[`/libraries/Tiles/${native.Tiles.frames[14].file}`]);
 pass('actual stale candidate texture completion destroys old scene and animation while preserving B, actors and shared textures');
}
{
 const h=await harness(),url=`${binding.namespace}/library.json`;h.replies.set(url,{ok:false,status:404});h.plan('GA0',{cells:[{x:0,y:0,background:10320}]});await assert.rejects(h.view.setMap('GA0'),/404/);assert.equal(h.view.isWalkable(0,0),undefined);
 h.replies.set(url,h.response({...candidate,sourceSha256:'0'.repeat(64)}));await assert.rejects(h.view.setMap('GA0'),/来源不匹配/);assert.equal(h.loads.length,0);h.replies.set(url,h.response(candidate));assert.equal(await h.view.setMap('GA0'),true);assert.equal(h.requests.filter(request=>request.url===url).length,3);assert.equal(h.sprites().length,1);
 pass('HTTP and candidate identity failures evict manifest attempts so a fresh valid map retry can recover');
}
{
 const h=await harness(),url=`${binding.namespace}/${candidate.frames[10320].file}`;h.holdTexture.add(url);h.plan('GA0',{cells:[{x:0,y:0,background:10320}]});const first=h.view.setMap('GA0');await settle();h.rejectTexture(url);await assert.rejects(first,/texture failed/);assert.equal(h.sprites().length,0);h.holdTexture.delete(url);assert.equal(await h.view.setMap('GA0'),true);assert.equal(h.loads.filter(load=>load.url===url).length,2);
 await h.view.setCollision(true);await h.view.setDoor(0,0,false);assert.equal(h.loads.filter(load=>load.url===url).length,2);assert.equal(h.view.isWalkable(0,0),false);
 pass('failed full candidate URL texture is retried once then shared across collision and door rerenders');
}
{
 const h=await harness(),library=native.Objects2,index=Number(Object.keys(library.frames).find(value=>library.frames[value].width!==1&&library.frames[value].height!==1));
 h.plan('banked',{width:1,height:1,cells:[{x:0,y:0,object:index,area:1}]});assert.equal(await h.view.setMap('banked'),true);
 const sprite=h.sprites()[0];assert.equal(sprite.texture.url,`/libraries/Objects2/${library.frames[index].file}`);assert.ok(h.requests.some(request=>request.url==='/libraries/Objects2/library.json'));
 assert.equal(sprite.parent===h.view.depth,library.frames[index].width!==48||library.frames[index].height!==32);
 pass('MAP area byte 1 lazy-loads Objects2 and preserves the native bank frame identity and depth class');
}
{
 const h=await harness();h.plan('missbank',{width:1,height:1,cells:[{x:0,y:0,object:0,area:7}]});assert.equal(await h.view.setMap('missbank'),true);
 assert.equal(h.sprites().length,0);assert.match(h.status.textContent,/1 个未解析引用/);assert.equal(h.requests.some(request=>request.url==='/libraries/Objects8/library.json'),false);
 pass('absent Objects8 bank is reported unresolved and never silently substituted with Objects');
}
{
 const h=await harness();h.plan('63',{width:1,height:1,sourceSha256:objectBinding.mapSourceSha256,cells:[{x:0,y:0,background:tileIndex,object:objectIndex,area:7}]});assert.equal(await h.view.setMap('63'),true);
 const sprites=h.sprites(),background=sprites.find(sprite=>sprite.texture.url.startsWith(`${tileCandidateSource.namespace}/`)),foreground=sprites.find(sprite=>sprite.texture.url.startsWith(`${objectCandidateSource.namespace}/`));assert.ok(background);assert.ok(foreground);assert.equal(background.texture.url,`${tileCandidateSource.namespace}/${tileCandidate.frames[tileIndex].file}`);assert.equal(foreground.texture.url,`${objectCandidateSource.namespace}/${objectCandidate.frames[objectIndex].file}`);assert.equal(background.texture.source.width,96);assert.equal(foreground.parent===h.view.depth,objectCandidate.frames[objectIndex].width!==48||objectCandidate.frames[objectIndex].height!==32);assert.ok(h.requests.some(request=>request.url===`${tileCandidateSource.namespace}/library.json`));assert.ok(h.requests.some(request=>request.url===`${objectCandidateSource.namespace}/library.json`));assert.equal(h.requests.some(request=>request.url==='/libraries/Objects8/library.json'),false);assert.match(h.status.textContent,/0 个未解析引用/);
 const wrong=h.plan('63',{width:1,height:1,sourceSha256:'0'.repeat(64),cells:[{x:0,y:0,background:tileIndex,object:objectIndex,area:7}]});assert.equal(await h.view.setMap('63'),true);assert.equal(h.sprites().length,1);assert.equal(h.sprites()[0].texture.url,`/libraries/Tiles/${native.Tiles.frames[tileIndex].file}`);assert.equal(h.requests.filter(request=>request.url===`${tileCandidateSource.namespace}/library.json`).length,1);assert.equal(h.requests.filter(request=>request.url===`${objectCandidateSource.namespace}/library.json`).length,1);
 pass('real Pixi map 63 fills native 1x1 ground and missing Objects8 with separate exact candidates; altered map hash never loads them');
}
{
 const h=await harness();h.plan('B',{cells:[{x:0,y:0,object:2749,animation:0x82}]});assert.equal(await h.view.setMap('B'),true);
 let sprites=h.sprites();assert.equal(sprites.length,2,'48x32 high-bit foreground draws once normally and once additively');
 const additive=sprites.find(sprite=>sprite.parent===h.view.depth),base=sprites.find(sprite=>sprite.parent!==h.view.depth);assert.ok(additive);assert.ok(base);assert.equal(additive.blendMode,'add');assert.deepEqual([additive.x,additive.y],[5,-112]);assert.deepEqual([base.x,base.y],[0,0]);assert.equal(base.visible,true);assert.equal(base.texture.url,`/libraries/Objects/${native.Objects.frames[2749].file}`);
 h.tick(50);sprites=h.sprites();assert.equal(additive.texture.url,`/libraries/Objects/${native.Objects.frames[2750].file}`);assert.equal(base.texture.url,additive.texture.url);assert.deepEqual([additive.x,additive.y],[5,-112]);assert.equal(base.visible,true);
 pass('native high-bit 48x32 foreground uses its ordinary base plus offset additive copy on every animation frame');
}
{
 const h=await harness();h.plan('B',{cells:[{x:0,y:0,object:2723,animation:0x82}]});assert.equal(await h.view.setMap('B'),true);
 const sprites=h.sprites();assert.equal(sprites.length,1,'large additive-only frames do not allocate a hidden ordinary base');assert.equal(sprites[0].parent,h.view.depth);assert.deepEqual([sprites[0].x,sprites[0].y],[-53,-181]);
 h.tick(50);assert.equal(sprites[0].texture.url,`/libraries/Objects/${native.Objects.frames[2724].file}`);assert.deepEqual([sprites[0].x,sprites[0].y],[-53,-181]);
 pass('native 100x100 additive frame offsets come from frame metadata and avoid the unnecessary normal-pass copy');
}
{
 const h=await harness();h.plan('CAM');assert.equal(await h.view.setMap('CAM'),true);await h.view.setCenter(2,2);
 assert.equal(h.view.app.stage.position.x,366-2*48);assert.equal(h.view.app.stage.position.y,192-2*32);
 assert.equal(h.view.cellAtScreen(366,192).x,2);assert.equal(h.view.cellAtScreen(366,192).y,2);
 h.view.moveCenter(3,2,600,0);h.tick(300);assert.equal(h.view.app.stage.x,366-2.5*48);
 assert.equal(h.view.cellAtScreen(390,208).x,3);assert.equal(h.view.cellAtScreen(390,208).y,2);
 h.tick(600);assert.equal(h.view.app.stage.x,366-3*48);assert.equal(h.view.app.stage.y,192-2*32);
 pass('actual Pixi Point and production screen hit mapping share the measured origin during camera interpolation');
}
assert.equal(groups,17);
