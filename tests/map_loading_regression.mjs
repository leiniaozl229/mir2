import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const actualJson=file=>JSON.parse(read(file));
const assetContext={exports:{},require:name=>({default:actualJson(path.posix.normalize(`apps/web/src/${name}`))})};vm.createContext(assetContext);vm.runInContext(compile(read('apps/web/src/map-assets.ts')),assetContext);const mapAssets=assetContext.exports;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

async function mapHarness(){
 let clock=0;const scenes=[],requests=[],loads=[],heldTextures=new Set(),auto=new Map(),textures=[];
 class Scene{
  constructor(){this.children=[];this.x=this.y=0;this.destroyed=false;this.position={set:(x,y)=>{this.x=x;this.y=y;}};Object.defineProperties(this.position,{x:{get:()=>this.x},y:{get:()=>this.y}});scenes.push(this);}
  addChild(...items){for(const item of items){item.parent?.removeChild(item);item.parent=this;this.children.push(item);}return items[0];}
  addChildAt(item,index){item.parent?.removeChild(item);item.parent=this;this.children.splice(index,0,item);return item;}
  removeChild(item){this.children=this.children.filter(child=>child!==item);item.parent=undefined;return item;}
  removeChildren(){const items=this.children;this.children=[];for(const item of items)item.parent=undefined;return items;}
  destroy(options={}){this.parent?.removeChild(this);if(options.children)for(const item of [...this.children])item.destroy(options);this.destroyed=true;}
 }
 class Sprite extends Scene{set texture(value){assert.equal(this.destroyed,false,'late load wrote a destroyed sprite');this._texture=value;}get texture(){return this._texture;}}
 class Graphics extends Scene{constructor(){super();this.commands=[];}rect(...args){this.commands.push(['rect',...args]);return this;}roundRect(...args){this.commands.push(['roundRect',...args]);return this;}fill(){return this;}stroke(){return this;}moveTo(){return this;}lineTo(){return this;}}
 class Application{constructor(){this.stage=new Scene();this.canvas={};this.ticker={callbacks:[],add:callback=>this.ticker.callbacks.push(callback)};}async init(){}}
 const texture=url=>{const value={url,source:{},destroyed:false,destroy(){this.destroyed=true;}};textures.push(value);return value;};
 const json=value=>({ok:true,json:async()=>value});
 auto.set('/maps/0/map.json',json({width:1,height:1,chunks:[]}));
 for(const name of ['Tiles','SmTiles','Objects']){const native=actualJson(`assets/web/libraries/${name}/library.json`);auto.set(`/libraries/${name}/library.json`,json({...native,frames:Object.fromEntries(Array.from({length:6},(_,index)=>[index,{index,sourceIndex:index,sourceSha256:native.sourceSha256,indexSha256:native.indexSha256,sha256:'0'.repeat(64),width:name==='Objects'?30:96,height:name==='Objects'?70:64,offsetX:7,offsetY:-44,file:`${name}-${index}.png`}])),empty:[],missing:[]}));}
 const context={exports:{},performance:{now:()=>clock},fetch:url=>{
  const request={url};requests.push(request);if(auto.has(url))return Promise.resolve(auto.get(url));
  Object.assign(request,deferred());return request.promise;
 },require:name=>name==='../../../content/classic-176/world-view.json'?{default:actualJson('content/classic-176/world-view.json')}:name==='./map-assets'?mapAssets:name==='pixi.js'?{Application,Container:Scene,Sprite,Graphics,Texture:{EMPTY:{empty:true}},Assets:{load:url=>{const load={url};loads.push(load);if(!heldTextures.has(url))return Promise.resolve(texture(url));Object.assign(load,deferred());return load.promise;}}}:{FrameBudget:class{attach(){}}}};
 installPlayUiContext(context);vm.runInContext(compile(read('apps/web/src/map-view.ts')),context);
 const status={textContent:''},view=await context.exports.createMapView({appendChild(){}},status);
 function next(url){const request=requests.find(request=>request.url===url&&request.resolve&&!request.done);assert.ok(request,`pending fetch ${url}`);request.done=true;return request;}
 function plan(id,{width=1,height=1,tile=0,blocked=false,animation=0,holdChunk=false,fill=true}={}){
  const data=new ArrayBuffer(width*height*12),cells=new DataView(data);
  if(fill)for(let x=0;x<width;x++)for(let y=0;y<height;y++){const offset=(x*height+y)*12;cells.setUint16(offset,(tile+1)|(blocked?0x8000:0),true);if(animation){cells.setUint16(offset+4,1,true);cells.setUint8(offset+8,animation);}}
  const file=`${id}.bin`;if(!holdChunk)auto.set(`/maps/${id}/${file}`,{ok:true,arrayBuffer:async()=>data});
  return {world:{width,height,chunks:[{x:0,y:0,width,height,file}]},data};
 }
 function resolveMap(id,plan){next(`/maps/${id}/map.json`).resolve(json(plan.world));}
 function urls(){const found=[];function visit(scene){if(scene instanceof Sprite&&scene.texture?.url)found.push(scene.texture.url);for(const child of scene.children)visit(child);}visit(view.app.stage);return found;}
 return {view,status,scenes,requests,loads,textures,heldTextures,plan,resolveMap,next,urls,texture,Scene,tick:time=>{clock=time;for(const callback of view.app.ticker.callbacks)callback();},
  rejectMap:(id,reason)=>next(`/maps/${id}/map.json`).reject(new Error(reason)),
  resolveTexture:url=>{const load=loads.find(value=>value.url===url&&value.resolve&&!value.done);assert.ok(load,url);load.done=true;load.resolve(texture(url));},
  rejectTexture:(url,reason)=>{const load=loads.find(value=>value.url===url&&value.reject&&!value.done);assert.ok(load,url);load.done=true;load.reject(new Error(reason));}};
}

{
 const h=await mapHarness(),a=h.plan('A',{tile:0}),b=h.plan('B',{width:2,tile:1,blocked:true});
 const pa=h.view.setMap('A'),pb=h.view.setMap('B');h.resolveMap('B',b);assert.equal(await pb,true);const status=h.status.textContent;
 h.resolveMap('A',a);assert.equal(await pa,false);assert.equal(h.view.map,'B');assert.equal(h.view.width,2);assert.equal(h.status.textContent,status);assert.equal(h.view.isWalkable(0,0),false);
 assert.equal(h.requests.some(value=>value.url==='/maps/A/A.bin'),false);assert.deepEqual(h.urls(),['/libraries/Tiles/Tiles-1.png']);
 pass('actual setMap commits B when A and B manifests finish in reverse order');
}
{
 const h=await mapHarness(),b=h.plan('B');const pa=h.view.setMap('A'),pb=h.view.setMap('B');h.rejectMap('A','old map failed');assert.equal(await pa,false);assert.equal(h.view.map,'0');assert.equal(h.view.isWalkable(0,0),undefined);
 h.resolveMap('B',b);assert.equal(await pb,true);assert.equal(h.view.map,'B');
 pass('obsolete manifest failure resolves as cancelled while the latest request stays pending');
}
{
 const h=await mapHarness(),old=h.plan('A',{width:1}),latest=h.plan('A',{width:2,tile:2});const pa=h.view.setMap('A'),pb=h.view.setMap('A');
 const first=h.next('/maps/A/map.json'),second=h.next('/maps/A/map.json');second.resolve({ok:true,json:async()=>latest.world});assert.equal(await pb,true);first.resolve({ok:true,json:async()=>old.world});assert.equal(await pa,false);
 assert.equal(h.view.width,2);assert.deepEqual(h.urls(),['/libraries/Tiles/Tiles-2.png']);
 pass('same map ID requests still have independent tokens and the older dimensions cannot return');
}
{
 const h=await mapHarness(),a=h.plan('A',{holdChunk:true}),b=h.plan('B',{tile:1,blocked:true});const pa=h.view.setMap('A');h.resolveMap('A',a);await settle();assert.equal(h.view.isWalkable(0,0),undefined);
 const pb=h.view.setMap('B');h.resolveMap('B',b);assert.equal(await pb,true);h.next('/maps/A/A.bin').resolve({ok:true,arrayBuffer:async()=>a.data});assert.equal(await pa,false);
 assert.equal(h.view.map,'B');assert.equal(h.view.isWalkable(0,0),false);assert.equal(h.loads.some(value=>value.url==='/libraries/Tiles/Tiles-0.png'),false);
 pass('late chunks from an older map cannot publish collision cells or start its texture loads');
}
{
 const h=await mapHarness(),a=h.plan('A',{animation:2}),b=h.plan('B',{tile:1});const url='/libraries/Tiles/Tiles-0.png';h.heldTextures.add(url);
 const pa=h.view.setMap('A');h.resolveMap('A',a);await settle();const allocated=h.scenes.filter(scene=>scene!==h.view.app.stage&&scene!==h.view.depth&&!scene.parent&&!scene.destroyed);
 const actor=new h.Scene();h.view.depth.addChild(actor);const pb=h.view.setMap('B');h.resolveMap('B',b);assert.equal(await pb,true,'B must not wait for the obsolete A texture');
 h.resolveTexture(url);assert.equal(await pa,false);assert.deepEqual(h.urls(),['/libraries/Tiles/Tiles-1.png']);assert.equal(actor.destroyed,false);assert.ok(allocated.every(scene=>scene.destroyed));assert.ok(h.textures.every(value=>!value.destroyed));
 for(const tick of h.view.app.ticker.callbacks)tick();
 pass('new map bypasses an old texture queue and late animated sprites are destroyed without shared texture or actor disposal');
}
{
 const h=await mapHarness(),a=h.plan('A'),b=h.plan('B',{tile:1});const url='/libraries/Tiles/Tiles-0.png';h.heldTextures.add(url);
 const pa=h.view.setMap('A');h.resolveMap('A',a);await settle();const pb=h.view.setMap('B');h.resolveMap('B',b);assert.equal(await pb,true);const status=h.status.textContent;
 h.rejectTexture(url,'stale texture failed');assert.equal(await pa,false);assert.equal(h.status.textContent,status);h.heldTextures.delete(url);
 const retry=h.view.setMap('A');h.resolveMap('A',a);assert.equal(await retry,true);assert.equal(h.loads.filter(value=>value.url===url).length,2);
 pass('obsolete texture failure cannot replace the scene and its failed cache entry can be retried');
}
{
 const h=await mapHarness(),a=h.plan('A',{holdChunk:true});const attempt=h.view.setMap('A');h.resolveMap('A',a);await settle();h.next('/maps/A/A.bin').reject(new Error('current chunk failed'));await assert.rejects(attempt,/current chunk failed/);assert.equal(h.view.isWalkable(0,0),undefined);
 const retry=h.view.setMap('A');h.resolveMap('A',a);await settle();h.next('/maps/A/A.bin').resolve({ok:true,arrayBuffer:async()=>a.data});assert.equal(await retry,true);assert.equal(h.view.isWalkable(0,0),true);
 pass('current chunk failures stay observable and retry loads fresh bytes before exposing walkability');
}
{
 const h=await mapHarness(),a=h.plan('A',{animation:2});const tile='/libraries/Tiles/Tiles-0.png',object='/libraries/Objects/Objects-1.png';h.heldTextures.add(tile);h.heldTextures.add(object);
 const attempt=h.view.setMap('A');h.resolveMap('A',a);await settle();h.rejectTexture(tile,'current texture failed');await assert.rejects(attempt,/current texture failed/);
 h.resolveTexture(object);await settle();assert.deepEqual(h.urls(),[]);assert.ok(h.scenes.filter(scene=>scene._texture?.url?.includes('Objects-')).every(scene=>scene.destroyed));
 h.heldTextures.clear();const retry=h.view.setMap('A');h.resolveMap('A',a);assert.equal(await retry,true);
 pass('render rejection cleans partial sprites and remaining asset promises cannot write into destroyed sprites');
}
{
 const h=await mapHarness(),a=h.plan('A');const oldCenter=h.view.setCenter(0,0),pa=h.view.setMap('A');assert.equal(await h.view.setDoor(0,0,false),false);assert.equal(h.view.isWalkable(0,0),undefined);await oldCenter;
 h.resolveMap('A',a);assert.equal(await pa,true);assert.equal(h.view.isWalkable(0,0),false);
 await h.view.setDoor(0,0,true);assert.equal(h.view.isWalkable(0,0),true,'an authoritative open event must override the static map collision');
 await h.view.setDoor(0,0,false);assert.equal(h.view.isWalkable(0,0),false,'a later close event must restore the blocked tile');
 pass('door events during map loading use the requested map and authoritative open/close transitions override static collision');
}
{
 const h=await mapHarness(),a=h.plan('A',{width:2});
 for(let x=0;x<2;x++){const offset=x*12,cells=new DataView(a.data);cells.setUint16(offset,0,true);cells.setUint16(offset+4,(x+1)|0x8000,true);cells.setUint8(offset+6,0x81);cells.setUint8(offset+7,0x02+x);}
 const attempt=h.view.setMap('A');h.resolveMap('A',a);assert.equal(await attempt,true);
 assert.deepEqual(h.urls().sort(),['/libraries/Objects/Objects-0.png','/libraries/Objects/Objects-1.png']);
 assert.equal(h.view.isWalkable(0,0),false);assert.equal(h.view.isWalkable(1,0),false);
 await h.view.setDoor(0,0,true);
 assert.deepEqual(h.urls().sort(),['/libraries/Objects/Objects-2.png','/libraries/Objects/Objects-4.png']);
 assert.equal(h.view.isWalkable(0,0),true);assert.equal(h.view.isWalkable(1,0),true);
 await h.view.setDoor(0,0,false);
 assert.deepEqual(h.urls().sort(),['/libraries/Objects/Objects-0.png','/libraries/Objects/Objects-1.png']);
 assert.equal(h.view.isWalkable(0,0),false);assert.equal(h.view.isWalkable(1,0),false);
 pass('native door group bytes select the closed/open frame range and update every linked collision cell without diagnostic overlays');
}
{
 const h=await mapHarness(),b=h.plan('B');const pb=h.view.setMap('B');await assert.rejects(h.view.setMap('../A'),/地图编号无效/);h.resolveMap('B',b);assert.equal(await pb,true);assert.equal(h.view.map,'B');
 pass('invalid map IDs cannot cancel an already valid request');
}
{
 const h=await mapHarness(),a=h.plan('A',{width:100,height:100,fill:false}),attempt=h.view.setMap('A');h.resolveMap('A',a);assert.equal(await attempt,true);
 const settleRender=async()=>{for(let i=0;i<4;i++)await settle();};
 await h.view.setCenter(50,50);h.view.moveCenter(47,50,0,0);await settleRender();assert.match(h.status.textContent,/地图 A · 47, 50/,'horizontal panning must refresh before the visible edge leaves the loaded cells');
 await h.view.setCenter(50,50);h.view.moveCenter(50,44,0,0);await settleRender();assert.match(h.status.textContent,/地图 A · 50, 44/,'upward panning must account for the viewport height, not a fixed center margin');
 await h.view.setCenter(50,50);h.view.moveCenter(50,63,0,0);await settleRender();assert.match(h.status.textContent,/地图 A · 50, 63/,'downward panning must refresh before its visible edge reaches the loaded window');
 pass('viewport-aware prefetch refreshes the map before horizontal, upper, or lower screen edges can uncover unloaded cells');
}
{
 const h=await mapHarness(),a=h.plan('A',{width:100,height:100,fill:false}),cells=new DataView(a.data);cells.setUint16((50*100+50)*12,1,true);
 const attempt=h.view.setMap('A');h.resolveMap('A',a);assert.equal(await attempt,true);
 const tile='/libraries/Tiles/Tiles-0.png';h.heldTextures.add(tile);const before=h.scenes.length,pending=h.view.setCenter(50,50);
 for(let i=0;i<4;i++)await settle();assert.ok(h.loads.some(load=>load.url===tile&&load.resolve),'the first viewport render must be waiting for its tile texture');
 h.view.moveCenter(48,50,0,0);h.view.moveCenter(46,50,0,0);h.view.moveCenter(44,50,0,0);h.resolveTexture(tile);
 await pending;assert.match(h.status.textContent,/地图 A · 44, 50/,'the coalesced render must settle on the newest movement center');
 assert.ok(h.scenes.length-before<=14,'one active pass plus one latest-center follow-up should be allocated instead of one pass per movement packet');
 pass('movement packets during a delayed map texture load coalesce into one latest-center follow-up render');
}

const file=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.ES2022,true),listeners=[];
function walk(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.getText(file)==='active.addEventListener'&&node.arguments[0]?.text==='message')listeners.push(node.arguments[1]);ts.forEachChild(node,walk);}walk(file);assert.equal(listeners.length,1);
const listenerCode=compile(`globalThis.receive=${listeners[0].getText(file)};`);
function playHarness(){
 const maps=[],mini=[],errors=[],calls=[],doors=[],moves=[];let sequence=0;const socket={readyState:1};
 const context={exports:{},socket,active:socket,WebSocket:{OPEN:1},lastSequence:0,mapGeneration:0,currentMap:'0',mapReady:Promise.resolve(),worldReady:true,reconnectAttempts:0,armCurrentAuthWait:undefined,waitForResponse:()=>{},self:undefined,doorRetry:undefined,pendingAction:undefined,clickDestination:undefined,
  agentObserver:{event(){}},classicAuth:{hide(){}},document:{body:{classList:{add(){}}}},clearWorld:()=>calls.push('clear'),npcSession:{reset(){}},classicHud:{beginMap(){},position(){}},connection:{textContent:''},
  view:{width:20,height:10,setMap:id=>{const load={id,...deferred()};maps.push(load);return load.promise;},setDoor:(x,y,open)=>{doors.push({x,y,open});return Promise.resolve();}},
  minimap:{setMap:(id,width,height)=>{const load={id,width,height,...deferred()};mini.push(load);return load.promise;}},console:{error:(...args)=>errors.push(args)}
 };
 installPlayUiContext(context);vm.runInContext(listenerCode,context);
 return {context,maps,mini,errors,calls,doors,moves,sendMessage:(message,generation=0)=>context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:generation,message})}),
  send:(id,generation=sequence+1)=>{context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:generation,message:{type:'map',map:id}})});return context.mapReady;},
  error:message=>vm.runInContext(`new Error(${JSON.stringify(message)})`,context)};
}
{
 const h=playHarness(),pa=h.send('A',1);const pb=h.send('B',2);h.maps[1].resolve(true);await settle();assert.deepEqual(h.mini.map(load=>load.id),['B']);h.mini[0].resolve();await pb;assert.equal(h.context.worldReady,true);
 h.maps[0].resolve(true);await pa;assert.deepEqual(h.mini.map(load=>load.id),['B']);assert.equal(h.context.currentMap,'B');assert.equal(h.context.worldReady,true);
 pass('actual play message callback only shows the latest map after reversed successful completions');
}
{
 const h=playHarness(),pa=h.send('A',1);const pb=h.send('B',2),status=h.context.connection.textContent;
 h.maps[0].reject(h.error('old failure'));await pa;assert.equal(h.context.worldReady,false);assert.equal(h.context.connection.textContent,status);assert.equal(h.errors.length,0);
 h.maps[1].resolve(true);await settle();h.mini[0].resolve();await pb;assert.equal(h.context.worldReady,true);
 pass('actual play stale failure cannot release world input or replace the current loading status');
}
{
 const h=playHarness(),pa=h.send('A',3);const pb=h.send('A',3);h.maps[0].resolve(true);await pa;assert.equal(h.mini.length,0);assert.equal(h.context.worldReady,false);
 h.maps[1].resolve(true);await settle();assert.equal(h.mini.length,1);h.mini[0].resolve();await pb;assert.equal(h.context.worldReady,true);
 pass('actual play promise identity rejects same-target same-generation duplicate request completion');
}
{
 for(const change of [h=>{h.context.socket={readyState:1};},h=>{h.context.active.readyState=3;},h=>{h.context.mapGeneration++;},h=>{h.context.currentMap='B';}]){
  const h=playHarness(),pending=h.send('A',1);change(h);h.maps[0].resolve(true);await pending;assert.equal(h.mini.length,0);assert.equal(h.context.worldReady,false);
 }
 pass('actual play guards socket replacement, closed socket, generation and target at asynchronous completion');
}
{
 const h=playHarness(),pa=h.send('A',1);h.maps[0].resolve(true);await settle();const pb=h.send('B',2);
 h.mini[0].resolve();await pa;assert.equal(h.context.worldReady,false);h.maps[1].resolve(true);await settle();h.mini[1].resolve();await pb;assert.equal(h.context.worldReady,true);
 pass('late miniature-map completion cannot release input for the next map');
}
{
 const h=playHarness(),pa=h.send('A',1);h.maps[0].resolve(true);await settle();const pb=h.send('B',2),status=h.context.connection.textContent;
 h.mini[0].reject(h.error('old miniature failure'));await pa;assert.equal(h.context.worldReady,false);assert.equal(h.context.connection.textContent,status);assert.equal(h.errors.length,0);
 h.maps[1].reject(h.error('current failure'));await pb;assert.equal(h.context.worldReady,false);assert.equal(h.context.connection.textContent,'current failure');assert.equal(h.errors.length,1);
 pass('old miniature failure is silent while current map failure remains visible with input gated');
}
{
 const h=playHarness(),pending=h.send('A',1);h.maps[0].resolve(false);await pending;assert.equal(h.mini.length,0);assert.equal(h.context.worldReady,false);
 pass('cancelled production setMap result never enables input even if the other play guards still match');
}
{
 const h=playHarness(),actor={id:9,x:10,y:10,self:true,dead:false};h.context.self=9;h.context.entities=new Map([[9,actor]]);h.context.sendMovement=(who,dx,dy,run)=>{h.moves.push({id:who.id,dx,dy,run});return true;};
 h.context.doorRetry={x:11,y:10,direction:3,run:true};h.sendMessage({type:'door',x:11,y:10,open:true},-1);
 assert.deepEqual(h.doors,[],'an event from an older map generation must not change the current door');assert.equal(h.context.doorRetry.x,11);assert.equal(h.moves.length,0);
 h.sendMessage({type:'door',x:11,y:10,open:true},0);
 assert.deepEqual(h.doors,[{x:11,y:10,open:true}]);assert.deepEqual(h.moves,[{id:9,dx:1,dy:0,run:true}]);assert.equal(h.context.doorRetry,undefined);
 h.context.doorRetry={x:11,y:10,direction:3,run:false};h.sendMessage({type:'door',x:11,y:10,open:false},0);
 assert.equal(h.doors.at(-1).open,false);assert.equal(h.moves.length,1,'a close event must not retry movement');assert.equal(h.context.clickDestination,undefined);
 pass('production door events reject stale generations, open the matching collision cell and resume the blocked step once');
}

{
 const h=await mapHarness(),plan=h.plan('CAM',{width:700,height:700,fill:false}),attempt=h.view.setMap('CAM');h.resolveMap('CAM',plan);await attempt;
 await h.view.setCenter(338,264);
 assert.equal(h.view.app.stage.x,366-338*48);assert.equal(h.view.app.stage.y,192-264*32);
 assert.equal(h.view.cellAtScreen(366,192).x,338);assert.equal(h.view.cellAtScreen(366,192).y,264);
 assert.equal(h.view.cellAtScreen(413,223).x,338);assert.equal(h.view.cellAtScreen(413,223).y,264);
 assert.equal(h.view.cellAtScreen(365,191).x,337);assert.equal(h.view.cellAtScreen(365,191).y,263);
 h.view.moveCenter(339,265,600,0);h.tick(300);
 assert.equal(h.view.app.stage.x,366-338.5*48);assert.equal(h.view.app.stage.y,192-264.5*32);
 assert.equal(h.view.cellAtScreen(366,192).x,338);assert.equal(h.view.cellAtScreen(366,192).y,264);
 h.tick(600);assert.equal(h.view.app.stage.x,366-339*48);assert.equal(h.view.app.stage.y,192-265*32);
 assert.equal(h.view.cellAtScreen(366,192).x,339);assert.equal(h.view.cellAtScreen(366,192).y,265);
 await h.view.setCenter(0,0);assert.equal(h.view.app.stage.x,366);assert.equal(h.view.app.stage.y,192);
 assert.equal(h.view.cellAtScreen(0,0).x,-8);assert.equal(h.view.cellAtScreen(0,0).y,-6);
 pass('measured native camera anchor controls stationary, interpolated, settled and edge screen-to-cell mapping');
}
{
 const h=await mapHarness(),plan=h.plan('CAM',{width:100,height:100,fill:false}),attempt=h.view.setMap('CAM');h.resolveMap('CAM',plan);await attempt;
 const settleRender=async()=>{for(let i=0;i<4;i++)await settle();};
 await h.view.setCenter(50,50);h.view.moveCenter(51,50,0,0);await settleRender();assert.match(h.status.textContent,/地图 CAM · 51, 50/);
 await h.view.setCenter(50,50);h.view.moveCenter(50,60,0,0);await settleRender();assert.match(h.status.textContent,/地图 CAM · 50, 60/);
 pass('off-center camera prefetch uses the larger right and lower viewport margins');
}
{
 const inputContext={exports:{}};vm.createContext(inputContext);vm.runInContext(compile(read('apps/web/src/movement-model.ts')),inputContext);
 const move= file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='continuePointerRun');assert.ok(move);
 const sent=[],actor={id:7,x:338,y:264},context={WORLD_VIEW:actualJson('content/classic-176/world-view.json'),
  rightPointer:{clientX:260,clientY:114},pendingAction:undefined,self:7,entities:new Map([[7,actor]]),
  view:{app:{canvas:{getBoundingClientRect:()=>({left:20,top:10,width:400,height:300})}}},
  screenDirection:inputContext.exports.screenDirection,directions:[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],
  sendMovement:(...args)=>{sent.push(args);return true;},connection:{textContent:''}};
 vm.createContext(context);vm.runInContext(compile(move.getText(file)+'; continuePointerRun();'),context);
 assert.equal(context.rightPointer.direction,2);assert.deepEqual(sent[0],[actor,1,0,true,2]);
 pass('production pointer running uses the measured cell center at half scale, avoiding the previous northeast misdirection');
}
assert.equal(groups,24);
